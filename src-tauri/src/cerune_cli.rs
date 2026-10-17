use crate::interface::{
    ExecuteRequest, ExecutionPath, ExecutionResult, Observation, ObserveRequest, Target,
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
        run_cerune("check", &source_path, &[])?;

        let sources = run_cerune("emit-sources", &source_path, &[])?;

        let ir = run_cerune_with_heap("emit-ir", &source_path, &[], &heap)?;

        let mir = run_cerune_with_heap("emit-mir", &source_path, &[], &heap)?;

        let ssa = run_cerune_with_heap("emit-mir", &source_path, &["--ssa"], &heap)?;

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

        let mut lir_args = vec!["--target", target_name];

        if native_ssa {
            lir_args.push("--ssa");
        }

        let lir = run_cerune_with_heap("emit-lir", &source_path, &lir_args, &heap)?;

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
