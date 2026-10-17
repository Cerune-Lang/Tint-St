use std::fs;
use std::path::Path;

use crate::interface::{CompareKind, CompareRequest, Target};

use super::diff::diff_lines;
use super::object::run_cerune_object;
use super::process;
use super::toolchain::{run_clang_asm, run_qbe_asm};

pub fn compare(request: CompareRequest) -> Result<String, String> {
    let annotate_origins = request.annotate_origins;

    let native_ssa = request.native_ssa;

    let heap = process::heap_arguments(request.string_heap_limit, request.array_heap_limit);

    let timestamp = process::timestamp();

    let source_path =
        process::write_temp_source(&request.source, request.source_path.as_deref(), timestamp)?;

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

            process::run_cerune_with_heap("emit-lir", source_path, &args, heap)
        }

        CompareKind::DirectAsm => {
            let mut args = vec!["--target", target_name];

            if native_ssa {
                args.push("--ssa");
            }

            if annotate_origins {
                args.push("--annotate-origins");
            }

            process::run_cerune_with_heap("emit-asm", source_path, &args, heap)
        }

        CompareKind::Object => {
            run_cerune_object(source_path, target, annotate_origins, native_ssa, timestamp, heap)
        }

        CompareKind::Llvm => {
            if annotate_origins {
                process::run_cerune_with_heap(
                    "emit-llvm",
                    source_path,
                    &["--target", target_name, "--annotate-origins"],
                    heap,
                )
            } else {
                process::run_cerune_with_heap(
                    "emit-llvm",
                    source_path,
                    &["--target", target_name],
                    heap,
                )
            }
        }

        CompareKind::LlvmAsm => {
            let llvm = process::run_cerune_with_heap(
                "emit-llvm",
                source_path,
                &["--target", target_name],
                heap,
            )?;

            run_clang_asm(&llvm, "ll", "llvm", timestamp, target_name)
                .or_else(|error| Ok(format!("LLVM ASM unavailable:\n{error}")))
        }

        CompareKind::Qbe => process::run_cerune_with_heap(
            "emit-qbe",
            source_path,
            &["--target", target_name],
            heap,
        ),

        CompareKind::QbeAsm => {
            let qbe = process::run_cerune_with_heap(
                "emit-qbe",
                source_path,
                &["--target", target_name],
                heap,
            )?;

            run_qbe_asm(&qbe, timestamp, target)
                .or_else(|error| Ok(format!("QBE ASM unavailable:\n{error}")))
        }

        CompareKind::CAsm => {
            let c = process::run_cerune_with_heap("emit-c", source_path, &[], heap)?;

            run_clang_asm(&c, "c", "c", timestamp, target_name)
                .or_else(|error| Ok(format!("C ASM unavailable:\n{error}")))
        }
    }
}
