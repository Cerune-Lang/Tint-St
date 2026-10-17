/**
 * 実行環境の判定結果です。
 *
 * - `http`: ブラウザからローカル HTTP サーバー（`tint-server`）に接続する。
 * - `tauri`: デスクトップ版（Tauri IPC）として実行する。
 * - `wasm`: ブラウザ内の WASM 版 Cerune を直接利用する。
 */
export type EnvironmentKind =
  | {
      kind: "http";
      serverUrl: string;
      token: string;
    }
  | {
      kind: "tauri";
    }
  | {
      kind: "wasm";
    };

/**
 * URL のクエリ文字列と Tauri 実行の有無から実行環境を判定します。
 *
 * `?server=<url>&token=<token>` が揃っていればローカル HTTP 版、
 * そうでなければ Tauri 版（`isTauri` が真）かブラウザ WASM 版を選びます。
 * 純粋関数なのでテストできます。
 */
export function detectEnvironment(
  search: string,
  isTauri: boolean,
): EnvironmentKind {
  const params = new URLSearchParams(search);

  const serverUrl = params.get("server");
  const token = params.get("token");

  if (serverUrl && token) {
    return {
      kind: "http",
      serverUrl,
      token,
    };
  }

  if (isTauri) {
    return { kind: "tauri" };
  }

  return { kind: "wasm" };
}

/**
 * Tauri ランタイム上で動いているかを判定します。
 * ブラウザ（Pages など）では `false` になります。
 */
export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}
