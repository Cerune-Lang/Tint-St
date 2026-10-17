use std::fs;

use crate::interface::{ExecuteRequest, ExecutionPath, ExecutionResult};

use super::process;

pub fn execute(request: ExecuteRequest) -> Result<ExecutionResult, String> {
    let heap = process::heap_arguments(request.string_heap_limit, request.array_heap_limit);

    let timestamp = process::timestamp();

    let source_path =
        process::write_temp_source(&request.source, request.source_path.as_deref(), timestamp)?;

    let result = (|| {
        process::run_cerune("check", &source_path, &[])?;

        let output = match request.path {
            ExecutionPath::Ir => process::run_cerune_with_heap("run", &source_path, &[], &heap)?,

            ExecutionPath::Mir => {
                process::run_cerune_with_heap("run-mir", &source_path, &[], &heap)?
            }

            ExecutionPath::Ssa => {
                process::run_cerune_with_heap("run-mir", &source_path, &["--ssa"], &heap)?
            }

            ExecutionPath::Vm => {
                process::run_cerune_with_heap("run-vm", &source_path, &[], &heap)?
            }
        };

        Ok(ExecutionResult { output })
    })();

    let _ = fs::remove_file(&source_path);

    result
}
