/**
 * ホスト環境（OS のファイル入出力やウィンドウ操作）の抽象です。
 * Tauri 版はネイティブダイアログとファイルシステム、Web 版は
 * File System Access API やダウンロードなどで実装します。
 */
export interface TintHost {
  openSource(): Promise<string | null>;

  saveSource(
    defaultPath: string | null,
  ): Promise<string | null>;

  readText(path: string): Promise<string>;

  writeText(
    path: string,
    text: string,
  ): Promise<void>;

  setTitle(title: string): Promise<void>;
}
