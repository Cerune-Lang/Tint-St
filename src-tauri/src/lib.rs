pub use tint_core::{cerune_cli, history, interface};

use std::sync::Mutex;

use serde::Serialize;

use tauri::Manager;

use interface::{
    CheckRequest, CompareKind, CompareRequest, Diagnostic, ExecuteRequest, ExecutionPath,
    ExecutionResult, ModuleFile, ModulesRequest, Observation, ObserveRequest, Target,
    parse_heap_limit,
};

/// 起動中のローカル HTTP サーバーの接続情報です。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerInfo {
    base_url: String,

    token: String,
}

#[derive(Default)]
struct ServerState(Mutex<Option<ServerInfo>>);

#[tauri::command]
fn server_info(state: tauri::State<ServerState>) -> Option<ServerInfo> {
    state.0.lock().ok().and_then(|guard| guard.clone())
}

fn start_server() -> Option<ServerInfo> {
    let token = tint_server::generate_token();

    match tint_server::spawn(token.clone()) {
        Ok(base_url) => {
            println!("Tint server listening on {base_url}");

            Some(ServerInfo { base_url, token })
        }

        Err(error) => {
            eprintln!("failed to start Tint server: {error}");

            None
        }
    }
}

#[tauri::command]
fn rename_source(path: String, new_name: String) -> Result<String, String> {
    tint_core::source::rename_source(&path, &new_name)
}

#[tauri::command]
fn emit_all(
    source: String,
    target: String,
    annotate_origins: bool,
    native_ssa: bool,
    source_path: Option<String>,
    string_heap_limit: Option<String>,
    array_heap_limit: Option<String>,
) -> Result<Observation, String> {
    let request = ObserveRequest {
        source,
        source_path,
        target: Target::parse(&target)?,
        annotate_origins,
        native_ssa,
        string_heap_limit: parse_heap_limit(string_heap_limit, "--string-heap-limit")?,
        array_heap_limit: parse_heap_limit(array_heap_limit, "--array-heap-limit")?,
    };

    cerune_cli::observe(request)
}

#[tauri::command]
fn execute(
    source: String,
    source_path: Option<String>,
    path: String,
    string_heap_limit: Option<String>,
    array_heap_limit: Option<String>,
) -> Result<ExecutionResult, String> {
    let request = ExecuteRequest {
        source,
        source_path,
        path: ExecutionPath::parse(&path)?,
        string_heap_limit: parse_heap_limit(string_heap_limit, "--string-heap-limit")?,
        array_heap_limit: parse_heap_limit(array_heap_limit, "--array-heap-limit")?,
    };

    cerune_cli::execute(request)
}

#[tauri::command]
fn compare_targets(
    source: String,
    source_path: Option<String>,
    kind: String,
    annotate_origins: bool,
    native_ssa: bool,
    string_heap_limit: Option<String>,
    array_heap_limit: Option<String>,
) -> Result<String, String> {
    let request = CompareRequest {
        source,
        source_path,
        kind: CompareKind::parse(&kind)?,
        annotate_origins,
        native_ssa,
        string_heap_limit: parse_heap_limit(string_heap_limit, "--string-heap-limit")?,
        array_heap_limit: parse_heap_limit(array_heap_limit, "--array-heap-limit")?,
    };

    cerune_cli::compare(request)
}

#[tauri::command]
fn save_snapshot(snapshot: history::Snapshot) -> Result<history::SnapshotMeta, String> {
    history::save(snapshot)
}

#[tauri::command]
fn list_snapshots() -> Result<Vec<history::SnapshotMeta>, String> {
    history::list()
}

#[tauri::command]
fn read_snapshot(id: String) -> Result<history::Snapshot, String> {
    history::read(&id)
}

#[tauri::command]
fn delete_snapshot(id: String) -> Result<(), String> {
    history::delete(&id)
}

#[tauri::command]
fn diff_text(left: String, right: String, left_label: String, right_label: String) -> String {
    cerune_cli::diff_lines(&left, &right, &left_label, &right_label)
}

#[tauri::command]
fn check_source(
    source: String,
    source_path: Option<String>,
) -> Result<Vec<Diagnostic>, String> {
    let request = CheckRequest {
        source,
        source_path,
    };

    cerune_cli::check_diagnostics(request)
}

#[tauri::command]
fn load_modules(
    source: String,
    source_path: Option<String>,
) -> Result<Vec<ModuleFile>, String> {
    let request = ModulesRequest {
        source,
        source_path,
    };

    cerune_cli::load_modules(request)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(ServerState(Mutex::new(start_server())));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            emit_all,
            execute,
            compare_targets,
            save_snapshot,
            list_snapshots,
            read_snapshot,
            delete_snapshot,
            diff_text,
            check_source,
            load_modules,
            rename_source,
            server_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tint");
}
