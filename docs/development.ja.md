# Tint* の開発

[English](development.en.md) · [README](../README.md)

## 必要なもの

- Node.js / npm、Rust / Cargo
- [Tauri v2の開発環境](https://v2.tauri.app/start/prerequisites/)（デスクトップ版）
- [Cerune CLI](https://github.com/Cerune-Lang/Cerune)（デスクトップ・ローカルHTTP版）

Cerune CLIをソースからインストールする場合：

```sh
git clone https://github.com/Cerune-Lang/Cerune.git
cd Cerune
cargo install --path .
cerune --version
```

Cerune本体を更新した後は `cargo install --path . --force` でCLIを再インストールします。

## デスクトップ

```sh
git clone https://github.com/Cerune-Lang/Tint-St.git
cd Tint-St
npm ci
npm run tauri dev
```

アプリのビルドは `npm run tauri build` です。

## テスト

```sh
npm test
cargo check
cargo test
```

`cargo test -p tint-core --test cerune_cli_integration`はCerune CLIを使います。CLIがない環境では対応する統合テストがスキップされます。

## ClangとQBE

C ASMとLLVM ASMには `clang`、QBE ASMには `qbe` を使います。WindowsではWSL経由でQBEを起動します。未導入の場合、対応する出力は`unavailable`となります。

## ローカルHTTP版

デスクトップアプリは同じプロセス内でHTTPサーバーを起動します。単独で動かす場合：

```sh
cargo run -p tint-server
npm run build
npm run preview
```

`tint-server`が表示する`base_url`と`token`を、ブラウザのURLに `?server=<base_url>&token=<token>` として渡します。サーバーは `127.0.0.1` だけで待ち受けます。トークンを公開しないでください。

## ブラウザWASM版

`experiments/wasm`は兄弟ディレクトリのCeruneを参照します。

```text
workspace/
├── Cerune/
└── Tint-St/
```

`wasm32-unknown-unknown`ターゲットと`wasm-pack`をインストールし、Tint-Stで：

```sh
npm ci
npm run build:pages
npm run test:wasm
```

GitHub Pagesのビルド設定は[pages.yml](../.github/workflows/pages.yml)を参照してください。
