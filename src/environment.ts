/**
 * 実行環境の判定結果です。
 *
 * - `http`: ブラウザからローカル HTTP サーバー（`tint-server`）に接続する。
 * - `tauri`: デスクトップ版（Tauri IPC）として実行する。
 */
export type EnvironmentKind =
  | {
      kind: "http";
      serverUrl: string;
      token: string;
    }
  | {
      kind: "tauri";
    };

/**
 * URL のクエリ文字列から実行環境を判定します。
 *
 * `?server=<url>&token=<token>` が揃っていればブラウザ版、それ以外は
 * デスクトップ版として扱います。純粋関数なのでテストできます。
 */
export function detectEnvironment(
  search: string,
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

  return { kind: "tauri" };
}
