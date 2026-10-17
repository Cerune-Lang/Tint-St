# Cerune Playground アーキテクチャ設計

本ドキュメントは、Tint\* の UI を将来的にブラウザ上で動作させる
「Cerune Playground」の設計方針をまとめたものです。

**重要: 本ドキュメントは設計のみを扱います。Playground の実装は
まだ開始していません。** ここに記載された内容は提案であり、現時点の
デスクトップ版の挙動を変更するものではありません。

## 1. 目的

- 同じフロントエンド（`index.html` + `src/*.ts`）を、デスクトップ
  （Tauri）とブラウザの双方で再利用できるようにする。
- バックエンドの差（Tauri IPC / ローカル HTTP / ブラウザ WASM）を、
  フロントエンドから見えない形で吸収する。
- 各バックエンドが「何を提供できるか」を宣言し、UI は提供可能な
  機能だけを有効化する。

## 2. スコープ

対象:

- フロントエンドと Cerune コンパイラをつなぐ層の設計。
- 3 種類のバックエンド方式の比較と機能差。

非目標:

- Cerune 本体の変更（リポジトリ `D:\ws\projects\Cerune` は読み取り専用）。
- 実行バックエンドの並列化（B 方式の性能最適化）。
- 本フェーズでの Playground 実装そのもの。

## 3. 現状のアーキテクチャ（デスクトップ版）

```
┌─────────────────────────────┐
│ index.html (CodeMirror 6)   │
│ src/main.ts                 │
│   ├─ src/backend.ts (IF)    │  ← フロントはここにのみ依存
│   ├─ src/host.ts    (IF)    │
│   └─ src/backend-tauri.ts   │  ← 唯一の Tauri 依存点
└──────────────┬──────────────┘
               │ invoke()
┌──────────────▼──────────────┐
│ src-tauri/src/lib.rs        │  Tauri コマンド
│   └─ cerune_cli/*           │  cerune / clang / qbe / llvm を起動
└──────────────┬──────────────┘
               │ プロセス起動
        ┌──────▼──────┐
        │ cerune CLI  │
        └─────────────┘
```

- ビルド: Vite + TypeScript、UI は CodeMirror 6。
- フロントエンドは `TintBackend`（観測・実行）と `TintHost`
  （ファイル入出力・ウィンドウ）の 2 つのインターフェースに依存する。
- Tauri 依存は `src/backend-tauri.ts` に集約済み（`src/main.ts` から
  `@tauri-apps/*` の import は撤去済み）。
- Rust 側は `cerune` CLI を子プロセスとして起動し、標準出力を解析する。

### Rust 側のコマンド

| コマンド | 役割 |
| --- | --- |
| `check_source` | 構文・意味検査（診断） |
| `emit_all` | 観測バンドル生成（SSA/LIR/…） |
| `execute` | 実行（IR/MIR/SSA/VM） |
| `compare_targets` | 複数バックエンド出力の比較 |
| `load_modules` | import グラフの解決 |
| `save_snapshot` / `list_snapshots` / `read_snapshot` / `delete_snapshot` | スナップショット履歴 |
| `diff_text` | 行差分 |
| `rename_source` | ソースファイル名変更 |

## 4. 三つのバックエンド方式

### A. Tauri IPC（現行・デスクトップ）

- 概要: 既存実装。Rust 側で `cerune` とネイティブツールを直接起動する。
- 必要作業: なし（`createTauriBackend()` / `createTauriHost()` が担当）。
- 長所: 全機能が利用可能。ネイティブツール（clang / qbe / llvm）と
  ファイルシステムにそのままアクセスできる。
- 短所: Tauri が動作する OS でのみ利用可能。インストールが必要。

### B. ローカル HTTP サーバー

- 概要: Rust 側（または `cerune` をラップした小さなサーバー）を
  HTTP で公開し、ブラウザから `fetch` する。デスクトップ版とほぼ同じ
  ロジックをヘッドレスで再利用できる。
- 必要作業:
  - Rust 側に HTTP ハンドラを追加（既存の `cerune_cli` をそのまま呼ぶ）。
  - フロントエンドに `createHttpBackend()` を追加。
  - `TintHost` はブラウザ API（File System Access API 等）で実装。
- 長所: ブラウザ UI をほぼ無改修で再利用可能。ネイティブ機能も維持。
- 短所: ローカルにサーバーを起動する必要がある。オリジン/ポートの
  取り扱い、プロセス管理が必要。

### C. ブラウザ WASM

- 概要: Cerune を WebAssembly にビルドし、ブラウザ内で完結実行する。
- 前提・制約:
  - Cerune は単一クレート（`cerune-lang`, edition 2024）で
    外部依存が無いため、WASM 化の下地は良い。
  - ただし現状バイナリは `src/main.rs`（bin ターゲット）。ブラウザから
    呼ぶには **Cerune 側にライブラリ API（lib ターゲット / 公開関数）が
    必要**。これは Cerune 側の対応が前提であり、Tint 側では実装できない。
  - ネイティブツール（clang / qbe / llvm）とファイルシステムに依存する
    機能は提供できない。
- 必要作業:
  - Cerune がライブラリ API を公開していることを確認/調整する。
  - `wasm-bindgen` などでラッパを作成し、`createWasmBackend()` を追加。
- 長所: サーバー不要。完全にブラウザ内で完結。
- 短所: 提供できる機能が限定的。ビルド工程が増える。

## 5. 共通バックエンド API

フロントエンドは以下の 2 つのインターフェースにのみ依存します
（`src/backend.ts`, `src/host.ts`）。

### `TintBackend`

| メソッド | 戻り値 | 対応コマンド |
| --- | --- | --- |
| `capabilities()` | `BackendCapabilities` | — |
| `check(source, sourcePath)` | `Diagnostic[]` | `check_source` |
| `observe(args)` | `ObservationResult` | `emit_all` |
| `execute(args)` | `ExecutionResult` | `execute` |
| `compare(args)` | `string` | `compare_targets` |
| `loadModules(source, sourcePath)` | `ModuleFile[]` | `load_modules` |
| `saveSnapshot(input)` | `SnapshotMeta` | `save_snapshot` |
| `listSnapshots()` | `SnapshotMeta[]` | `list_snapshots` |
| `readSnapshot(id)` | `Snapshot` | `read_snapshot` |
| `deleteSnapshot(id)` | `void` | `delete_snapshot` |
| `diff(args)` | `string` | `diff_text` |
| `renameSource(path, newName)` | `string` | `rename_source` |

### `TintHost`

| メソッド | 役割 |
| --- | --- |
| `openSource()` | ソースを開く（パス or `null`） |
| `saveSource(defaultPath)` | 名前を付けて保存（パス or `null`） |
| `readText(path)` | テキスト読み込み |
| `writeText(path, text)` | テキスト書き込み |
| `setTitle(title)` | ウィンドウタイトル変更 |

### `BackendCapabilities`

| フィールド | UI 上の対応 |
| --- | --- |
| `check` | 診断（linter） |
| `observe` | Emit ボタン / Pipeline グループ |
| `execute` | Execution グループ |
| `compare` | Compare グループ |
| `modules` | Modules グループ |
| `snapshots` | スナップショット操作 |
| `rename` | ファイル名変更 |

UI は `applyCapabilities()` で、**提供できない機能だけを無効化**します。
Tauri 版は全フィールドが `true` のため、現行 UI は変化しません。

## 6. 機能マトリクス

| 機能 | A: Tauri IPC | B: ローカル HTTP | C: ブラウザ WASM |
| --- | --- | --- | --- |
| 構文検査 (`check`) | ○ | ○ | △ (要 lib API) |
| import 解決 (`modules`) | ○ | ○ | △ (要 lib API) |
| 観測バンドル (`observe`, SSA/LIR…) | ○ | ○ | △ (要 lib API、native SSA は不可) |
| 実行 (`execute`, IR/MIR/SSA/VM) | ○ | ○ | △ (VM のみ等の制限) |
| 比較 (`compare`, clang/qbe/llvm) | ○ | ○ | × (ネイティブ前提) |
| オブジェクト生成 | ○ | ○ | × (ネイティブ前提) |
| スナップショット | ○ | ○ | ○ (ブラウザ保存に置換可) |
| ファイル入出力 | ○ (ネイティブ) | ○ (ブラウザ API) | ○ (ブラウザ API) |

凡例: ○=提供可 / △=条件付き / ×=提供不可。

## 7. 制約事項

- **Cerune は変更しない。** 必要な変更は Cerune 側の issue として提案する。
- 観測バンドルの統一形式は Cerune issue **#60** が既に追跡しているため、
  重複 issue を作成しない。
- WASM 版は Cerune のライブラリ API 公開が前提。Tint だけでは完結しない。
- ファイル入出力はホストごとに API が異なる（ネイティブ vs ブラウザ）。
- 既存 UI と挙動を維持する。機能差は「無効化」でのみ表現する。

## 8. セキュリティ

- **方式 B（ローカル HTTP）**
  - 待ち受けは `127.0.0.1` に限定し、外部公開しない。
  - 起動ごとに一時トークンを発行し、リクエストで検証する。
  - 許可オリジンを明示し、CORS を最小化する。
  - 子プロセス（clang / qbe / llvm）の実行はタイムアウトとヒープ上限で
    制限する。
- **方式 C（ブラウザ WASM）**
  - サンドボックス内で実行されるためホストへの影響は限定的。
  - 入力サイズと実行時間に上限を設け、暴走を防ぐ。
- **共通**
  - ソースコードはユーザーのローカル環境に留め、外部送信しない。

## 9. 段階的な実装計画（提案）

| フェーズ | 内容 | 状態 |
| --- | --- | --- |
| 0 | フロントエンドのバックエンド抽象化 (`TintBackend`/`TintHost`) | 完了 |
| 1 | 方式 B: Rust に HTTP ハンドラを追加し `createHttpBackend()` を実装 | 未着手 |
| 2 | 方式 B: ブラウザ用 `TintHost` と Web ビルド手順を追加 | 未着手 |
| 3 | 方式 C: Cerune の lib API 状況を調査し、WASM ラッパを試作 | 未着手 |
| 4 | 方式 C: `createWasmBackend()` と機能制限の検証 | 未着手 |
| 5 | 3 バックエンドの統合テストとドキュメント整備 | 未着手 |

各フェーズは独立して段階的に進められるよう設計しています。フェーズ 1
以降の要否・優先度は別途判断します。

## 10. 現時点の実装状況

- 完了: フェーズ 0（フロントエンドの抽象化）。デスクトップ版の挙動は
  従来どおり。
- 未実装: 方式 B（ローカル HTTP）および方式 C（ブラウザ WASM）は
  **未実装**。本ドキュメントはその設計提案です。
