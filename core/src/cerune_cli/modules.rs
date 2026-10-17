use std::fs;

use crate::interface::{ModuleFile, ModulesRequest, SourcesBundle};

use super::process;

pub fn load_modules(request: ModulesRequest) -> Result<Vec<ModuleFile>, String> {
    let timestamp = process::timestamp();

    let source_path =
        process::write_temp_source(&request.source, request.source_path.as_deref(), timestamp)?;

    let bundle_path = std::env::temp_dir().join(format!(
        "tint-sources-{}-{timestamp}.json",
        std::process::id(),
    ));

    let result = (|| {
        let bundle_text = bundle_path.to_string_lossy().into_owned();

        process::run_cerune("emit-sources", &source_path, &["-o", bundle_text.as_str()])?;

        let json = fs::read_to_string(&bundle_path)
            .map_err(|error| format!("failed to read sources bundle: {error}"))?;

        let bundle: SourcesBundle = serde_json::from_str(&json)
            .map_err(|error| format!("failed to parse sources bundle: {error}"))?;

        let mut files = bundle.files;

        if let Some(path) = request.source_path.as_deref() {
            let entry = normalize_path(&source_path.to_string_lossy());

            if let Some(file) = files
                .iter_mut()
                .find(|file| normalize_path(&file.name) == entry)
            {
                file.name = path.to_owned();
            }
        }

        Ok(files)
    })();

    let _ = fs::remove_file(&source_path);

    let _ = fs::remove_file(&bundle_path);

    result
}

pub(super) fn normalize_path(path: &str) -> String {
    path.trim_start_matches("\\\\?\\")
        .replace('\\', "/")
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::normalize_path;

    #[test]
    fn normalizes_canonical_windows_paths() {
        assert_eq!(
            normalize_path("\\\\?\\C:\\Work\\Main.ceru"),
            "c:/work/main.ceru"
        );
    }
}
