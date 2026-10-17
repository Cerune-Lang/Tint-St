//! 実際の `cerune` CLI を呼び出す統合テストです。
//!
//! 外部コマンドを使わない単体テスト（各サブモジュール内の `#[cfg(test)]`）とは分離して、
//! ここでは Cerune 本体との連携を検証します。`cerune` が見つからない環境ではスキップします。

use std::process::Command;

use tauri_app_lib::cerune_cli;
use tauri_app_lib::interface::{
    CheckRequest, CompareKind, CompareRequest, ExecuteRequest, ExecutionPath, ModulesRequest,
    ObserveRequest, Target,
};

const VALID: &str = "integer: i64 = 1 + 2;\nprint(integer);";

fn cerune_available() -> bool {
    Command::new("cerune")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn skip_if_unavailable() -> bool {
    if cerune_available() {
        return false;
    }

    eprintln!("skipping: `cerune` was not found in PATH");

    true
}

#[test]
fn check_reports_no_diagnostics_for_valid_source() {
    if skip_if_unavailable() {
        return;
    }

    let request = CheckRequest {
        source: VALID.to_owned(),
        source_path: None,
    };

    let diagnostics = cerune_cli::check_diagnostics(request).expect("check should succeed");

    assert!(diagnostics.is_empty());
}

#[test]
fn check_reports_a_diagnostic_for_invalid_source() {
    if skip_if_unavailable() {
        return;
    }

    let request = CheckRequest {
        source: "integer: i64 = missing;\nprint(integer);".to_owned(),
        source_path: None,
    };

    let diagnostics = cerune_cli::check_diagnostics(request).expect("check should succeed");

    assert!(!diagnostics.is_empty());

    assert_eq!(diagnostics[0].line, 1);

    assert_eq!(diagnostics[0].column, 16);
}

#[test]
fn observe_returns_pipeline_outputs() {
    if skip_if_unavailable() {
        return;
    }

    let request = ObserveRequest {
        source: VALID.to_owned(),
        source_path: None,
        target: Target::WindowsX64,
        annotate_origins: false,
        native_ssa: false,
        string_heap_limit: None,
        array_heap_limit: None,
    };

    let observation = cerune_cli::observe(request).expect("observe should succeed");

    assert!(!observation.ir.is_empty());

    assert!(!observation.mir.is_empty());

    assert!(!observation.lir.is_empty());

    assert!(!observation.manifest.is_empty());
}

#[test]
fn execute_ir_runs_the_program() {
    if skip_if_unavailable() {
        return;
    }

    let request = ExecuteRequest {
        source: VALID.to_owned(),
        source_path: None,
        path: ExecutionPath::Ir,
        string_heap_limit: None,
        array_heap_limit: None,
    };

    let result = cerune_cli::execute(request).expect("execute should succeed");

    assert!(result.output.contains('3'), "{}", result.output);
}

#[test]
fn load_modules_reads_the_entry_source() {
    if skip_if_unavailable() {
        return;
    }

    let request = ModulesRequest {
        source: VALID.to_owned(),
        source_path: None,
    };

    let files = cerune_cli::load_modules(request).expect("load_modules should succeed");

    assert_eq!(files.len(), 1);

    assert!(files[0].text.contains("integer"));
}

#[test]
fn compare_produces_a_diff_or_a_match() {
    if skip_if_unavailable() {
        return;
    }

    let request = CompareRequest {
        source: VALID.to_owned(),
        source_path: None,
        kind: CompareKind::Lir,
        annotate_origins: false,
        native_ssa: false,
        string_heap_limit: None,
        array_heap_limit: None,
    };

    let diff = cerune_cli::compare(request).expect("compare should succeed");

    assert!(
        diff.contains("No differences") || diff.contains("--- "),
        "{diff}"
    );
}
