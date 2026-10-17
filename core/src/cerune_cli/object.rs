use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;
use std::process::Command;

use object::{Object, ObjectSection, ObjectSymbol};

use crate::interface::Target;

pub(super) fn run_cerune_object(
    source_path: &Path,
    target: Target,
    annotate_origins: bool,
    native_ssa: bool,
    timestamp: u128,
    heap: &[String],
) -> Result<String, String> {
    let extension = target.object_extension();

    let object_path =
        std::env::temp_dir().join(format!("tint-{}-{timestamp}.{extension}", std::process::id(),));

    let result = (|| {
        let mut command = Command::new("cerune");

        command
            .arg("emit-obj")
            .arg(source_path)
            .arg("--target")
            .arg(target.as_str());

        if annotate_origins {
            command.arg("--annotate-origins");
        }

        if native_ssa {
            command.arg("--ssa");
        }

        command.args(heap);

        let output = command
            .arg("-o")
            .arg(&object_path)
            .output()
            .map_err(|error| format!("failed to start Cerune: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);

            let stdout = String::from_utf8_lossy(&output.stdout);

            let message = if !stderr.trim().is_empty() {
                stderr.trim().to_owned()
            } else if !stdout.trim().is_empty() {
                stdout.trim().to_owned()
            } else {
                "Cerune `emit-obj` failed without an error message".to_owned()
            };

            return Err(message);
        }

        let bytes = fs::read(&object_path)
            .map_err(|error| format!("failed to read generated object: {error}"))?;

        describe_object(&bytes, target.as_str())
    })();

    let _ = fs::remove_file(&object_path);

    result
}

fn origin_node_id(name: &str) -> Option<u64> {
    let rest = name.strip_prefix("cerune_origin_n")?;

    let node = rest.split('_').next()?;

    node.parse().ok()
}

fn describe_object(bytes: &[u8], target: &str) -> Result<String, String> {
    let file =
        object::File::parse(bytes).map_err(|error| format!("failed to parse object: {error}"))?;

    let mut output = String::new();

    writeln!(output, "Target: {target}",).unwrap();

    writeln!(output, "Format: {:?}", file.format(),).unwrap();

    writeln!(output, "Architecture: {:?}", file.architecture(),).unwrap();

    writeln!(output, "Kind: {:?}", file.kind(),).unwrap();

    writeln!(output, "Little endian: {}", file.is_little_endian(),).unwrap();

    writeln!(output, "Size: {} bytes", bytes.len(),).unwrap();

    writeln!(output).unwrap();

    writeln!(output, "=== Sections ===",).unwrap();

    for section in file.sections() {
        let name = section.name().unwrap_or("<non-utf8>");

        writeln!(
            output,
            "{:?}  {:<20} kind={:?} size={} align={}",
            section.index(),
            name,
            section.kind(),
            section.size(),
            section.align(),
        )
        .unwrap();
    }

    writeln!(output).unwrap();

    writeln!(output, "=== Symbols ===",).unwrap();

    let mut origins: BTreeMap<u64, Vec<(u64, String)>> = BTreeMap::new();

    for symbol in file.symbols() {
        let name = symbol.name().unwrap_or("<non-utf8>");

        if let Some(node_id) = origin_node_id(name) {
            origins
                .entry(node_id)
                .or_default()
                .push((symbol.address(), name.to_owned()));

            continue;
        }

        writeln!(
            output,
            "0x{:08x}  {:<32} kind={:?} scope={:?} size={} section={:?}",
            symbol.address(),
            name,
            symbol.kind(),
            symbol.scope(),
            symbol.size(),
            symbol.section_index(),
        )
        .unwrap();
    }

    writeln!(output).unwrap();

    if !origins.is_empty() {
        writeln!(output, "=== Origin Symbols ===",).unwrap();

        for (node_id, symbols) in origins {
            writeln!(output, "Node #{node_id}",).unwrap();

            for (address, name) in symbols {
                writeln!(output, "  0x{address:08x}  {name}",).unwrap();
            }
        }

        writeln!(output).unwrap();
    }

    writeln!(output, "=== Relocations ===",).unwrap();

    for section in file.sections() {
        let name = section.name().unwrap_or("<non-utf8>");

        for (offset, relocation) in section.relocations() {
            writeln!(
                output,
                "{name}+0x{offset:04x} kind={:?} encoding={:?} size={} target={:?} addend={}",
                relocation.kind(),
                relocation.encoding(),
                relocation.size(),
                relocation.target(),
                relocation.addend(),
            )
            .unwrap();
        }
    }

    Ok(output)
}
