import type {
  Diagnostic,
  ExecutionPath,
  ExecutionResult,
  ModuleFile,
  ObservationResult,
  OutputKind,
  Snapshot,
  SnapshotMeta,
  Target,
} from "./types";

/**
 * バックエンドがどの機能を提供できるかを表します。
 * UI はこれを見て、利用可能な機能だけを有効化します。
 */
export interface BackendCapabilities {
  check: boolean;
  observe: boolean;
  execute: boolean;
  compare: boolean;
  modules: boolean;
  snapshots: boolean;
  rename: boolean;

  /**
   * 対応している出力種別。未指定の場合はすべて対応とみなします。
   * ネイティブツールチェーンに依存する出力（LLVM / QBE / LIR / Object など）
   * を区別するために使います。
   */
  outputs?: OutputKind[];

  /** 対応している実行経路。未指定の場合はすべて対応とみなします。 */
  executionPaths?: ExecutionPath[];

  /**
   * ネイティブツールチェーン依存の設定（target / origins / native SSA）が
   * 使えるか。未指定は `true` とみなします。
   */
  native?: boolean;

  /** ヒープ上限（string / array）設定が効くか。未指定は `true` とみなします。 */
  heapLimits?: boolean;
}

export interface ObserveArgs {
  source: string;
  sourcePath: string | null;
  target: Target;
  annotateOrigins: boolean;
  nativeSsa: boolean;
  stringHeapLimit: string | null;
  arrayHeapLimit: string | null;
}

export interface ExecuteArgs {
  source: string;
  sourcePath: string | null;
  path: ExecutionPath;
  stringHeapLimit: string | null;
  arrayHeapLimit: string | null;
}

export interface CompareArgs {
  source: string;
  sourcePath: string | null;
  kind: string;
  annotateOrigins: boolean;
  nativeSsa: boolean;
  stringHeapLimit: string | null;
  arrayHeapLimit: string | null;
}

export interface SnapshotInput {
  label: string;
  target: string;
  source: string;
  outputs: Record<string, string>;
}

export interface DiffArgs {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
}

/**
 * Cerune の変換を扱うバックエンドの共通インターフェースです。
 * フロントエンドはこの型にのみ依存し、Tauri IPC / HTTP / WASM などの
 * 実装差をここで吸収します。
 */
export interface TintBackend {
  capabilities(): Promise<BackendCapabilities>;

  check(
    source: string,
    sourcePath: string | null,
  ): Promise<Diagnostic[]>;

  observe(
    args: ObserveArgs,
  ): Promise<ObservationResult>;

  execute(
    args: ExecuteArgs,
  ): Promise<ExecutionResult>;

  compare(args: CompareArgs): Promise<string>;

  loadModules(
    source: string,
    sourcePath: string | null,
  ): Promise<ModuleFile[]>;

  saveSnapshot(
    input: SnapshotInput,
  ): Promise<SnapshotMeta>;

  listSnapshots(): Promise<SnapshotMeta[]>;

  readSnapshot(id: string): Promise<Snapshot>;

  deleteSnapshot(id: string): Promise<void>;

  diff(args: DiffArgs): Promise<string>;

  renameSource(
    path: string,
    newName: string,
  ): Promise<string>;
}
