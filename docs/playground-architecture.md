# Cerune Playground アーキテクチャ設計

本ドキュメントは、Tint\* の UI を将来的にブラウザ上で動作させる
「Cerune Playground」の設計方針をまとめたものです。

**本ドキュメントは設計と実装状況を扱います。** Playground の実装は
フェーズ単位で進行中です（最新の状況は第 9・10 節を参照）。提案段階の
内容はデスクトップ版（Tauri）の挙動を変更しません。

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
- 起動時に URL クエリ（`?server=<url>&token=<token>`）で実行環境を判定する
  （`src/environment.ts`）。ブラウザ版は `createHttpBackend()` +
  `createWebHost()`、それ以外は Tauri 版を使う。
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

- 概要: Rust 側の小さな HTTP サーバー（`tint-server` クレート）が
  `core` の観測ロジックをそのまま呼び、ブラウザから `fetch` する。
  デスクトップ版とほぼ同じロジックをヘッドレスで再利用できる。
- 実装状況: サーバー本体と `createHttpBackend()` は実装済み。Tauri からの
  自動起動とブラウザ用 `TintHost` は未着手。
- エンドポイント（全経路で `Authorization: Bearer <token>` が必要。
  `GET /health` のみ公開）:

  | メソッド / パス | 役割 |
  | --- | --- |
  | `GET /health` | 死活確認 |
  | `GET /capabilities` | 機能フラグ |
  | `POST /check` / `POST /observe` | 解析・観測 |
  | `POST /execute` / `POST /compare` | 実行・比較 |
  | `POST /modules` / `POST /diff` / `POST /rename` | モジュール・差分・改名 |
  | `GET`・`POST /snapshots`, `GET`・`DELETE /snapshots/:id` | 履歴 |

- 待ち受け: `127.0.0.1` のみ。トークンは環境変数 `TINT_SERVER_TOKEN`、
  ポートは `TINT_SERVER_PORT`（既定は自動割り当て）。
- 長所: ブラウザ UI をほぼ無改修で再利用可能。ネイティブ機能も維持。
- 短所: ローカルにサーバーを起動する必要がある。オリジン/ポートの
  取り扱い、プロセス管理が必要。

### C. ブラウザ WASM

- 概要: Cerune を WebAssembly にビルドし、ブラウザ内で完結実行する。
- 調査結果（フェーズ 3）:
  - `cerune-lang` は `src/lib.rs` で `compile` / `compile_to_ir_text` /
    `compile_to_bytecode_text` / `compile_to_wat` / `run_ir` / `run_mir` /
    `run_vm` などのライブラリ API を**既に公開**している。
  - 外部依存はゼロで、`wasm32-unknown-unknown` へそのままビルドできる
    （試作で確認済み）。Cerune 側の変更は不要。
  - 提供できる機能: 構文・意味検査、IR / bytecode / WAT の生成、
    IR / MIR / VM 実行。ネイティブツール（clang / qbe / llvm）に依存する
    比較・オブジェクト生成・リンクは提供できない。import 解決と
    スナップショット / 改名も対象外。
- 試作: `experiments/wasm`（クレート名 `tint-wasm`）。
  - ルートの Cargo ワークスペースからは除外（`exclude`）し、単体で
    ビルドする独立クレート。
  - `cerune-lang` へは path 依存（`../../../Cerune`）。ローカルでは
    `Tint` と `Cerune` が同じ親ディレクトリにある兄弟配置を前提とする。
- ローカルでのビルド手順（検証済みのバージョン）:
  - Rust `1.98.0`（`wasm32-unknown-unknown` ターゲット）と
    `wasm-pack` `0.15.0` を使用する。
  - `npm run build:wasm`
    （実体: `wasm-pack build experiments/wasm --release --target web`）。
    `wasm-opt` 後に約 1.1 MB の `.wasm` が `experiments/wasm/pkg/` に
    生成される。
  - `npm run test:wasm` で host ネイティブのテストを実行できる。
  - 生成物（`pkg/`）はバージョン管理しない（`.gitignore` 済み）。
- 配布（CI）方針:
  - GitHub Actions で `Cerune-Lang/Cerune` を**タグ固定**
    （`v0.1.0` / `a93a4d5`）で別途チェックアウトし、ローカルと同じ
    `Tint` / `Cerune` の兄弟配置を再現して `wasm-pack` を実行する。
  - ツールチェーン（Rust / wasm-pack / Node）はバージョンを明示して
    再現性を確保する。
  - WASM 生成後に Vite でブラウザ版をビルドし、静的成果物を
    GitHub Pages へ配布する（Pages 用 base path を含む）。
  - 検証: ローカルで from-scratch ビルドが再現することを確認済み
    （`tint_wasm_bg.wasm` のサイズが一致）。
- 実装状況（フェーズ 4）:
  - `src/backend-wasm.ts` に `createWasmBackend(module)` を実装した。
    WASM モジュールは注入する形にし、`wasm-bindgen` のビルド成果物に
    依存しない。`check` / `observe` / `execute` を写像し、それ以外の
    機能は `capabilities()` に従って例外を返す。
  - `test/backend-wasm.test.ts` で偽モジュールを使い、機能制限を含めて
    検証済み。
- 残作業:
  - 実際の `.wasm` を Vite ビルドに組み込み、Pages 用 base path と
    アセット読込を設定する。
  - WASM 初期化失敗時に UI でエラーを表示する。
  - import 付きソースを扱う場合は `modules` の解決を WASM 側で行う設計が
    必要（現状は対象外）。
- 長所: サーバー不要。完全にブラウザ内で完結。
- 短所: 提供できる機能が限定的。ビルド工程が増える。WASM の配布サイズ
  （現状約 1.1 MB）を許容する必要がある。

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
| 構文検査 (`check`) | ○ | ○ | ○ |
| import 解決 (`modules`) | ○ | ○ | × |
| 観測バンドル (`observe`, SSA/LIR…) | ○ | ○ | △ (IR / bytecode / WAT のみ) |
| 実行 (`execute`, IR/MIR/SSA/VM) | ○ | ○ | △ (IR / MIR / VM のみ) |
| 比較 (`compare`, clang/qbe/llvm) | ○ | ○ | × (ネイティブ前提) |
| オブジェクト生成 | ○ | ○ | × (ネイティブ前提) |
| スナップショット | ○ | ○ | × (現状は未対応) |
| ファイル入出力 | ○ (ネイティブ) | ○ (ブラウザ API) | ○ (ブラウザ API) |

凡例: ○=提供可 / △=条件付き / ×=提供不可。

## 7. 制約事項

- **Cerune は変更しない。** 必要な変更は Cerune 側の issue として提案する。
- 観測バンドルの統一形式は Cerune issue **#60** が既に追跡しているため、
  重複 issue を作成しない。
- WASM 版は `cerune-lang` の公開ライブラリ API を利用する（確認済み）。
  Cerune 側の変更は不要。
- ファイル入出力はホストごとに API が異なる（ネイティブ vs ブラウザ）。
- 既存 UI と挙動を維持する。機能差は「無効化」でのみ表現する。

## 8. セキュリティ

- **方式 B（ローカル HTTP）**
  - 待ち受けは `127.0.0.1` に限定し、外部公開しない。
  - 起動ごとに一時トークンを発行し、リクエストで検証する。
  - CORS は loopback オリジン（`localhost` / `127.0.0.1` / `[::1]`）のみ
    許可する。それ以外のオリジンには CORS ヘッダを返さない。
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
| 1 | 方式 B: 共有 `core` 切り出し・`tint-server`・`createHttpBackend()` | 一部完了 |
| 1.5 | 方式 B: Tauri からのサーバー自動起動とライフサイクル管理 | 完了 |
| 2 | 方式 B: ブラウザ用 `TintHost` と Web ビルド手順を追加 | 完了 |
| 3 | 方式 C: Cerune の lib API 状況を調査し、WASM ラッパを試作 | 完了 |
| 4 | 方式 C: `createWasmBackend()` と機能制限の検証 | 完了 |
| 5 | 3 バックエンドの統合テストとドキュメント整備 | 一部完了 |

各フェーズは独立して段階的に進められるよう設計しています。フェーズ 1
以降の要否・優先度は別途判断します。

## 10. 現時点の実装状況

- 完了:
  - フェーズ 0（フロントエンドの抽象化）。デスクトップ版の挙動は従来どおり。
  - 共有 `core` クレート（`tint-core`）の切り出し。`cerune_cli` / `interface`
    / `history` / `source` を集約し、`src-tauri` と `tint-server` から利用。
  - `tint-server`（方式 B）: 全 API を提供。`127.0.0.1` 限定・
    `Bearer` トークン認証。`tint-core` の 21 単体 + 6 統合テスト、
    `tint-server` の 5 単体 + 6 HTTP 統合テストで検証。
  - `src/backend-http.ts` の `createHttpBackend()`。
  - フェーズ 1.5: デスクトップアプリ起動時に `tint-server` を
    **同一プロセス内のバックグラウンドスレッド**で自動起動
    （`tint_server::spawn()`）。接続情報（`baseUrl`/`token`）は Tauri
    コマンド `server_info` で取得でき、プロセス終了とともに停止します。
  - フェーズ 2: ブラウザ用 `TintHost`（`src/host-web.ts`）と実行環境の
    判定（`src/environment.ts`）。File System Access API が使えない場合は
    ファイル選択とダウンロードにフォールバック。CORS は loopback
    オリジンのみ許可。
  - フェーズ 3: WASM 実現性の調査と試作（`experiments/wasm`）。
    `cerune-lang` の公開 API を `wasm-bindgen` で包み、
    `wasm32-unknown-unknown` へビルドできることを確認。Node 上で
    `check` / `emit_ir` / `emit_wat` / `execute(vm)` の動作を検証済み。
  - フェーズ 4: 方式 C のアダプタ `createWasmBackend()` を実装
    （`src/backend-wasm.ts`）。WASM モジュールを注入して使う設計にし、
    機能制限を偽モジュールで検証。
  - フェーズ 5（一部）: 実行環境に `wasm` を追加
    （`src/environment.ts` の `detectEnvironment` / `isTauriRuntime`）。
    WASM 版の遅延初期化（`createDeferredWasmBackend`）とローダ
    （`src/wasm-loader.ts`）を実装し、`src/main.ts` で選択する。
    初期化に失敗した場合は未対応機能を有効に見せないよう全機能を
    無効化し、エラーを表示する。
- 未実装:
  - 方式 C の実配布: WASM を Vite ビルドに組み込み、GitHub Actions で
    Cerune を固定チェックアウトして生成し、GitHub Pages へ配布する
    （CI ワークフローと Pages 用 base path は未作成）。
  - 方式 C の `modules`（import 解決）対応。

### 自動起動方式の補足

デスクトップ版はサーバーを別プロセス（sidecar）ではなく、アプリ本体の
スレッドで動かします。sidecar の同梱・終了処理が不要で、ライフサイクルは
アプリのプロセスに一致します。より強い分離が必要になった場合は sidecar へ
切り替えられます（`tint-server` は単体バイナリとしても動作します）。

## 11. ブラウザ版の使い方（フェーズ 2 時点）

1. サーバーを起動する。いずれかの方法で `base_url` と `token` を取得します。

   - デスクトップアプリを起動すると自動で立ち上がり、標準出力に接続情報が
     表示されます（フロントエンドからは `server_info` でも取得可能）。
   - 単体で起動する場合: `cargo run -p tint-server`。

2. フロントエンドを配信してブラウザで開く。

   ```sh
   npm run build
   npm run preview
   ```

3. クエリ文字列に接続情報を付けて開く。

   ```
   http://localhost:4173/?server=<base_url>&token=<token>
   ```

`server` と `token` が両方あるときだけ HTTP 版として動作します。どちらかが
欠けている場合は、Tauri ランタイム上なら Tauri 版、ブラウザ上なら WASM 版
として起動します。ブラウザ版ではファイル入出力にブラウザ API を使い、import
解決は論理ファイル名に基づくため、ネイティブ版ほど完全なパス解決はできません
（既知の制限）。

### ブラウザ WASM 版（開発中）

`npm run build:pages` を実行すると、`scripts/prepare-wasm.mjs` が
`experiments/wasm` を wasm-pack でビルドし、生成物を `public/wasm/` へ
配置したうえで Vite ビルドします。サブパス配信時は `VITE_BASE`
（例: `VITE_BASE=/Tint-St/`）を設定します。

```sh
VITE_BASE=/Tint-St/ npm run build:pages
```

クエリ無しでブラウザから開くと WASM 版が起動します。提供できる機能は
`capabilities()` に従って自動的に制限され、未対応機能は無効化されます。
生成物（`public/wasm/`）はバージョン管理しません。
