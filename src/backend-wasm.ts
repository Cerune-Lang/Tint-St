import type {
  BackendCapabilities,
  ObserveArgs,
  TintBackend,
} from "./backend";

import type {
  Diagnostic,
  ExecutionResult,
  ObservationResult,
} from "./types";

/**
 * `experiments/wasm`（`wasm-bindgen`）が公開する関数群です。
 * 実際の `.wasm` をビルドしたモジュールを注入して使います。
 */
export interface WasmModule {
  capabilities(): string;

  check(source: string): string;

  emit_ir(source: string): string;

  emit_bytecode(source: string): string;

  emit_wat(source: string): string;

  execute(source: string, path: string): string;
}

function unsupported(name: string): never {
  throw new Error(
    `${name} is not supported by the wasm backend`,
  );
}

function observe(
  module: WasmModule,
  args: ObserveArgs,
): ObservationResult {
  return {
    sources: args.source,

    ir: module.emit_ir(args.source),

    bytecode: module.emit_bytecode(args.source),

    wat: module.emit_wat(args.source),

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
    qbe: "",
    qbeAsm: "",
    lir: "",
    directAsm: "",
    object: "",
  };
}

/**
 * ブラウザ内の Cerune（WASM）に接続するバックエンドです。
 *
 * ネイティブツールに依存する比較・オブジェクト生成・import 解決・
 * スナップショット・改名は提供しません。UI は `capabilities()` に従って
 * これらの機能を無効化します。
 */
export function createWasmBackend(
  module: WasmModule,
): TintBackend {
  return {
    capabilities: async () =>
      JSON.parse(
        module.capabilities(),
      ) as BackendCapabilities,

    check: async (source) =>
      JSON.parse(module.check(source)) as Diagnostic[],

    observe: async (args) => observe(module, args),

    execute: async (args): Promise<ExecutionResult> => ({
      output: module.execute(args.source, args.path),
    }),

    compare: async () => unsupported("compare"),

    loadModules: async () => unsupported("loadModules"),

    saveSnapshot: async () =>
      unsupported("saveSnapshot"),

    listSnapshots: async () =>
      unsupported("listSnapshots"),

    readSnapshot: async () =>
      unsupported("readSnapshot"),

    deleteSnapshot: async () =>
      unsupported("deleteSnapshot"),

    diff: async () => unsupported("diff"),

    renameSource: async () =>
      unsupported("renameSource"),
  };
}

/**
 * WASM モジュールの読み込みを遅延させたバックエンドです。
 *
 * ブラウザでは WASM の初期化が非同期のため、最初の呼び出し時に
 * `load()` を一度だけ実行します。初期化に失敗した場合は、各メソッドが
 * その例外をそのまま送出します。
 */
export function createDeferredWasmBackend(
  load: () => Promise<WasmModule>,
): TintBackend {
  let pending: Promise<TintBackend> | null = null;

  const resolve = () => {
    if (!pending) {
      pending = load().then(createWasmBackend);
    }

    return pending;
  };

  return {
    capabilities: async () =>
      (await resolve()).capabilities(),

    check: async (source, sourcePath) =>
      (await resolve()).check(source, sourcePath),

    observe: async (args) =>
      (await resolve()).observe(args),

    execute: async (args) =>
      (await resolve()).execute(args),

    compare: async (args) =>
      (await resolve()).compare(args),

    loadModules: async (source, sourcePath) =>
      (await resolve()).loadModules(source, sourcePath),

    saveSnapshot: async (input) =>
      (await resolve()).saveSnapshot(input),

    listSnapshots: async () =>
      (await resolve()).listSnapshots(),

    readSnapshot: async (id) =>
      (await resolve()).readSnapshot(id),

    deleteSnapshot: async (id) =>
      (await resolve()).deleteSnapshot(id),

    diff: async (args) =>
      (await resolve()).diff(args),

    renameSource: async (path, newName) =>
      (await resolve()).renameSource(path, newName),
  };
}
