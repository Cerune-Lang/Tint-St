use crate::interface::{
    CompareKind, CompareRequest, ExecuteRequest, ExecutionPath, ExecutionResult, Observation,
    ObserveRequest, Target,
};

use object::{Object, ObjectSection, ObjectSymbol};

use std::fmt::Write as _;

use std::{
    collections::BTreeMap,
    fs,
    path::Path,
    process::{self, Command},
    time::{SystemTime, UNIX_EPOCH},
};

pub fn observe(request: ObserveRequest) -> Result<Observation, String> {
    let target = request.target;

    let target_name = target.as_str();

    let annotate_origins = request.annotate_origins;

    let native_ssa = request.native_ssa;

    let heap = heap_arguments(request.string_heap_limit, request.array_heap_limit);

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    let filename = format!(".tint-{}-{timestamp}.ceru", process::id(),);

    let source_path = if let Some(path) = request.source_path.as_deref() {
        let path = std::path::PathBuf::from(path);

        let parent = path
            .parent()
            .ok_or_else(|| "source file has no parent directory".to_owned())?;

        parent.join(filename)
    } else {
        std::env::temp_dir().join(filename)
    };

    fs::write(&source_path, &request.source)
        .map_err(|error| format!("failed to create temporary Cerune source: {error}"))?;

    let result: Result<Observation, String> = (|| {
        let ObserveBundle {
            sources,
            ir,
            mir,
            ssa,
            ssa_map,
            ssa_lowered,
            ssa_lowered_map,
            lir,
            manifest,
        } = run_cerune_observe(&source_path, target_name, native_ssa, &heap)?;

        let c = run_cerune_with_heap("emit-c", &source_path, &[], &heap)?;

        let c_asm = run_clang_asm(&c, "c", "c", timestamp, target_name)
            .unwrap_or_else(|error| format!("C ASM unavailable:\n{error}"));

        let llvm = if annotate_origins {
            run_cerune_with_heap(
                "emit-llvm",
                &source_path,
                &["--target", target_name, "--annotate-origins"],
                &heap,
            )?
        } else {
            run_cerune_with_heap("emit-llvm", &source_path, &["--target", target_name], &heap)?
        };

        let llvm_asm = run_clang_asm(&llvm, "ll", "llvm", timestamp, target_name)
            .unwrap_or_else(|error| format!("LLVM ASM unavailable:\n{error}"));

        let wat = run_cerune_with_heap("emit-wat", &source_path, &[], &heap)?;

        let qbe = run_cerune_with_heap("emit-qbe", &source_path, &["--target", target_name], &heap)?;

        let qbe_asm = run_qbe_asm(&qbe, timestamp, target)
            .unwrap_or_else(|error| format!("QBE ASM unavailable:\n{error}"));

        let mut asm_args = vec!["--target", target_name];

        if native_ssa {
            asm_args.push("--ssa");
        }

        if annotate_origins {
            asm_args.push("--annotate-origins");
        }

        let direct_asm = run_cerune_with_heap("emit-asm", &source_path, &asm_args, &heap)?;

        let object =
            run_cerune_object(&source_path, target, annotate_origins, native_ssa, timestamp, &heap)?;

        let bytecode = run_cerune_with_heap("emit-bytecode", &source_path, &[], &heap)?;

        Ok(Observation {
            sources,
            ir,
            mir,
            ssa,

            ssa_map,
            ssa_lowered,
            ssa_lowered_map,
            manifest,

            c,
            c_asm,

            llvm,
            llvm_asm,

            wat,

            qbe,
            qbe_asm,

            lir,

            direct_asm,
            object,

            bytecode,
        })
    })();

    let _ = fs::remove_file(&source_path);

    result
}

pub fn execute(request: ExecuteRequest) -> Result<ExecutionResult, String> {
    let heap = heap_arguments(request.string_heap_limit, request.array_heap_limit);

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    let filename = format!(".tint-{}-{timestamp}.ceru", process::id(),);

    let source_path = if let Some(path) = request.source_path.as_deref() {
        let path = std::path::PathBuf::from(path);

        let parent = path
            .parent()
            .ok_or_else(|| "source file has no parent directory".to_owned())?;

        parent.join(filename)
    } else {
        std::env::temp_dir().join(filename)
    };

    fs::write(&source_path, &request.source)
        .map_err(|error| format!("failed to create temporary Cerune source: {error}"))?;

    let result = (|| {
        run_cerune("check", &source_path, &[])?;

        let output = match request.path {
            ExecutionPath::Ir => run_cerune_with_heap("run", &source_path, &[], &heap)?,

            ExecutionPath::Mir => run_cerune_with_heap("run-mir", &source_path, &[], &heap)?,

            ExecutionPath::Ssa => {
                run_cerune_with_heap("run-mir", &source_path, &["--ssa"], &heap)?
            }

            ExecutionPath::Vm => run_cerune_with_heap("run-vm", &source_path, &[], &heap)?,
        };

        Ok(ExecutionResult { output })
    })();

    let _ = fs::remove_file(&source_path);

    result
}

pub fn compare(request: CompareRequest) -> Result<String, String> {
    let annotate_origins = request.annotate_origins;

    let native_ssa = request.native_ssa;

    let heap = heap_arguments(request.string_heap_limit, request.array_heap_limit);

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    let filename = format!(".tint-{}-{timestamp}.ceru", process::id(),);

    let source_path = if let Some(path) = request.source_path.as_deref() {
        let path = std::path::PathBuf::from(path);

        let parent = path
            .parent()
            .ok_or_else(|| "source file has no parent directory".to_owned())?;

        parent.join(filename)
    } else {
        std::env::temp_dir().join(filename)
    };

    fs::write(&source_path, &request.source)
        .map_err(|error| format!("failed to create temporary Cerune source: {error}"))?;

    let result = (|| {
        let windows = target_artifact(
            request.kind,
            &source_path,
            Target::WindowsX64,
            annotate_origins,
            native_ssa,
            timestamp,
            &heap,
        )?;

        let linux = target_artifact(
            request.kind,
            &source_path,
            Target::LinuxX64,
            annotate_origins,
            native_ssa,
            timestamp,
            &heap,
        )?;

        Ok(diff_lines(
            &windows,
            &linux,
            "Windows x64 (x86_64-pc-windows-msvc)",
            "Linux x86-64 (x86_64-unknown-linux-gnu)",
        ))
    })();

    let _ = fs::remove_file(&source_path);

    result
}

fn target_artifact(
    kind: CompareKind,
    source_path: &Path,
    target: Target,
    annotate_origins: bool,
    native_ssa: bool,
    timestamp: u128,
    heap: &[String],
) -> Result<String, String> {
    let target_name = target.as_str();

    match kind {
        CompareKind::Lir => {
            let mut args = vec!["--target", target_name];

            if native_ssa {
                args.push("--ssa");
            }

            run_cerune_with_heap("emit-lir", source_path, &args, heap)
        }

        CompareKind::DirectAsm => {
            let mut args = vec!["--target", target_name];

            if native_ssa {
                args.push("--ssa");
            }

            if annotate_origins {
                args.push("--annotate-origins");
            }

            run_cerune_with_heap("emit-asm", source_path, &args, heap)
        }

        CompareKind::Object => {
            run_cerune_object(source_path, target, annotate_origins, native_ssa, timestamp, heap)
        }

        CompareKind::Llvm => {
            if annotate_origins {
                run_cerune_with_heap(
                    "emit-llvm",
                    source_path,
                    &["--target", target_name, "--annotate-origins"],
                    heap,
                )
            } else {
                run_cerune_with_heap("emit-llvm", source_path, &["--target", target_name], heap)
            }
        }

        CompareKind::LlvmAsm => {
            let llvm = run_cerune_with_heap(
                "emit-llvm",
                source_path,
                &["--target", target_name],
                heap,
            )?;

            run_clang_asm(&llvm, "ll", "llvm", timestamp, target_name)
                .or_else(|error| Ok(format!("LLVM ASM unavailable:\n{error}")))
        }

        CompareKind::Qbe => {
            run_cerune_with_heap("emit-qbe", source_path, &["--target", target_name], heap)
        }

        CompareKind::QbeAsm => {
            let qbe = run_cerune_with_heap("emit-qbe", source_path, &["--target", target_name], heap)?;

            run_qbe_asm(&qbe, timestamp, target)
                .or_else(|error| Ok(format!("QBE ASM unavailable:\n{error}")))
        }

        CompareKind::CAsm => {
            let c = run_cerune_with_heap("emit-c", source_path, &[], heap)?;

            run_clang_asm(&c, "c", "c", timestamp, target_name)
                .or_else(|error| Ok(format!("C ASM unavailable:\n{error}")))
        }
    }
}

fn diff_lines(left: &str, right: &str, left_label: &str, right_label: &str) -> String {
    let mut output = String::new();

    if left == right {
        let _ = writeln!(output, "No differences: {left_label} == {right_label}",);

        return output;
    }

    let _ = writeln!(output, "--- {left_label}",);

    let _ = writeln!(output, "+++ {right_label}",);

    let left_lines: Vec<&str> = left.lines().collect();

    let right_lines: Vec<&str> = right.lines().collect();

    let n = left_lines.len();

    let m = right_lines.len();

    // 大きな入力ではLCS表を作らず、共通の接頭辞と接尾辞だけを畳みます。
    if n.saturating_mul(m) > 4_000_000 {
        write_prefix_suffix_diff(&mut output, &left_lines, &right_lines);

        return output;
    }

    let mut table = vec![vec![0u32; m + 1]; n + 1];

    for i in (0..n).rev() {
        for j in (0..m).rev() {
            table[i][j] = if left_lines[i] == right_lines[j] {
                table[i + 1][j + 1] + 1
            } else {
                table[i + 1][j].max(table[i][j + 1])
            };
        }
    }

    let (mut i, mut j) = (0usize, 0usize);

    while i < n && j < m {
        if left_lines[i] == right_lines[j] {
            let _ = writeln!(output, "  {}", left_lines[i]);

            i += 1;

            j += 1;
        } else if table[i + 1][j] >= table[i][j + 1] {
            let _ = writeln!(output, "- {}", left_lines[i]);

            i += 1;
        } else {
            let _ = writeln!(output, "+ {}", right_lines[j]);

            j += 1;
        }
    }

    while i < n {
        let _ = writeln!(output, "- {}", left_lines[i]);

        i += 1;
    }

    while j < m {
        let _ = writeln!(output, "+ {}", right_lines[j]);

        j += 1;
    }

    output
}

fn write_prefix_suffix_diff(output: &mut String, left_lines: &[&str], right_lines: &[&str]) {
    let n = left_lines.len();

    let m = right_lines.len();

    let mut prefix = 0;

    while prefix < n && prefix < m && left_lines[prefix] == right_lines[prefix] {
        prefix += 1;
    }

    let mut suffix = 0;

    while suffix < n - prefix && suffix < m - prefix
        && left_lines[n - 1 - suffix] == right_lines[m - 1 - suffix]
    {
        suffix += 1;
    }

    for line in &left_lines[..prefix] {
        let _ = writeln!(output, "  {line}");
    }

    for line in &left_lines[prefix..n - suffix] {
        let _ = writeln!(output, "- {line}");
    }

    for line in &right_lines[prefix..m - suffix] {
        let _ = writeln!(output, "+ {line}");
    }

    for line in &left_lines[n - suffix..] {
        let _ = writeln!(output, "  {line}");
    }
}

fn run_cerune(command: &str, source_path: &Path, args: &[&str]) -> Result<String, String> {
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

fn heap_arguments(string: Option<u64>, array: Option<u64>) -> Vec<String> {
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

fn run_cerune_with_heap(
    command: &str,
    source_path: &Path,
    args: &[&str],
    heap: &[String],
) -> Result<String, String> {
    let mut merged: Vec<&str> = args.to_vec();

    merged.extend(heap.iter().map(String::as_str));

    run_cerune(command, source_path, &merged)
}

struct ObserveBundle {
    sources: String,
    ir: String,
    mir: String,
    ssa: String,
    ssa_map: String,
    ssa_lowered: String,
    ssa_lowered_map: String,
    lir: String,
    manifest: String,
}

fn read_bundle_file(directory: &Path, name: &str, label: &str) -> Result<String, String> {
    fs::read_to_string(directory.join(name))
        .map_err(|error| format!("failed to read {label}: {error}"))
}

fn run_cerune_observe(
    source_path: &Path,
    target: &str,
    native_ssa: bool,
    heap: &[String],
) -> Result<ObserveBundle, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    let directory = std::env::temp_dir().join(format!(
        "tint-observe-{}-{timestamp}",
        process::id(),
    ));

    let _ = fs::remove_dir_all(&directory);

    let directory_text = directory.to_string_lossy().into_owned();

    let mut args = vec!["--ssa", "--lir", "--target", target, "-o", directory_text.as_str()];

    args.extend(heap.iter().map(String::as_str));

    let result = (|| {
        run_cerune("observe", source_path, &args)?;

        let sources = read_bundle_file(&directory, "sources.json", "sources manifest")?;

        let ir = read_bundle_file(&directory, "program.ceir", "Cerune IR")?;

        let mir = read_bundle_file(&directory, "program.mir.txt", "MIR")?;

        let ssa = read_bundle_file(&directory, "program.ssa.txt", "SSA")?;

        let ssa_map = read_bundle_file(&directory, "program.ssa-map.txt", "SSA mapping")?;

        let ssa_lowered =
            read_bundle_file(&directory, "program.ssa-lowered.mir.txt", "SSA-lowered MIR")?;

        let ssa_lowered_map = read_bundle_file(
            &directory,
            "program.ssa-lowered-map.txt",
            "SSA lowering mapping",
        )?;

        let manifest = read_bundle_file(&directory, "manifest.json", "observation manifest")?;

        let lir = if native_ssa {
            read_bundle_file(&directory, "program.ssa.lir.txt", "SSA LIR")?
        } else {
            read_bundle_file(&directory, "program.lir.txt", "LIR")?
        };

        Ok(ObserveBundle {
            sources,
            ir,
            mir,
            ssa,
            ssa_map,
            ssa_lowered,
            ssa_lowered_map,
            lir,
            manifest,
        })
    })();

    let _ = fs::remove_dir_all(&directory);

    result
}

fn run_cerune_object(
    source_path: &Path,
    target: Target,
    annotate_origins: bool,
    native_ssa: bool,
    timestamp: u128,
    heap: &[String],
) -> Result<String, String> {
    let extension = target.object_extension();

    let object_path =
        std::env::temp_dir().join(format!("tint-{}-{timestamp}.{extension}", process::id(),));

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

fn run_qbe_asm(qbe: &str, timestamp: u128, target: Target) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();

    let stem = format!("tint-{}-{timestamp}", process::id(),);

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

fn run_clang_asm(
    source: &str,
    extension: &str,
    kind: &str,
    timestamp: u128,
    target: &str,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();

    let stem = format!("tint-{}-{timestamp}", process::id(),);

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

#[cfg(test)]
mod tests {
    use super::diff_lines;

    #[test]
    fn identical_inputs_report_no_differences() {
        let result = diff_lines("a\nb\n", "a\nb\n", "left", "right");

        assert_eq!(result, "No differences: left == right\n");
    }

    #[test]
    fn changed_line_is_shown_as_delete_and_insert() {
        let result = diff_lines("a\nb\nc\n", "a\nx\nc\n", "left", "right");

        assert!(result.contains("- b\n"), "{result}");

        assert!(result.contains("+ x\n"), "{result}");

        assert!(result.contains("  a\n"), "{result}");

        assert!(result.contains("  c\n"), "{result}");
    }

    #[test]
    fn added_line_is_shown_as_insert() {
        let result = diff_lines("a\nc\n", "a\nb\nc\n", "left", "right");

        assert!(result.contains("  a\n"), "{result}");

        assert!(result.contains("+ b\n"), "{result}");

        assert!(result.contains("  c\n"), "{result}");

        assert!(!result.lines().any(|line| line.starts_with("- ")), "{result}");
    }

    #[test]
    fn prefix_and_suffix_are_preserved_for_large_inputs() {
        let left = format!("{}\n{}\n{}", "head".repeat(10), "old".repeat(10), "tail".repeat(10));

        let right = format!("{}\n{}\n{}", "head".repeat(10), "new".repeat(10), "tail".repeat(10));

        let result = diff_lines(&left, &right, "left", "right");

        assert!(result.contains(&format!("- {}", "old".repeat(10))), "{result}");

        assert!(result.contains(&format!("+ {}", "new".repeat(10))), "{result}");
    }
}
