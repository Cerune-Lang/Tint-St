use std::fs;
use std::path::Path;

use crate::interface::{Observation, ObserveRequest};

use super::object::run_cerune_object;
use super::process;
use super::toolchain::{run_clang_asm, run_qbe_asm};

pub fn observe(request: ObserveRequest) -> Result<Observation, String> {
    let target = request.target;

    let target_name = target.as_str();

    let annotate_origins = request.annotate_origins;

    let native_ssa = request.native_ssa;

    let heap = process::heap_arguments(request.string_heap_limit, request.array_heap_limit);

    let timestamp = process::timestamp();

    let source_path =
        process::write_temp_source(&request.source, request.source_path.as_deref(), timestamp)?;

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

        let c = process::run_cerune_with_heap("emit-c", &source_path, &[], &heap)?;

        let c_asm = run_clang_asm(&c, "c", "c", timestamp, target_name)
            .unwrap_or_else(|error| format!("C ASM unavailable:\n{error}"));

        let llvm = if annotate_origins {
            process::run_cerune_with_heap(
                "emit-llvm",
                &source_path,
                &["--target", target_name, "--annotate-origins"],
                &heap,
            )?
        } else {
            process::run_cerune_with_heap(
                "emit-llvm",
                &source_path,
                &["--target", target_name],
                &heap,
            )?
        };

        let llvm_asm = run_clang_asm(&llvm, "ll", "llvm", timestamp, target_name)
            .unwrap_or_else(|error| format!("LLVM ASM unavailable:\n{error}"));

        let wat = process::run_cerune_with_heap("emit-wat", &source_path, &[], &heap)?;

        let qbe = process::run_cerune_with_heap(
            "emit-qbe",
            &source_path,
            &["--target", target_name],
            &heap,
        )?;

        let qbe_asm = run_qbe_asm(&qbe, timestamp, target)
            .unwrap_or_else(|error| format!("QBE ASM unavailable:\n{error}"));

        let mut asm_args = vec!["--target", target_name];

        if native_ssa {
            asm_args.push("--ssa");
        }

        if annotate_origins {
            asm_args.push("--annotate-origins");
        }

        let direct_asm = process::run_cerune_with_heap("emit-asm", &source_path, &asm_args, &heap)?;

        let object =
            run_cerune_object(&source_path, target, annotate_origins, native_ssa, timestamp, &heap)?;

        let bytecode = process::run_cerune_with_heap("emit-bytecode", &source_path, &[], &heap)?;

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
    let timestamp = process::timestamp();

    let directory = std::env::temp_dir().join(format!(
        "tint-observe-{}-{timestamp}",
        std::process::id(),
    ));

    let _ = fs::remove_dir_all(&directory);

    let directory_text = directory.to_string_lossy().into_owned();

    let mut args = vec!["--ssa", "--lir", "--target", target, "-o", directory_text.as_str()];

    args.extend(heap.iter().map(String::as_str));

    let result = (|| {
        process::run_cerune("observe", source_path, &args)?;

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
