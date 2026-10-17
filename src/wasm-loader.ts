import type { WasmModule } from "./backend-wasm";

/**
 * Vite の `public/` に配置された wasm-bindgen のグルーコードのパスです。
 *
 * `document.baseURI` を基準に解決するため、GitHub Pages のサブパス配下でも
 * 正しく読み込めます。実際の `.wasm` は `npm run build:wasm` で生成し、
 * ビルド時に `public/wasm/` へ配置します。
 */
export const WASM_MODULE_PATH = "wasm/tint_wasm.js";

/**
 * wasm-bindgen（`--target web`）のグルーコードを読み込み、初期化した
 * モジュールを返します。初期化に失敗した場合は例外を送出します。
 */
export async function loadWasmModule(
  baseUrl: string,
): Promise<WasmModule> {
  const url = new URL(
    WASM_MODULE_PATH,
    baseUrl,
  ).href;

  const glue = await import(
    /* @vite-ignore */ url
  );

  await glue.default();

  return glue as WasmModule;
}
