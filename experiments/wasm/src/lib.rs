//! Cerune コンパイラをブラウザで動かすための実験的な WASM ラッパです。
//!
//! `cerune-lang` の公開ライブラリ API をそのまま呼び出します。ネイティブ
//! ツール（clang / qbe / llvm）に依存する機能は提供せず、フロントエンドと
//! インタプリタ（IR / MIR / VM）とテキスト生成のみを公開します。
//!
//! ビルド例:
//!
//! ```sh
//! cd experiments/wasm
//! wasm-pack build --release --target web
//! ```

use serde::Serialize;
use wasm_bindgen::prelude::*;

use cerune_lang::diagnostic::Diagnostic;
use cerune_lang::source::SourceLocation;

#[derive(Serialize)]
struct DiagnosticDto {
    line: u32,
    column: u32,
    message: String,
    severity: String,
}

fn to_dto(source: &str, diagnostic: &Diagnostic) -> DiagnosticDto {
    let (line, column) = match diagnostic.primary_span() {
        Some(span) => match SourceLocation::from_offset(source, span.start()) {
            Some(location) => (location.line() as u32, location.column() as u32),

            None => (1, 1),
        },

        None => (1, 1),
    };

    DiagnosticDto {
        line,
        column,
        message: diagnostic.message().to_owned(),
        severity: "error".to_owned(),
    }
}

fn message(error: &Diagnostic) -> String {
    error.message().to_owned()
}

/// ブラウザ内で提供できる機能のフラグを返します。
#[wasm_bindgen]
pub fn capabilities() -> String {
    "{\"check\":true,\"observe\":true,\"execute\":true,\
\"compare\":false,\"modules\":false,\"snapshots\":false,\"rename\":false}"
        .to_owned()
}

/// 構文・意味検査を行い、診断を JSON 配列で返します。
#[wasm_bindgen]
pub fn check(source: &str) -> String {
    match cerune_lang::compile(source) {
        Ok(_) => "[]".to_owned(),

        Err(diagnostic) => serde_json::to_string(&vec![to_dto(source, &diagnostic)])
            .unwrap_or_else(|_| "[]".to_owned()),
    }
}

/// Cerune IR のテキスト表現を返します。
#[wasm_bindgen]
pub fn emit_ir(source: &str) -> Result<String, String> {
    cerune_lang::compile_to_ir_text(source).map_err(|error| message(&error))
}

/// Cerune bytecode のテキスト表現を返します。
#[wasm_bindgen]
pub fn emit_bytecode(source: &str) -> Result<String, String> {
    cerune_lang::compile_to_bytecode_text(source).map_err(|error| message(&error))
}

/// WebAssembly テキスト（WAT）を返します。
#[wasm_bindgen]
pub fn emit_wat(source: &str) -> Result<String, String> {
    cerune_lang::compile_to_wat(source).map_err(|error| message(&error))
}

/// 指定した経路でプログラムを実行し、標準出力相当の文字列を返します。
#[wasm_bindgen]
pub fn execute(source: &str, path: &str) -> Result<String, String> {
    match path {
        "ir" => cerune_lang::run_ir(source).map_err(|error| format!("{error:?}")),

        "mir" => cerune_lang::run_mir(source).map_err(|error| format!("{error:?}")),

        "vm" => cerune_lang::run_vm(source).map_err(|error| format!("{error:?}")),

        _ => Err(format!("unsupported execution path: {path}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{check, emit_ir, execute};

    #[test]
    fn check_reports_a_diagnostic_for_invalid_source() {
        let diagnostics = check("print(missing);");

        assert!(diagnostics.contains("missing"));
    }

    #[test]
    fn check_accepts_valid_source() {
        assert_eq!(check("integer: i64 = 1 + 2; print(integer);"), "[]");
    }

    #[test]
    fn emit_ir_reports_resolved_types() {
        let ir = emit_ir("x: i64 = 40 + 2; print(x);").expect("ir should be emitted");

        assert!(ir.contains("Cerune IR"));
    }

    #[test]
    fn execute_runs_the_vm() {
        let output = execute("integer: i64 = 1 + 2; print(integer);", "vm").expect("vm should run");

        assert_eq!(output.trim(), "3");
    }

    #[test]
    fn execute_rejects_unknown_paths() {
        assert!(execute("print(1);", "jvm").is_err());
    }
}
