use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

pub(super) fn timestamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

/// ソース隣接（または一時ディレクトリ）へ一時ソースファイルを書き出します。
/// ソースの親ディレクトリを基準にすることで、相対 import が解決できます。
pub(super) fn write_temp_source(
    source: &str,
    source_path: Option<&str>,
    timestamp: u128,
) -> Result<PathBuf, String> {
    let filename = format!(".tint-{}-{timestamp}.ceru", std::process::id());

    let path = if let Some(path) = source_path {
        let path = PathBuf::from(path);

        let parent = path
            .parent()
            .ok_or_else(|| "source file has no parent directory".to_owned())?;

        parent.join(filename)
    } else {
        std::env::temp_dir().join(filename)
    };

    fs::write(&path, source)
        .map_err(|error| format!("failed to create temporary Cerune source: {error}"))?;

    Ok(path)
}

pub(super) fn run_cerune(command: &str, source_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("cerune")
        .arg(command)
        .arg(source_path)
        .args(args)
        .output()
        .map_err(|error| {
            format!(
                "failed to start Cerune: {error}\n\
                     Make sure `cerune` is installed and available in PATH."
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
            format!("Cerune `{command}` failed without an error message")
        };

        return Err(message);
    }

    String::from_utf8(output.stdout)
        .map_err(|error| format!("Cerune returned invalid UTF-8: {error}"))
}

pub(super) fn heap_arguments(string: Option<u64>, array: Option<u64>) -> Vec<String> {
    let mut args = Vec::new();

    if let Some(value) = string {
        args.push("--string-heap-limit".to_owned());
        args.push(value.to_string());
    }

    if let Some(value) = array {
        args.push("--array-heap-limit".to_owned());
        args.push(value.to_string());
    }

    args
}

pub(super) fn run_cerune_with_heap(
    command: &str,
    source_path: &Path,
    args: &[&str],
    heap: &[String],
) -> Result<String, String> {
    let mut merged: Vec<&str> = args.to_vec();

    merged.extend(heap.iter().map(String::as_str));

    run_cerune(command, source_path, &merged)
}

#[cfg(test)]
mod tests {
    use super::{heap_arguments, write_temp_source};

    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn builds_heap_arguments() {
        assert!(heap_arguments(None, None).is_empty());

        assert_eq!(
            heap_arguments(Some(1024), None),
            vec!["--string-heap-limit".to_owned(), "1024".to_owned()]
        );

        assert_eq!(
            heap_arguments(None, Some(2048)),
            vec!["--array-heap-limit".to_owned(), "2048".to_owned()]
        );

        assert_eq!(
            heap_arguments(Some(1), Some(2)),
            vec![
                "--string-heap-limit".to_owned(),
                "1".to_owned(),
                "--array-heap-limit".to_owned(),
                "2".to_owned(),
            ]
        );
    }

    #[test]
    fn writes_temp_source_next_to_the_source() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();

        let directory = std::env::temp_dir().join(format!(
            "tint-process-test-{}-{unique}",
            std::process::id(),
        ));

        std::fs::create_dir_all(&directory).unwrap();

        let source_path = directory.join("main.ceru");

        let written = write_temp_source(
            "integer: i64 = 1;",
            source_path.to_str(),
            42,
        )
        .unwrap();

        assert_eq!(written.parent(), Some(directory.as_path()));

        let name = written.file_name().unwrap().to_string_lossy();

        assert!(name.starts_with(".tint-"));

        assert!(name.ends_with(".ceru"));

        assert_eq!(
            std::fs::read_to_string(&written).unwrap(),
            "integer: i64 = 1;"
        );

        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn writes_temp_source_to_the_temp_directory_without_a_path() {
        let written = write_temp_source("integer: i64 = 1;", None, 7).unwrap();

        assert_eq!(written.parent(), Some(std::env::temp_dir().as_path()));

        let _ = std::fs::remove_file(&written);
    }
}
