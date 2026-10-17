use std::fs;
use std::process::Command;

use crate::interface::Target;

pub(super) fn run_qbe_asm(qbe: &str, timestamp: u128, target: Target) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();

    let stem = format!("tint-{}-{timestamp}", std::process::id(),);

    let qbe_path = temp_dir.join(format!("{stem}.ssa"));

    let asm_path = temp_dir.join(format!("{stem}.qbe.s"));

    fs::write(&qbe_path, qbe)
        .map_err(|error| format!("failed to create temporary QBE IR: {error}"))?;

    let result = (|| {
        let qbe_name = qbe_path
            .file_name()
            .ok_or_else(|| "invalid QBE temporary path".to_owned())?;

        let asm_name = asm_path
            .file_name()
            .ok_or_else(|| "invalid ASM temporary path".to_owned())?;

        let output = Command::new("wsl")
            .current_dir(&temp_dir)
            .arg("qbe")
            .arg("-t")
            .arg(target.qbe_target())
            .arg("-o")
            .arg(asm_name)
            .arg(qbe_name)
            .output()
            .map_err(|error| format!("failed to start QBE through WSL: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);

            let stdout = String::from_utf8_lossy(&output.stdout);

            let message = if !stderr.trim().is_empty() {
                stderr.trim().to_owned()
            } else if !stdout.trim().is_empty() {
                stdout.trim().to_owned()
            } else {
                "QBE failed without an error message".to_owned()
            };

            return Err(message);
        }

        fs::read_to_string(&asm_path)
            .map_err(|error| format!("failed to read QBE assembly: {error}"))
    })();

    let _ = fs::remove_file(&qbe_path);

    let _ = fs::remove_file(&asm_path);

    result
}

pub(super) fn run_clang_asm(
    source: &str,
    extension: &str,
    kind: &str,
    timestamp: u128,
    target: &str,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();

    let stem = format!("tint-{}-{timestamp}", std::process::id(),);

    let input_path = temp_dir.join(format!("{stem}.{extension}"));

    let asm_path = temp_dir.join(format!("{stem}.{kind}.s"));

    fs::write(&input_path, source)
        .map_err(|error| format!("failed to create temporary {kind} input: {error}"))?;

    let result = (|| {
        let output = Command::new("clang")
            .arg("-S")
            .arg("-O0")
            .arg(format!("--target={target}"))
            .arg(&input_path)
            .arg("-o")
            .arg(&asm_path)
            .output()
            .map_err(|error| {
                format!(
                    "failed to start Clang: {error}\n\
                         Make sure `clang` is available in PATH."
                )
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);

            let stdout = String::from_utf8_lossy(&output.stdout);

            let message = if !stderr.trim().is_empty() {
                stderr.trim().to_owned()
            } else if !stdout.trim().is_empty() {
                stdout.trim().to_owned()
            } else {
                "Clang failed without an error message".to_owned()
            };

            return Err(message);
        }

        fs::read_to_string(&asm_path)
            .map_err(|error| format!("failed to read generated assembly: {error}"))
    })();

    let _ = fs::remove_file(&input_path);

    let _ = fs::remove_file(&asm_path);

    result
}
