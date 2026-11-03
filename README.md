<div align="center">

# Tint*

日本語 | [English](README.en.md)

Tint* は [Cerune](https://github.com/Cerune-Lang/Cerune) のコード生成と実行結果を観察するビジュアルツールです。

[ブラウザで試す](https://tint.hokutaka.dev/) · [使い方](docs/reference/usage.ja.md) · [開発手順](docs/development.ja.md) · [技術資料](docs/README.md)

![Tint* の画面](images/image.png)

</div>

## まず試す

[ブラウザ版](https://tint.hokutaka.dev/)はインストール不要です。CeruneをWebAssemblyで実行するため、ネイティブコード生成やターゲット比較は利用できません。

デスクトップ版を開発する場合は、[Cerune CLIとTauriの開発環境](docs/development.ja.md)を用意してください。

```sh
git clone https://github.com/Cerune-Lang/Tint-St.git
cd Tint-St
npm ci
npm run tauri dev
```

## 機能

- **観測:** Cerune IR / MIR / SSA、C、LLVM IR、QBE IR、WAT、x86-64 ASM、Object、Bytecode
- **実行:** IR / MIR / SSA / VMを選んで実行
- **比較:** WindowsとLinux向け生成結果、ソース位置と生成コード、保存した出力との差分

ブラウザ版とデスクトップ版では利用できる機能が異なります。[使い方とショートカット](docs/reference/usage.ja.md)

## 資料

[ドキュメント一覧](docs/README.md) · [実装](docs/playground-architecture.md)

## ライセンス

[MIT](LICENSE-MIT) または [Apache-2.0](LICENSE-APACHE)。
