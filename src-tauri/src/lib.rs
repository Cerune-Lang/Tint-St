mod cerune_cli;
mod interface;

use interface::{
    ExecuteRequest, ExecutionPath, ExecutionResult, Observation, ObserveRequest, Target,
    parse_heap_limit,
};

#[tauri::command]
fn rename_source(path: String, new_name: String) -> Result<String, String> {
    let new_name = new_name.trim();

    if new_name.is_empty() {
        return Err("file name cannot be empty".to_owned());
    }

    if new_name.contains('/') || new_name.contains('\\') {
        return Err("file name cannot contain path separators".to_owned());
    }

    let new_name = if new_name.ends_with(".ceru") {
        new_name.to_owned()
    } else {
        format!("{new_name}.ceru")
    };

    let old_path = std::path::PathBuf::from(path);

    let parent = old_path
        .parent()
        .ok_or_else(|| "file has no parent directory".to_owned())?;

    let new_path = parent.join(new_name);

    if new_path.exists() {
        return Err("a file with that name already exists".to_owned());
    }

    std::fs::rename(&old_path, &new_path)
        .map_err(|error| format!("failed to rename file: {error}"))?;

    Ok(new_path.to_string_lossy().into_owned())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![emit_all, execute, rename_source,])
        .run(tauri::generate_context!())
        .expect("error while running Tint");
}
