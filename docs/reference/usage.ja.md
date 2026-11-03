# Tint* の使い方

[English](usage.en.md) · [README](../../README.md)

## 起動

[ブラウザ版](https://tint.hokutaka.dev/)はCeruneのWASM版で実行します。デスクトップ版はCerune CLIをインストールして `npm run tauri dev` で起動します。

[開発手順](../development.ja.md)

## 画面

| 項目 | 操作 |
| --- | --- |
| Emit | Ceruneのコード生成結果を取得（ソースは実行しない） |
| Pipeline | Sources、IR、MIR、SSA、SSA Map、SSA→MIR、Manifest |
| Backends | C、LLVM、QBE、WAT、Native LIR / ASM / Object、VM Bytecode |
| Execution | IR / MIR / SSA / VMを一つ選んで実行 |
| Compare | Windows x64 / Linux x86-64の生成結果を比較 |
| Modules | `import`したCeruneファイルを表示 |
| Snapshot / History | 出力を保存し、現在の生成結果と比較 |

## ショートカット

| キー | 操作 |
| --- | --- |
| `Ctrl+Enter` | Emit |
| `Ctrl+O` | 開く |
| `Ctrl+S` | 保存 |
| `Ctrl+Shift+S` | 名前を付けて保存 |
| `Ctrl+G` | 指定行へ移動 |

## ネイティブ生成

- **Target:** `x86_64-pc-windows-msvc` または `x86_64-unknown-linux-gnu`
- **Origins:** 生成コードのNodeIdとUTF-8バイト位置を表示し、元のCeruneソースへ移動
- **Native SSA:** SSAを経由してNative LIR / ASM / Objectを生成
- **Object:** COFF / ELFのSections、Symbols、Origin Symbols、Relocationsを表示
- **str heap / arr heap:** Ceruneに渡すヒープ上限を指定

C ASMとLLVM ASMにはClang、QBE ASMにはQBEを使います。

## ブラウザ版の制限

WASM版で利用できるのは、Sources・IR・Bytecode・WATの表示とIR / MIR / VMの実行です。ネイティブ生成、SSA、Compare、Modules、Snapshotは利用できません。

ローカルHTTP版ではCerune CLIと外部ツールを使えます。[接続手順](../development.ja.md#ローカルhttp版)
