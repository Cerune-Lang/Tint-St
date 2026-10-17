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
  open,
  save,
} from "@tauri-apps/plugin-dialog";

import {
  getCurrentWindow,
} from "@tauri-apps/api/window";

import {
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

import { invoke } from "@tauri-apps/api/core";

import {
  ceruneHighlighting,
  ceruneLanguage,
} from "./cerune-language";

type Target =
  | "x86_64-pc-windows-msvc"
  | "x86_64-unknown-linux-gnu";

type ExecutionPath =
  | "ir"
  | "mir"
  | "ssa"
  | "vm";

interface ExecutionResult {
  output: string;
}

type OutputKind =
  | "sources"
  | "ir"
  | "mir"
  | "ssa"
  | "ssaMap"
  | "ssaLowered"
  | "ssaLoweredMap"
  | "manifest"
  | "c"
  | "cAsm"
  | "llvm"
  | "llvmAsm"
  | "wat"
  | "qbe"
  | "qbeAsm"
  | "lir"
  | "directAsm"
  | "object"
  | "bytecode"
  | "irOutput"
  | "mirOutput"
  | "ssaOutput"
  | "vmOutput"
  | "cmpLir"
  | "cmpDirectAsm"
  | "cmpObject"
  | "cmpLlvm"
  | "cmpLlvmAsm"
  | "cmpQbe"
  | "cmpQbeAsm"
  | "cmpCAsm";

interface ObservationResult {
  sources: string;
  ir: string;
  mir: string;
  ssa: string;

  ssaMap: string;
  ssaLowered: string;
  ssaLoweredMap: string;
  manifest: string;

  c: string;
  cAsm: string;

  llvm: string;
  llvmAsm: string;

  wat: string;

  qbe: string;
  qbeAsm: string;

  lir: string;

  directAsm: string;
  object: string;

  bytecode: string;
}

interface SnapshotMeta {
  id: string;
  createdAt: number;
  label: string;
  target: string;
}

interface Snapshot {
  id: string;
  createdAt: number;
  label: string;
  target: string;
  source: string;
  outputs: Record<string, string>;
}

interface Diagnostic {
  line: number;
  column: number;
  message: string;
  severity: string;
}

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

  if (output) {
    outputElement().textContent = output;
    return;
  }

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

const settingsKey = "tint.settings";

interface Settings {
  target: Target;
  origins: boolean;
  nativeSsa: boolean;
  wrap: boolean;
  stringHeapLimit: string;
  arrayHeapLimit: string;
}

function readSettings(): Partial<Settings> {
  try {
    const raw =
      localStorage.getItem(settingsKey);

    if (!raw) {
      return {};
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (
      typeof parsed === "object" &&
      parsed !== null
    ) {
      return parsed as Partial<Settings>;
    }

    return {};
  } catch {
    return {};
  }
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
  try {
    localStorage.setItem(
      settingsKey,
      JSON.stringify(currentSettings()),
    );
  } catch {
    // 設定の保存に失敗しても観測は継続します。
  }
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

async function openFile() {
  const path = await open({
    multiple: false,
    filters: [
      {
        name: "Cerune",
        extensions: ["ceru"],
      },
    ],
  });

  if (!path || Array.isArray(path)) {
    return;
  }

  const source = await readTextFile(path);

  currentPath = path;

  sourceView?.dispatch({
    changes: {
      from: 0,
      to: sourceView.state.doc.length,
      insert: source,
    },
  });

  await updateFileName(path);
  setStatus("Opened");
}

async function saveFile() {
  let path = currentPath;

  if (!path) {
    path = await save({
      filters: [
        {
          name: "Cerune",
          extensions: ["ceru"],
        },
      ],
    });
  }

  if (!path) {
    return;
  }

  await writeTextFile(
    path,
    sourceText(),
  );

  currentPath = path;

  await updateFileName(path);
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
      await invoke<ExecutionResult>(
        "execute",
        {
          source: sourceText(),
          sourcePath: currentPath,
          path,
          stringHeapLimit: heapLimit(
            "#string-heap-limit",
          ),
          arrayHeapLimit: heapLimit(
            "#array-heap-limit",
          ),
        },
      );

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
      await invoke<ObservationResult>(
        "emit_all",
        {
          source: sourceText(),
          target: selectedTarget(),
          annotateOrigins: annotateOrigins(),
          nativeSsa: nativeSsa(),
          sourcePath: currentPath,
          stringHeapLimit: heapLimit(
            "#string-heap-limit",
          ),
          arrayHeapLimit: heapLimit(
            "#array-heap-limit",
          ),
        },
      );

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
      await invoke<string>(
        "compare_targets",
        {
          source: sourceText(),
          sourcePath: currentPath,
          kind,
          annotateOrigins: annotateOrigins(),
          nativeSsa: nativeSsa(),
          stringHeapLimit: heapLimit(
            "#string-heap-limit",
          ),
          arrayHeapLimit: heapLimit(
            "#array-heap-limit",
          ),
        },
      );

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
      await invoke<SnapshotMeta[]>(
        "list_snapshots",
      );
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
    await invoke("save_snapshot", {
      snapshot: {
        label,
        target,
        source: sourceText(),
        outputs: snapshotOutputs,
      },
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
      await invoke<Snapshot>(
        "read_snapshot",
        { id },
      );

    const label = outputLabelForKind(
      activeOutput,
    );

    const diff = await invoke<string>(
      "diff_text",
      {
        left:
          snapshot.outputs[activeOutput] ??
          "",
        right: outputs[activeOutput],
        leftLabel: `snapshot (${snapshot.label})`,
        rightLabel: "current",
      },
    );

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
    await invoke("delete_snapshot", { id });

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
  const path = await save({
    defaultPath:
      currentPath ?? "Untitled.ceru",

    filters: [
      {
        name: "Cerune",
        extensions: ["ceru"],
      },
    ],
  });

  if (!path) {
    return;
  }

  await writeTextFile(
    path,
    sourceText(),
  );

  currentPath = path;

  await updateFileName(path);

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

    await getCurrentWindow()
      .setTitle("Tint* Workspace");

    return;
  }

  const name =
    fileNameFromPath(path);

  element.textContent = name;
  element.title = path;

  await getCurrentWindow()
    .setTitle(`Tint* — ${name}`);
}

const ceruneLinter = linter(
  async (view) => {
    const source =
      view.state.doc.toString();

    let diagnostics: Diagnostic[] = [];

    try {
      diagnostics =
        await invoke<Diagnostic[]>(
          "check_source",
          {
            source,
            sourcePath: currentPath,
          },
        );
    } catch {
      setDiagnosticStatus(null);
      return [];
    }

    setDiagnosticStatus(diagnostics.length);

    return diagnostics.map((diagnostic) => {
      const lineNumber = Math.min(
        Math.max(diagnostic.line, 1),
        view.state.doc.lines,
      );

      const line =
        view.state.doc.line(lineNumber);

      const position = Math.min(
        line.from +
          Math.max(diagnostic.column - 1, 0),
        line.to,
      );

      const to = Math.min(
        position + 1,
        line.to,
      );

      return {
        from: position,
        to: Math.max(to, position),
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
      await invoke<string>(
        "rename_source",
        {
          path: currentPath,
          newName,
        },
      );

    currentPath = newPath;

    await updateFileName(newPath);

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

    void refreshSnapshots();
  },
);
