pub fn rename_source(path: &str, new_name: &str) -> Result<String, String> {
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

#[cfg(test)]
mod tests {
    use super::rename_source;

    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();

        let directory = std::env::temp_dir().join(format!(
            "tint-source-test-{}-{unique}",
            std::process::id(),
        ));

        std::fs::create_dir_all(&directory).unwrap();

        directory
    }

    #[test]
    fn appends_the_extension_when_missing() {
        let directory = temp_dir();

        let original = directory.join("main.ceru");

        std::fs::write(&original, "integer: i64 = 1;").unwrap();

        let renamed = rename_source(original.to_str().unwrap(), "renamed").unwrap();

        assert!(renamed.ends_with("renamed.ceru"));

        assert!(directory.join("renamed.ceru").exists());

        assert!(!original.exists());

        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn rejects_path_separators() {
        let directory = temp_dir();

        let original = directory.join("main.ceru");

        std::fs::write(&original, "integer: i64 = 1;").unwrap();

        assert!(rename_source(original.to_str().unwrap(), "../evil").is_err());

        let _ = std::fs::remove_dir_all(&directory);
    }
}
