import {
  EditorView,
} from "@codemirror/view";

import {
  Compartment,
  type EditorState,
} from "@codemirror/state";

import {
  lintGutter,
  linter,
} from "@codemirror/lint";

import {
  minimalSetup,
} from "codemirror";

import {
  createTauriBackend,
  createTauriHost,
} from "./backend-tauri";

import { createHttpBackend } from "./backend-http";

import { createWebHost } from "./host-web";

import { detectEnvironment } from "./environment";

import type {
  BackendCapabilities,
  TintBackend,
} from "./backend";

import type { TintHost } from "./host";

import {
  ceruneHighlighting,
  ceruneLanguage,
} from "./cerune-language";

import {
  buildByteToChar,
  charRangeForBytes,
  isInstructionLine,
  parseOriginAnnotations,
  type OriginAnnotation,
} from "./origins";

import {
  directoryOf,
  normalizePath,
  parseImports,
} from "./imports";

import { diagnosticOffsets } from "./diagnostics";

import {
  readSettings,
  writeSettings,
  type Settings,
} from "./settings";

import type {
  Diagnostic,
  ExecutionPath,
  ModuleFile,
  OpenFile,
  OutputKind,
  SnapshotMeta,
  Target,
} from "./types";

const environment = detectEnvironment(
  window.location.search,
);

const backend: TintBackend =
  environment.kind === "http"
    ? createHttpBackend({
        baseUrl: environment.serverUrl,
        token: environment.token,
      })
    : createTauriBackend();

const host: TintHost =
  environment.kind === "http"
    ? createWebHost()
    : createTauriHost();

const outputs: Record<
  OutputKind,
  string
> = {
  sources: "",
  ir: "",
  mir: "",
  ssa: "",

  ssaMap: "",
  ssaLowered: "",
  ssaLoweredMap: "",
  manifest: "",

  c: "",
  cAsm: "",

  llvm: "",
  llvmAsm: "",

  wat: "",

  qbe: "",
  qbeAsm: "",

  lir: "",

  directAsm: "",
  object: "",

  bytecode: "",

  irOutput: "",
  mirOutput: "",
  ssaOutput: "",
  vmOutput: "",

  cmpLir: "",
  cmpDirectAsm: "",
  cmpObject: "",
  cmpLlvm: "",
  cmpLlvmAsm: "",
  cmpQbe: "",
  cmpQbeAsm: "",
  cmpCAsm: "",

  modules: "",
};

const initialSource = `integer: i64 = 1 + 2;
single: f32 = 0.1 + 0.2;
double: f64 = 0.1 + 0.2;
inferred: infer = single + single;

print(integer);
print(single);
print(double);
print(inferred);`;

let activeOutput: OutputKind = "ir";
let activeGroup = "pipeline";
let activeBackend = "c";
let currentPath: string | null = null;

const openFiles = new Map<string, OpenFile>();

let untitledText = initialSource;

let loadedModules: ModuleFile[] | null = null;

let sourceView:
  | EditorView
  | null = null;

function selectedTarget(): Target {
  const element =
    document.querySelector<HTMLSelectElement>(
      "#target-select",
    );

  if (!element) {
    throw new Error(
      "target selector not found",
    );
  }

  return element.value as Target;
}

function sourceText(): string {
  if (!sourceView) {
    throw new Error(
      "source editor not initialized",
    );
  }

  return sourceView.state.doc.toString();
}

function outputElement(): HTMLElement {
  const element =
    document.querySelector<HTMLElement>(
      "#output",
    );

  if (!element) {
    throw new Error(
      "output view not found",
    );
  }

  return element;
}

function setStatus(
  text: string,
  state:
    | "ready"
    | "working"
    | "error" = "ready",
) {
  const statusText =
    document.querySelector<HTMLElement>(
      "#status-text",
    );

  const statusDot =
    document.querySelector<HTMLElement>(
      "#status-dot",
    );

  if (statusText) {
    statusText.textContent = text;
  }

  if (statusDot) {
    statusDot.dataset.state = state;
  }
}

function setDiagnosticStatus(
  count: number | null,
) {
  const element =
    document.querySelector<HTMLElement>(
      "#diagnostic-count",
    );

  if (!element) {
    return;
  }

  if (count === null) {
    element.textContent = "";
    element.dataset.state = "unknown";
    return;
  }

  if (count === 0) {
    element.textContent = "No problems";
    element.dataset.state = "ok";
    return;
  }

  element.textContent =
    count === 1
      ? "1 problem"
      : `${count} problems`;

  element.dataset.state = "error";
}

function executionPathForOutput(
  kind: OutputKind,
): ExecutionPath | null {
  switch (kind) {
    case "irOutput":
      return "ir";

    case "mirOutput":
      return "mir";

    case "ssaOutput":
      return "ssa";

    case "vmOutput":
      return "vm";

    default:
      return null;
  }
}

function compareKindForOutput(
  kind: OutputKind,
): string | null {
  switch (kind) {
    case "cmpLir":
      return "lir";

    case "cmpDirectAsm":
      return "directAsm";

    case "cmpObject":
      return "object";

    case "cmpLlvm":
      return "llvm";

    case "cmpLlvmAsm":
      return "llvmAsm";

    case "cmpQbe":
      return "qbe";

    case "cmpQbeAsm":
      return "qbeAsm";

    case "cmpCAsm":
      return "cAsm";

    default:
      return null;
  }
}

interface OriginLine {
  span: HTMLSpanElement;
  start: number;
  end: number;
}

let currentOriginLines: OriginLine[] = [];

function renderOutput(
  kind: OutputKind,
  text: string,
) {
  const container = outputElement();

  container.textContent = "";

  currentOriginLines = [];

  const navigable =
    kind === "llvm" || kind === "directAsm";

  if (!navigable || !text.includes("cerune-origin:")) {
    container.textContent = text;
    return;
  }

  const annotations =
    parseOriginAnnotations(text);

  if (annotations.length === 0) {
    container.textContent = text;
    return;
  }

  const byteToChar = buildByteToChar(
    sourceText(),
  );

  const byLine = new Map(
    annotations.map((annotation) => [
      annotation.line,
      annotation,
    ]),
  );

  const lines = text.split("\n");

  const fragment =
    document.createDocumentFragment();

  let last: OriginAnnotation | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    const span = document.createElement("span");

    span.textContent = line;

    span.className = "output-line";

    const annotation = byLine.get(index);

    if (annotation) {
      last = annotation;
    }

    if (last && isInstructionLine(line)) {
      const { from: start, to: end } =
        charRangeForBytes(
          byteToChar,
          last.start,
          last.end,
        );

      span.classList.add("origin");

      span.dataset.from = String(start);

      span.dataset.to = String(end);

      span.title =
        `node ${last.node} · bytes ${last.start}..${last.end}`;

      currentOriginLines.push({
        span,
        start,
        end,
      });
    }

    fragment.append(span);

    fragment.append(document.createTextNode("\n"));
  }

  container.append(fragment);

  updateOriginHighlight();
}

function updateOriginHighlight() {
  if (
    currentOriginLines.length === 0 ||
    !sourceView
  ) {
    return;
  }

  const head =
    sourceView.state.selection.main.head;

  for (const entry of currentOriginLines) {
    if (!entry.span.isConnected) {
      continue;
    }

    entry.span.classList.toggle(
      "highlight",
      head >= entry.start && head <= entry.end,
    );
  }
}

function jumpToOrigin(element: HTMLElement) {
  if (!sourceView) {
    return;
  }

  const from = Number(element.dataset.from);

  const to = Number(element.dataset.to);

  if (!Number.isFinite(from)) {
    return;
  }

  const doc = sourceView.state.doc;

  const anchor = Math.min(
    Math.max(from, 0),
    doc.length,
  );

  const head = Math.min(
    Math.max(
      Number.isFinite(to) ? to : anchor,
      anchor,
    ),
    doc.length,
  );

  sourceView.dispatch({
    selection: { anchor, head },
    scrollIntoView: true,
  });

  sourceView.focus();
}

function showOutput(
  kind: OutputKind,
) {
  activeOutput = kind;

  document
    .querySelectorAll<HTMLButtonElement>(
      ".tab",
    )
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.output === kind,
      );
    });

  const output = outputs[kind];

  if (kind === "modules") {
    renderModules();
    return;
  }

  if (output) {
    renderOutput(kind, output);
    return;
  }

  currentOriginLines = [];

  outputElement().textContent =
    executionPathForOutput(kind)
      ? "Press Run to execute this path."
      : "Press Emit to generate code.";
}

function showBackend(
  backend: string,
) {
  if (activeGroup !== "backends") {
    return;
  }

  activeBackend = backend;


  document
    .querySelectorAll<HTMLButtonElement>(
      ".backend-tab",
    )
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.backend === backend,
      );
    });

  const tabs =
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '.tab[data-group="backends"]',
      ),
    );

  tabs.forEach((button) => {
    button.hidden =
      button.dataset.backend !== backend;
  });

  const activeTab =
    tabs.find(
      (button) =>
        button.dataset.backend === backend &&
        button.dataset.output === activeOutput,
    );

  if (activeTab) {
    return;
  }

  const firstTab =
    tabs.find(
      (button) =>
        button.dataset.backend === backend,
    );

  if (firstTab?.dataset.output) {
    showOutput(
      firstTab.dataset.output as OutputKind,
    );
  }
}

function showGroup(
  group: string,
) {
  activeGroup = group;

  const emitButton =
    document.querySelector<HTMLButtonElement>(
      "#emit-button",
    );

  const runButton =
    document.querySelector<HTMLButtonElement>(
      "#run-button",
    );

  if (emitButton) {
    emitButton.hidden =
      group === "execution";
  }

  if (runButton) {
    runButton.hidden =
      group !== "execution";
  }

  const backendGroups =
    document.querySelector<HTMLElement>(
      ".backend-groups",
    );

  if (backendGroups) {
    backendGroups.hidden =
      group !== "backends";
  }

  document
    .querySelectorAll<HTMLButtonElement>(
      ".group-tab",
    )
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.group === group,
      );
    });

  const tabs =
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        ".tab",
      ),
    );

  if (group === "backends") {
    tabs.forEach((button) => {
      button.hidden =
        button.dataset.group !== "backends" ||
        button.dataset.backend !== activeBackend;
    });

    showBackend(activeBackend);
    return;
  }

  tabs.forEach((button) => {
    button.hidden =
      button.dataset.group !== group;
  });

  const firstTab =
    tabs.find(
      (button) =>
        button.dataset.group === group,
    );

  if (firstTab?.dataset.output) {
    showOutput(
      firstTab.dataset.output as OutputKind,
    );
  }
}

function annotateOrigins(): boolean {
  const element =
    document.querySelector<HTMLInputElement>(
      "#origins-toggle",
    );

  if (!element) {
    throw new Error(
      "origins toggle not found",
    );
  }

  return element.checked;
}

function nativeSsa(): boolean {
  const element =
    document.querySelector<HTMLInputElement>(
      "#native-ssa-toggle",
    );

  return element?.checked ?? false;
}

function heapLimit(
  selector: string,
): string | null {
  const element =
    document.querySelector<HTMLInputElement>(
      selector,
    );

  if (!element) {
    return null;
  }

  const value = element.value.trim();

  return value.length > 0 ? value : null;
}

function heapArgs(): {
  stringHeapLimit: string | null;
  arrayHeapLimit: string | null;
} {
  return {
    stringHeapLimit: heapLimit(
      "#string-heap-limit",
    ),
    arrayHeapLimit: heapLimit(
      "#array-heap-limit",
    ),
  };
}

function currentSettings(): Settings {
  return {
    target: selectedTarget(),
    origins: annotateOrigins(),
    nativeSsa: nativeSsa(),
    wrap: wrapEnabled(),
    stringHeapLimit:
      heapLimit("#string-heap-limit") ?? "",
    arrayHeapLimit:
      heapLimit("#array-heap-limit") ?? "",
  };
}

function saveSettings() {
  writeSettings(currentSettings());
}

function applySettings(
  settings: Partial<Settings>,
) {
  if (settings.target) {
    const select =
      document.querySelector<HTMLSelectElement>(
        "#target-select",
      );

    if (select) {
      select.value = settings.target;
    }
  }

  if (typeof settings.origins === "boolean") {
    const toggle =
      document.querySelector<HTMLInputElement>(
        "#origins-toggle",
      );

    if (toggle) {
      toggle.checked = settings.origins;
    }
  }

  if (typeof settings.nativeSsa === "boolean") {
    const toggle =
      document.querySelector<HTMLInputElement>(
        "#native-ssa-toggle",
      );

    if (toggle) {
      toggle.checked = settings.nativeSsa;
    }
  }

  if (typeof settings.wrap === "boolean") {
    const toggle =
      document.querySelector<HTMLInputElement>(
        "#wrap-toggle",
      );

    if (toggle) {
      toggle.checked = settings.wrap;
    }
  }

  applyWrap();

  if (typeof settings.stringHeapLimit === "string") {
    const input =
      document.querySelector<HTMLInputElement>(
        "#string-heap-limit",
      );

    if (input) {
      input.value = settings.stringHeapLimit;
    }
  }

  if (typeof settings.arrayHeapLimit === "string") {
    const input =
      document.querySelector<HTMLInputElement>(
        "#array-heap-limit",
      );

    if (input) {
      input.value = settings.arrayHeapLimit;
    }
  }
}

function bindSettingsPersistence() {
  const selectors = [
    "#target-select",
    "#origins-toggle",
    "#native-ssa-toggle",
    "#wrap-toggle",
    "#string-heap-limit",
    "#array-heap-limit",
  ];

  selectors.forEach((selector) => {
    const element =
      document.querySelector(selector);

    if (!element) {
      return;
    }

    element.addEventListener(
      "change",
      saveSettings,
    );

    element.addEventListener(
      "input",
      saveSettings,
    );
  });
}

function setEditorText(text: string) {
  sourceView?.dispatch({
    changes: {
      from: 0,
      to: sourceView.state.doc.length,
      insert: text,
    },
  });
}

function refreshFileTabs() {
  const container =
    document.querySelector<HTMLElement>(
      "#file-tabs",
    );

  if (!container) {
    return;
  }

  container.textContent = "";

  const entries: OpenFile[] = [];

  if (currentPath === null) {
    entries.push({
      path: "",
      name: "Untitled.ceru",
      text: "",
    });
  }

  for (const file of openFiles.values()) {
    entries.push(file);
  }

  for (const file of entries) {
    const key = file.path;

    const button =
      document.createElement("button");

    button.type = "button";

    button.className = "file-tab";

    button.classList.toggle(
      "active",
      (currentPath ?? "") === key,
    );

    const label =
      document.createElement("span");

    label.textContent = file.name;

    button.append(label);

    if (key !== "") {
      const close =
        document.createElement("span");

      close.className = "file-tab-close";

      close.textContent = "×";

      close.title = "Close";

      close.addEventListener(
        "click",
        (event) => {
          event.stopPropagation();
          closeFile(key);
        },
      );

      button.append(close);
    }

    button.addEventListener("click", () => {
      switchToFile(key);
    });

    container.append(button);
  }
}

function switchToFile(key: string) {
  if (!sourceView) {
    return;
  }

  const currentKey = currentPath ?? "";

  if (currentKey === key) {
    return;
  }

  if (currentKey === "") {
    untitledText = sourceText();
  } else {
    const file = openFiles.get(currentKey);

    if (file) {
      file.text = sourceText();
    }
  }

  if (key === "") {
    currentPath = null;

    setEditorText(untitledText);

    void updateFileName(null);
  } else {
    const file = openFiles.get(key);

    if (!file) {
      return;
    }

    currentPath = key;

    setEditorText(file.text);

    void updateFileName(key);
  }

  refreshFileTabs();
}

function closeFile(key: string) {
  if (!openFiles.has(key)) {
    return;
  }

  const wasActive = (currentPath ?? "") === key;

  openFiles.delete(key);

  if (wasActive) {
    const next = openFiles.keys().next();

    if (!next.done) {
      switchToFile(next.value);
    } else {
      currentPath = null;

      setEditorText(untitledText);

      void updateFileName(null);
    }
  }

  refreshFileTabs();
}

function openModule(module: ModuleFile) {
  openFiles.set(module.name, {
    path: module.name,
    name: fileNameFromPath(module.name),
    text: module.text,
  });

  switchToFile(module.name);
}

function renderModules() {
  const container = outputElement();

  container.textContent = "";

  currentOriginLines = [];

  if (!loadedModules) {
    container.textContent =
      "Press Emit to load modules.";
    return;
  }

  const byNormalized = new Map(
    loadedModules.map((module) => [
      normalizePath(module.name),
      module,
    ]),
  );

  const entryNormalized = currentPath
    ? normalizePath(currentPath)
    : null;

  const graph = document.createElement("div");

  graph.className = "module-graph";

  for (const module of loadedModules) {
    const item = document.createElement("div");

    item.className = "module-entry";

    const isEntry = entryNormalized
      ? normalizePath(module.name) ===
        entryNormalized
      : module.id === loadedModules[0].id;

    if (isEntry) {
      item.classList.add("entry");
    }

    const header =
      document.createElement("button");

    header.type = "button";

    header.className = "module-header";

    header.textContent =
      `${module.id}. ${fileNameFromPath(
        module.name,
      )}${isEntry ? " (entry)" : ""}`;

    header.title = module.name;

    header.addEventListener("click", () => {
      openModule(module);
    });

    item.append(header);

    const directory = directoryOf(
      normalizePath(module.name),
    );

    const imports = parseImports(module.text);

    if (imports.length === 0) {
      const empty =
        document.createElement("div");

      empty.className = "module-import empty";

      empty.textContent = "no imports";

      item.append(empty);
    } else {
      for (const entry of imports) {
        const target = byNormalized.get(
          normalizePath(
            `${directory}/${entry.path}`,
          ),
        );

        const row =
          document.createElement("button");

        row.type = "button";

        row.className = "module-import";

        row.classList.toggle(
          "resolved",
          Boolean(target),
        );

        row.textContent =
          `${entry.alias} ← ${entry.path}`;

        row.title = target
          ? target.name
          : "unresolved import";

        if (target) {
          row.addEventListener("click", () => {
            openModule(target);
          });
        }

        item.append(row);
      }
    }

    graph.append(item);
  }

  container.append(graph);
}

async function runLoadModules() {
  const button =
    document.querySelector<HTMLButtonElement>(
      "#emit-button",
    );

  if (button) {
    button.disabled = true;
  }

  setStatus("Loading modules…", "working");

  try {
    const files = await backend.loadModules(
      sourceText(),
      currentPath,
    );

    loadedModules = files;

    renderModules();

    setStatus(
      `Loaded ${files.length} module${
        files.length === 1 ? "" : "s"
      }`,
    );
  } catch (error) {
    outputElement().textContent = String(error);

    setStatus("Module error", "error");
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function openFile() {
  const path = await host.openSource();

  if (!path) {
    return;
  }

  const source = await host.readText(path);

  openFiles.set(path, {
    path,
    name: fileNameFromPath(path),
    text: source,
  });

  if ((currentPath ?? "") === path) {
    setEditorText(source);
  } else {
    switchToFile(path);
  }

  setStatus("Opened");
}

async function saveFile() {
  let path = currentPath;

  if (!path) {
    path = await host.saveSource(null);
  }

  if (!path) {
    return;
  }

  await host.writeText(
    path,
    sourceText(),
  );

  currentPath = path;

  openFiles.set(path, {
    path,
    name: fileNameFromPath(path),
    text: sourceText(),
  });

  await updateFileName(path);

  refreshFileTabs();

  setStatus("Saved");
}

async function runExecution() {
  if (activeGroup !== "execution") {
    setStatus(
      "Execution path is not selected",
      "error",
    );
    return;
  }

  const path =
    executionPathForOutput(
      activeOutput,
    );

  if (!path) {
    outputElement().textContent =
      `Invalid execution output: ${activeOutput}`;

    setStatus(
      "Execution path error",
      "error",
    );
    return;
  }

  const button =
    document.querySelector<HTMLButtonElement>(
      "#run-button",
    );

  if (button) {
    button.disabled = true;
  }

  setStatus(
    `Running ${path.toUpperCase()}…`,
    "working",
  );

  try {
    const result =
      await backend.execute({
        source: sourceText(),
        sourcePath: currentPath,
        path,
        ...heapArgs(),
      });

    outputs[activeOutput] =
      result.output;

    showOutput(activeOutput);

    setStatus("Ready");
  } catch (error) {
    outputElement().textContent =
      String(error);

    setStatus(
      "Execution error",
      "error",
    );
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function emit() {
  if (activeGroup === "compare") {
    await runCompare();
    return;
  }

  if (activeGroup === "modules") {
    await runLoadModules();
    return;
  }

  const button =
    document.querySelector<HTMLButtonElement>(
      "#emit-button",
    );

  if (button) {
    button.disabled = true;
  }

  setStatus(
    "Generating…",
    "working",
  );

  try {
    const result =
      await backend.observe({
        source: sourceText(),
        target: selectedTarget(),
        annotateOrigins: annotateOrigins(),
        nativeSsa: nativeSsa(),
        sourcePath: currentPath,
        ...heapArgs(),
      });

    Object.assign(outputs, result);

    showOutput(activeOutput);

    setStatus("Ready");
  } catch (error) {
    outputElement().textContent =
      String(error);

    setStatus(
      "Cerune error",
      "error",
    );
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function runCompare() {
  const kind =
    compareKindForOutput(activeOutput);

  if (!kind) {
    setStatus(
      "Comparison target is not selected",
      "error",
    );
    return;
  }

  const button =
    document.querySelector<HTMLButtonElement>(
      "#emit-button",
    );

  if (button) {
    button.disabled = true;
  }

  setStatus(
    "Comparing x64 targets…",
    "working",
  );

  try {
    const diff =
      await backend.compare({
        source: sourceText(),
        sourcePath: currentPath,
        kind,
        annotateOrigins: annotateOrigins(),
        nativeSsa: nativeSsa(),
        ...heapArgs(),
      });

    outputs[activeOutput] = diff;

    showOutput(activeOutput);

    setStatus("Ready");
  } catch (error) {
    outputElement().textContent =
      String(error);

    setStatus(
      "Comparison error",
      "error",
    );
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

function outputLabelForKind(
  kind: OutputKind,
): string {
  const button =
    document.querySelector<HTMLButtonElement>(
      `.tab[data-output="${kind}"]`,
    );

  return button?.textContent?.trim() || kind;
}

function selectedSnapshotId(): string {
  const element =
    document.querySelector<HTMLSelectElement>(
      "#snapshot-select",
    );

  return element?.value ?? "";
}

function updateSnapshotActions() {
  const button =
    document.querySelector<HTMLButtonElement>(
      "#snapshot-delete-button",
    );

  if (button) {
    button.disabled =
      selectedSnapshotId() === "";
  }
}

async function refreshSnapshots() {
  const select =
    document.querySelector<HTMLSelectElement>(
      "#snapshot-select",
    );

  if (!select) {
    return;
  }

  const previous = select.value;

  let metas: SnapshotMeta[] = [];

  try {
    metas =
      await backend.listSnapshots();
  } catch {
    metas = [];
  }

  select.innerHTML = "";

  const placeholder =
    document.createElement("option");

  placeholder.value = "";
  placeholder.textContent = "History…";

  select.append(placeholder);

  for (const meta of metas) {
    const option =
      document.createElement("option");

    option.value = meta.id;

    option.textContent =
      `${meta.label} · ${new Date(
        meta.createdAt,
      ).toLocaleTimeString()}`;

    select.append(option);
  }

  if (
    metas.some(
      (meta) => meta.id === previous,
    )
  ) {
    select.value = previous;
  }

  updateSnapshotActions();
}

async function saveSnapshot() {
  const target = selectedTarget();

  const targetElement =
    document.querySelector<HTMLSelectElement>(
      "#target-select",
    );

  const label =
    targetElement?.selectedOptions[0]
      ?.textContent?.trim() || target;

  const snapshotOutputs: Record<
    string,
    string
  > = {};

  for (const [key, value] of Object.entries(
    outputs,
  )) {
    if (value) {
      snapshotOutputs[key] = value;
    }
  }

  if (
    Object.keys(snapshotOutputs).length === 0
  ) {
    setStatus(
      "Nothing to snapshot",
      "error",
    );
    return;
  }

  try {
    await backend.saveSnapshot({
      label,
      target,
      source: sourceText(),
      outputs: snapshotOutputs,
    });

    await refreshSnapshots();

    setStatus("Snapshot saved");
  } catch (error) {
    setStatus(
      `Snapshot error: ${String(error)}`,
      "error",
    );
  }
}

async function showSnapshotDiff(id: string) {
  if (!id) {
    return;
  }

  try {
    const snapshot =
      await backend.readSnapshot(id);

    const label = outputLabelForKind(
      activeOutput,
    );

    const diff = await backend.diff({
      left:
        snapshot.outputs[activeOutput] ??
        "",
      right: outputs[activeOutput],
      leftLabel: `snapshot (${snapshot.label})`,
      rightLabel: "current",
    });

    outputElement().textContent =
      `# ${label}\n${diff}`;

    setStatus(
      `Diffing ${label} against snapshot`,
    );
  } catch (error) {
    outputElement().textContent =
      String(error);

    setStatus("Snapshot error", "error");
  }
}

async function deleteSelectedSnapshot() {
  const id = selectedSnapshotId();

  if (!id) {
    return;
  }

  try {
    await backend.deleteSnapshot(id);

    const select =
      document.querySelector<HTMLSelectElement>(
        "#snapshot-select",
      );

    if (select) {
      select.value = "";
    }

    await refreshSnapshots();

    setStatus("Snapshot deleted");
  } catch (error) {
    setStatus(
      `Snapshot error: ${String(error)}`,
      "error",
    );
  }
}

async function saveAsFile() {
  const path = await host.saveSource(
    currentPath ?? "Untitled.ceru",
  );

  if (!path) {
    return;
  }

  await host.writeText(
    path,
    sourceText(),
  );

  const previous = currentPath;

  currentPath = path;

  if (previous && previous !== path) {
    openFiles.delete(previous);
  }

  openFiles.set(path, {
    path,
    name: fileNameFromPath(path),
    text: sourceText(),
  });

  await updateFileName(path);

  refreshFileTabs();

  setStatus("Saved As");
}

function fileNameFromPath(
  path: string,
): string {
  return (
    path.split(/[\\/]/).pop()
    ?? path
  );
}

async function updateFileName(
  path: string | null,
) {
  const element =
    document.querySelector<HTMLButtonElement>(
      "#file-name",
    );

  if (!element) {
    return;
  }

  if (!path) {
    element.textContent =
      "Untitled.ceru";

    element.title =
      "Click to rename";

    await host.setTitle("Tint* Workspace");

    return;
  }

  const name =
    fileNameFromPath(path);

  element.textContent = name;
  element.title = path;

  await host.setTitle(`Tint* — ${name}`);
}

const ceruneLinter = linter(
  async (view) => {
    const source =
      view.state.doc.toString();

    let diagnostics: Diagnostic[] = [];

    try {
      diagnostics = await backend.check(
        source,
        currentPath,
      );
    } catch {
      setDiagnosticStatus(null);
      return [];
    }

    setDiagnosticStatus(diagnostics.length);

    const doc = view.state.doc;

    const lineLengths: number[] = [];

    for (let line = 1; line <= doc.lines; line += 1) {
      lineLengths.push(doc.line(line).length);
    }

    return diagnostics.map((diagnostic) => {
      const { from, to } = diagnosticOffsets(
        diagnostic,
        lineLengths,
      );

      return {
        from,
        to,
        severity: "error" as const,
        message: diagnostic.message,
      };
    });
  },
  { delay: 500 },
);

const wrapCompartment = new Compartment();

function wrapEnabled(): boolean {
  const element =
    document.querySelector<HTMLInputElement>(
      "#wrap-toggle",
    );

  return element?.checked ?? false;
}

function applyWrap() {
  sourceView?.dispatch({
    effects: wrapCompartment.reconfigure(
      wrapEnabled()
        ? EditorView.lineWrapping
        : [],
    ),
  });
}

function updateCursorPosition(
  state: EditorState,
) {
  const element =
    document.querySelector<HTMLElement>(
      "#cursor-position",
    );

  if (!element) {
    return;
  }

  const head = state.selection.main.head;

  const line = state.doc.lineAt(head);

  element.textContent =
    `${line.number}:${head - line.from + 1}`;
}

function goToLine() {
  if (!sourceView) {
    return;
  }

  const current =
    sourceView.state.doc.lineAt(
      sourceView.state.selection.main.head,
    ).number;

  const input = window.prompt(
    "Go to line",
    String(current),
  );

  if (input === null) {
    return;
  }

  const lineNumber = Number.parseInt(
    input.trim(),
    10,
  );

  if (!Number.isFinite(lineNumber)) {
    return;
  }

  const clamped = Math.min(
    Math.max(lineNumber, 1),
    sourceView.state.doc.lines,
  );

  const line =
    sourceView.state.doc.line(clamped);

  sourceView.dispatch({
    selection: { anchor: line.from },
    scrollIntoView: true,
  });

  sourceView.focus();
}

const editorTheme =
  EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "#ffffff",
      color: "#253746",
    },

    "&.cm-focused": {
      outline: "none",
    },

    ".cm-scroller": {
      fontFamily:
        '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
      fontSize: "13px",
      lineHeight: "1.7",
      overflow: "auto",
    },

    ".cm-content": {
      padding: "18px",
      caretColor: "#3983ad",
    },

    ".cm-line": {
      padding: "0",
    },

    ".cm-cursor": {
      borderLeftColor: "#3983ad",
    },

    ".cm-selectionBackground": {
      backgroundColor:
        "#dff3ff !important",
    },
  });

async function renameCurrentFile() {
  if (!currentPath) {
    return;
  }

  const oldName =
    fileNameFromPath(currentPath);

  const input =
    window.prompt(
      "Rename Cerune file",
      oldName,
    );

  if (input === null) {
    return;
  }

  let newName =
    input.trim();

  if (!newName) {
    return;
  }

  if (!newName.endsWith(".ceru")) {
    newName += ".ceru";
  }

  if (newName === oldName) {
    return;
  }

  try {
    const newPath =
      await backend.renameSource(
        currentPath,
        newName,
      );

    const oldPath = currentPath;

    currentPath = newPath;

    if (openFiles.has(oldPath)) {
      openFiles.delete(oldPath);

      openFiles.set(newPath, {
        path: newPath,
        name: fileNameFromPath(newPath),
        text: sourceText(),
      });
    }

    await updateFileName(newPath);

    refreshFileTabs();

    setStatus("Renamed");
  } catch (error) {
    setStatus(
      "Rename error",
      "error",
    );

    outputElement().textContent =
      String(error);
  }
}

function setGroupEnabled(
  group: string,
  enabled: boolean,
) {
  document
    .querySelectorAll<HTMLButtonElement>(
      `.group-tab[data-group="${group}"], ` +
        `.tab[data-group="${group}"]`,
    )
    .forEach((button) => {
      button.disabled = !enabled;
    });
}

function applyCapabilities(
  capabilities: BackendCapabilities,
) {
  setGroupEnabled(
    "compare",
    capabilities.compare,
  );

  setGroupEnabled(
    "modules",
    capabilities.modules,
  );

  setGroupEnabled(
    "execution",
    capabilities.execute,
  );

  const emitButton =
    document.querySelector<HTMLButtonElement>(
      "#emit-button",
    );

  if (emitButton) {
    emitButton.disabled =
      !capabilities.observe;
  }

  [
    "#snapshot-button",
    "#snapshot-select",
  ].forEach((selector) => {
    const element =
      document.querySelector<HTMLElement>(
        selector,
      );

    if (element) {
      element.toggleAttribute(
        "disabled",
        !capabilities.snapshots,
      );
    }
  });

  const fileName =
    document.querySelector<HTMLButtonElement>(
      "#file-name",
    );

  if (fileName) {
    fileName.disabled = !capabilities.rename;
  }
}

async function initCapabilities() {
  try {
    applyCapabilities(
      await backend.capabilities(),
    );
  } catch {
    // 機能フラグを取得できない場合は、既定（すべて有効）を維持します。
  }
}

window.addEventListener(
  "DOMContentLoaded",
  () => {
    const editorParent =
      document.querySelector<HTMLElement>(
        "#source-editor",
      );

    if (!editorParent) {
      throw new Error(
        "source editor container not found",
      );
    }

    sourceView = new EditorView({
      doc: initialSource,
      parent: editorParent,

      extensions: [
        minimalSetup,
        ceruneLanguage,
        ceruneHighlighting,
        ceruneLinter,
        lintGutter(),
        wrapCompartment.of([]),
        EditorView.updateListener.of(
          (update) => {
            if (
              update.selectionSet ||
              update.docChanged
            ) {
              updateCursorPosition(
                update.state,
              );

              updateOriginHighlight();
            }
          },
        ),
        editorTheme,
      ]
    });

    updateCursorPosition(sourceView.state);

    window.addEventListener(
      "keydown",
      (event) => {
        const modifier =
          event.ctrlKey ||
          event.metaKey;

        if (!modifier) {
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();

          void emit();
          return;
        }

        if (
          event.key.toLowerCase() === "o"
        ) {
          event.preventDefault();
          event.stopPropagation();

          void openFile();
          return;
        }

        if (
          event.key.toLowerCase() === "g"
        ) {
          event.preventDefault();
          event.stopPropagation();

          goToLine();
          return;
        }

        if (
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          event.stopPropagation();

          if (event.shiftKey) {
            void saveAsFile();
          } else {
            void saveFile();
          }
        }
      },
      true,
    );

    document
      .querySelector("#open-button")
      ?.addEventListener(
        "click",
        () => {
          void openFile();
        },
      );

    document
      .querySelector("#save-button")
      ?.addEventListener(
        "click",
        () => {
          void saveFile();
        },
      );

    document
      .querySelector("#emit-button")
      ?.addEventListener(
        "click",
        () => {
          void emit();
        },
      );

    document
      .querySelector("#run-button")
      ?.addEventListener(
        "click",
        () => {
          void runExecution();
        },
      );

    document
      .querySelector("#snapshot-button")
      ?.addEventListener(
        "click",
        () => {
          void saveSnapshot();
        },
      );

    document
      .querySelector("#wrap-toggle")
      ?.addEventListener(
        "change",
        () => {
          applyWrap();
        },
      );

    outputElement().addEventListener(
      "click",
      (event) => {
        const target = (
          event.target as HTMLElement
        )?.closest(
          ".output-line.origin",
        ) as HTMLElement | null;

        if (target) {
          jumpToOrigin(target);
        }
      },
    );

    document
      .querySelector("#snapshot-select")
      ?.addEventListener(
        "change",
        (event) => {
          updateSnapshotActions();

          const value = (
            event.target as HTMLSelectElement
          ).value;

          if (value) {
            void showSnapshotDiff(value);
          }
        },
      );

    document
      .querySelector(
        "#snapshot-delete-button",
      )
      ?.addEventListener(
        "click",
        () => {
          void deleteSelectedSnapshot();
        },
      );

    document
      .querySelectorAll<HTMLButtonElement>(
        ".tab",
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            showOutput(
              button.dataset
                .output as OutputKind,
            );
          },
        );
      });
      document
        .querySelectorAll<HTMLButtonElement>(
          ".group-tab",
        )
        .forEach((button) => {
          button.addEventListener(
            "click",
            () => {
              showGroup(
                button.dataset.group ??
                  "pipeline",
              );
            },
          );
        });
      document
      .querySelectorAll<HTMLButtonElement>(
        ".backend-tab",
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            showBackend(
              button.dataset.backend ?? "c",
            );
          },
        );
      });

showGroup("pipeline");

    document
      .querySelector("#file-name")
      ?.addEventListener(
        "click",
        () => {
          void renameCurrentFile();
        },
      );

    applySettings(readSettings());

    bindSettingsPersistence();

    void initCapabilities();

    void refreshSnapshots();

    refreshFileTabs();
  },
);
