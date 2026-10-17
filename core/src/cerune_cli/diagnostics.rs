use std::fs;
use std::process::Command;

use crate::interface::{CheckRequest, Diagnostic};

use super::process;

pub fn check_diagnostics(request: CheckRequest) -> Result<Vec<Diagnostic>, String> {
    let timestamp = process::timestamp();

    let source_path =
        process::write_temp_source(&request.source, request.source_path.as_deref(), timestamp)?;

    let result = (|| {
        let output = Command::new("cerune")
            .arg("check")
            .arg(&source_path)
            .output()
            .map_err(|error| {
                format!(
                    "failed to start Cerune: {error}\n\
                     Make sure `cerune` is installed and available in PATH."
                )
            })?;

        if output.status.success() {
            return Ok(Vec::new());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);

        let stdout = String::from_utf8_lossy(&output.stdout);

        let mut diagnostics = Vec::new();

        for line in stderr.lines().chain(stdout.lines()) {
            if let Some(diagnostic) = parse_diagnostic(line) {
                diagnostics.push(diagnostic);
            }
        }

        if diagnostics.is_empty() {
            diagnostics.push(Diagnostic {
                line: 1,
                column: 1,
                message: stderr.trim().to_owned(),
                severity: "error".to_owned(),
            });
        }

        Ok(diagnostics)
    })();

    let _ = fs::remove_file(&source_path);

    result
}

fn parse_diagnostic(line: &str) -> Option<Diagnostic> {
    let line = line.trim();

    let message = line.strip_prefix("cerune: ")?.trim();

    let (text, location) = message.rsplit_once(" at ")?;

    let (line_text, column_text) = location.split_once(':')?;

    let line_number = line_text.trim().parse::<u32>().ok()?;

    let column_number = column_text.trim().parse::<u32>().ok()?;

    Some(Diagnostic {
        line: line_number,
        column: column_number,
        message: text.trim().to_owned(),
        severity: "error".to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::parse_diagnostic;

    #[test]
    fn parses_cerune_diagnostic() {
        let diagnostic = parse_diagnostic("cerune: unknown binding `y` at 2:7").unwrap();

        assert_eq!(diagnostic.line, 2);

        assert_eq!(diagnostic.column, 7);

        assert_eq!(diagnostic.message, "unknown binding `y`");
    }

    #[test]
    fn ignores_unstructured_lines() {
        assert!(parse_diagnostic("OK file").is_none());
    }
}
