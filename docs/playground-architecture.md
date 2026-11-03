# Tint* の実装

[資料一覧](README.md) · [使い方](reference/usage.ja.md)

## 起動方法

| 方法 | 関連ファイル | Ceruneの処理 |
| --- | --- | --- |
| Tauri | `src/backend-tauri.ts` / `src-tauri/` | RustからCerune CLIを起動 |
| ローカルHTTP | `src/backend-http.ts` / `tint-server/` | HTTPから`core/`を呼び出す |
| ブラウザWASM | `src/backend-wasm.ts` / `experiments/wasm/` | ブラウザ内でCeruneライブラリを実行 |

`src/environment.ts`がTauri、WASM、`?server=...&token=...`付きのローカルHTTPを選択します。

## Cerune CLI

| 操作 | CLI |
| --- | --- |
| 編集中の診断 | `cerune check` |
| IR / MIR / SSA / Native LIR | `cerune observe --ssa --lir` |
| 各種生成物 | `cerune emit-c` / `emit-llvm` / `emit-qbe` / `emit-wat` / `emit-asm` / `emit-obj` / `emit-bytecode` |
| 実行 | `cerune run` / `run-mir` / `run-mir --ssa` / `run-vm` |
| importしたファイル | `cerune emit-sources` |

Emitでは実行しません。C ASM / LLVM ASMにClang、QBE ASMにQBEを使います。ObjectのSections / Symbols / RelocationsはTint*で読み取ります。

`src/origins.ts`は生成コードにあるNodeIdとUTF-8バイト位置を読んで元のソースの該当部分を選択します。

## TypeScriptのインターフェース

- `src/backend.ts`（`TintBackend`）: 診断、生成、実行、比較、モジュール読込、履歴操作
- `src/host.ts`（`TintHost`）: ファイルの開閉・保存、ウィンドウタイトル
- `src/capabilities.ts`: 各実行方法で使える項目を選択

WASM版の生成結果はSources / IR / Bytecode / WAT、実行はIR / MIR / VMです。ネイティブ生成、SSA、比較、モジュール読込、履歴は未対応です。

## ローカルHTTP

`tint-server/`は`127.0.0.1`で待ち受け、`/health`以外にはBearerトークンを要求します。環境変数`TINT_SERVER_PORT`と`TINT_SERVER_TOKEN`で設定できます。Tauriアプリでは同じプロセス内のスレッドで起動します。

`src/host-web.ts`はFile System Access APIを使い、利用できないブラウザではファイル選択・ダウンロードで代用します。

## ビルド

- デスクトップ: `npm run tauri dev` / `npm run tauri build`
- HTTP: `cargo run -p tint-server`
- WASM: `npm run build:pages`（`scripts/prepare-wasm.mjs`）
- GitHub Pages: `.github/workflows/pages.yml`（Ceruneとツールのバージョンを固定）

[開発手順](development.ja.md)
