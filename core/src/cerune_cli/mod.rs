//! Cerune コンパイラ CLI との連携を責務ごとに分割したモジュール群です。
//!
//! - [`process`]: 外部プロセス起動と一時ファイルの共通処理
//! - [`observe`]: `cerune observe` によるパイプライン観測
//! - [`execute`]: `cerune run` 系による実行
//! - [`diagnostics`]: `cerune check` による診断
//! - [`modules`]: `cerune emit-sources` によるモジュール読み込み
//! - [`compare`]: Windows/Linux のターゲット比較
//! - [`object`]: オブジェクトファイルの解析
//! - [`toolchain`]: Clang / QBE などの外部ツール呼び出し
//! - [`diff`]: テキスト差分

mod compare;
mod diagnostics;
mod diff;
mod execute;
mod modules;
mod object;
mod observe;
mod process;
mod toolchain;

pub use compare::compare;
pub use diagnostics::check_diagnostics;
pub use diff::diff_lines;
pub use execute::execute;
pub use modules::load_modules;
pub use observe::observe;
