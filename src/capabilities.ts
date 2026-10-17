import type { BackendCapabilities } from "./backend";
import type { ExecutionPath, OutputKind } from "./types";

/** すべての出力種別（UI の表示順ではない）。 */
export const ALL_OUTPUTS: OutputKind[] = [
  "sources",
  "ir",
  "mir",
  "ssa",
  "ssaMap",
  "ssaLowered",
  "ssaLoweredMap",
  "manifest",
  "c",
  "cAsm",
  "llvm",
  "llvmAsm",
  "wat",
  "qbe",
  "qbeAsm",
  "lir",
  "directAsm",
  "object",
  "bytecode",
  "irOutput",
  "mirOutput",
  "ssaOutput",
  "vmOutput",
  "cmpLir",
  "cmpDirectAsm",
  "cmpObject",
  "cmpLlvm",
  "cmpLlvmAsm",
  "cmpQbe",
  "cmpQbeAsm",
  "cmpCAsm",
  "modules",
];

/** すべての実行経路。 */
export const ALL_EXECUTION_PATHS: ExecutionPath[] = [
  "ir",
  "mir",
  "ssa",
  "vm",
];

export type OutputGroup =
  | "pipeline"
  | "backends"
  | "execution"
  | "compare"
  | "modules";

/** 各バックエンドタブが持つ出力。 */
export const BACKEND_OUTPUTS: Record<
  string,
  OutputKind[]
> = {
  c: ["c", "cAsm"],
  llvm: ["llvm", "llvmAsm"],
  qbe: ["qbe", "qbeAsm"],
  wasm: ["wat"],
  native: ["lir", "directAsm", "object"],
  vm: ["bytecode"],
};

const BACKEND_GROUPS: Partial<
  Record<OutputKind, OutputGroup>
> = {
  c: "backends",
  cAsm: "backends",
  llvm: "backends",
  llvmAsm: "backends",
  qbe: "backends",
  qbeAsm: "backends",
  wat: "backends",
  lir: "backends",
  directAsm: "backends",
  object: "backends",
  bytecode: "backends",
};

/** 出力が属するタブグループ。 */
export function groupForOutput(
  kind: OutputKind,
): OutputGroup {
  if (kind.startsWith("cmp")) {
    return "compare";
  }

  if (kind === "modules") {
    return "modules";
  }

  if (
    kind === "irOutput" ||
    kind === "mirOutput" ||
    kind === "ssaOutput" ||
    kind === "vmOutput"
  ) {
    return "execution";
  }

  return BACKEND_GROUPS[kind] ?? "pipeline";
}

/** 実行結果の出力から実行経路を求めます（実行系以外は null）。 */
export function executionPathForOutput(
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

function groupGate(
  group: OutputGroup,
  capabilities: BackendCapabilities,
): boolean {
  switch (group) {
    case "compare":
      return capabilities.compare;

    case "modules":
      return capabilities.modules;

    case "execution":
      return capabilities.execute;

    default:
      return capabilities.observe;
  }
}

/**
 * その出力をこのバックエンドが提供するか。
 * `outputs` / `executionPaths` 未指定は「すべて対応」とみなします。
 */
export function outputAvailable(
  kind: OutputKind,
  capabilities: BackendCapabilities,
): boolean {
  const group = groupForOutput(kind);

  if (!groupGate(group, capabilities)) {
    return false;
  }

  if (
    capabilities.outputs &&
    !capabilities.outputs.includes(kind)
  ) {
    return false;
  }

  const path = executionPathForOutput(kind);

  if (
    path &&
    capabilities.executionPaths &&
    !capabilities.executionPaths.includes(path)
  ) {
    return false;
  }

  return true;
}

/** バックエンドタブに対応する出力が 1 つでも提供されるか。 */
export function backendAvailable(
  backend: string,
  capabilities: BackendCapabilities,
): boolean {
  const outputs = BACKEND_OUTPUTS[backend];

  if (!outputs) {
    return false;
  }

  return outputs.some((kind) =>
    outputAvailable(kind, capabilities),
  );
}

const UNAVAILABLE_SUFFIX =
  "Desktop 版（Tauri）またはローカル HTTP 版で利用できます。";

/** 非対応の理由（利用可能な代替手段を含む）。 */
export function unavailableReason(
  group: OutputGroup,
): string {
  switch (group) {
    case "compare":
      return `比較表示はこのバックエンドでは利用できません（ネイティブツールチェーンが必要です）。${UNAVAILABLE_SUFFIX}`;

    case "modules":
      return `モジュール解決（import）はこのバックエンドでは利用できません。${UNAVAILABLE_SUFFIX}`;

    case "execution":
      return `この実行経路はこのバックエンドでは利用できません。${UNAVAILABLE_SUFFIX}`;

    case "backends":
      return `このバックエンドの出力はこのバックエンドでは利用できません。${UNAVAILABLE_SUFFIX}`;

    default:
      return `この出力はこのバックエンドでは利用できません。${UNAVAILABLE_SUFFIX}`;
  }
}
