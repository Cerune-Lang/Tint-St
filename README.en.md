[日本語](README.md) | **English**

# Tint*

Tint* is a small visual environment for observing Cerune's code generation process and execution paths.

Write Cerune. Generate it. Look at it.

From a single screen, you can observe how the same source code is transformed across Cerune IR, MIR, SSA, different backends, Assembly, Object files, Bytecode, and multiple execution paths.

![Tint*](images/image.png)

```text
Cerune source
     │
     ▼
   Tint*
     │
     ├─ Pipeline
     │    ├─ Sources
     │    ├─ Cerune IR
     │    ├─ MIR
     │    └─ SSA
     │
     ├─ Backends
     │    ├─ C
     │    │    ├─ Source
     │    │    └─ ASM
     │    ├─ LLVM
     │    │    ├─ IR
     │    │    └─ ASM
     │    ├─ QBE
     │    │    ├─ IR
     │    │    └─ ASM
     │    ├─ WASM
     │    │    └─ WAT
     │    ├─ Native
     │    │    ├─ ASM
     │    │    └─ Object
     │    └─ VM
     │         └─ Bytecode
     │
     └─ Execution
          ├─ IR
          ├─ MIR
          ├─ SSA
          └─ VM
```

## Features

- Cerune syntax highlighting
- Open / save `.ceru` files
- Save As
- Rename the current source file
- Display loaded Sources
- Display Cerune IR
- Display MIR
- Display SSA-form MIR
- Generate C
- Generate LLVM IR
- Generate WebAssembly Text (`.wat`)
- Generate QBE IR
- Generate x86-64 Assembly directly
- Generate Cerune Bytecode
- Observe C ASM through Clang
- Observe LLVM ASM through Clang
- Observe QBE ASM through QBE
- Switch between Windows x64 / Linux x86-64 targets
- Display Origins / Provenance annotations
- Generate COFF / ELF Object files
- Inspect Object Sections / Symbols / Relocations
- Inspect Origin Symbols stored in Object files, grouped by NodeId
- Explicitly execute one selected IR / MIR / SSA / VM path
- Switch between Pipeline / Backends / Execution
- Validate with Cerune before code generation
- Keyboard shortcuts

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+Enter` | Emit |

## Targets

Tint* can switch the target used for native code generation.

```text
Windows x64
  x86_64-pc-windows-msvc

Linux x86-64
  x86_64-unknown-linux-gnu
```

The selected target is used for outputs such as LLVM IR, Assembly generated through Clang, QBE IR / QBE ASM, Direct ASM, and Object generation.

For QBE ASM, Tint* switches the QBE ABI according to the selected target.

```text
Windows x64
  → amd64_win

Linux x86-64
  → amd64_sysv
```

## Origins

When `Origins` is enabled, Cerune preserves Provenance information in generated artifacts.

LLVM IR and Direct ASM receive annotations that allow Cerune IR NodeIds and source locations to be traced through generated code.

```text
Cerune source
     │
     ▼
Cerune IR
  Node #N
     │
     ▼
LLVM IR / Direct ASM
     │
     ▼
Object Symbols
```

When Origins is enabled during Object generation, `cerune_origin_...` symbols are also preserved in the Object symbol table.

Tint* separates these from normal Symbols and displays them as `Origin Symbols` grouped by NodeId.

```text
=== Origin Symbols ===

Node #10
  0x00000057  cerune_origin_n10_main_7
  0x0000007d  cerune_origin_n10_main_15

Node #11
  0x0000008a  cerune_origin_n11_main_17
```

This makes it possible to trace Provenance from source code through Cerune IR, Assembly, and Object files.

## Object

Tint* uses Cerune's `emit-obj` to generate native Object files.

```text
Windows x64
  → COFF .obj

Linux x86-64
  → ELF .o
```

Generated Object files are not shown as raw binary dumps. Tint* parses and displays their structure.

```text
Target
Format
Architecture
Kind
Size

Sections
Symbols
Origin Symbols
Relocations
```

The generated files are relocatable objects and can be linked into executables by an external linker.

## Requirements

Tint* uses the Cerune CLI for validation, code generation, and execution.

First, install Cerune.

```sh
git clone https://github.com/Hokutaka/Cerune.git
cd Cerune
cargo install --path .
```

Make sure the `cerune` command is available in `PATH`.

```sh
cerune --version
```

If you are developing Cerune and Tint* at the same time, reinstall the CLI after making changes to Cerune.

```sh
cargo install --path . --force
```

Developing Tint* also requires the usual Tauri development environment for your platform.

### Clang

`C ASM` and `LLVM ASM` are generated using Clang.

Make sure `clang` is available in `PATH`.

```sh
clang --version
```

Tint* also passes the selected Cerune target to Clang.

```text
x86_64-pc-windows-msvc
x86_64-unknown-linux-gnu
```

### QBE

QBE is used to generate `QBE ASM`.

In the current Windows environment, Tint* invokes QBE through WSL.

```sh
wsl qbe
```

QBE IR itself is generated directly by Cerune.

QBE is only required when that IR is further converted into Assembly for display as `QBE ASM`.

QBE ASM uses `amd64_win` or `amd64_sysv` according to the selected target.

## Development

Clone the Tint* repository and install the frontend dependencies.

```sh
npm install
```

Start the app in development mode.

```sh
npm run tauri dev
```

Build the application.

```sh
npm run tauri build
```

To check only the Rust side, run the following from `src-tauri`.

```sh
cd src-tauri
cargo fmt
cargo check
```

### Testing

Frontend (TypeScript) unit tests run with `tsx` and Node's built-in test runner. They cover the pure logic: UTF-8 byte/char mapping, origin parsing, import parsing, diagnostic positions, and settings persistence.

```sh
npm test
```

The Rust side separates unit tests that never spawn external commands from integration tests that invoke the real `cerune`.

```sh
cd src-tauri
cargo test --lib                          # unit tests (no external commands)
cargo test --test cerune_cli_integration  # integration tests (requires cerune)
```

Integration tests are skipped when `cerune` is not on `PATH`. When `clang` or `wsl qbe` is missing, `observe` reports the corresponding assembly as "unavailable".

## How it works

Tint* does not embed Cerune's compiler implementation inside the application.

Tint* invokes the installed Cerune CLI and treats **Observation** and **Execution** as separate operations.

### Observation

When you Emit, Tint* prepares a temporary `.ceru` source file and retrieves representations and generated artifacts without executing the program.

```text
Tint*
 │
 ├─ cerune check
 ├─ cerune emit-sources
 ├─ cerune emit-ir
 ├─ cerune emit-mir
 ├─ cerune emit-mir --ssa
 ├─ cerune emit-c
 ├─ cerune emit-llvm
 ├─ cerune emit-wat
 ├─ cerune emit-qbe
 ├─ cerune emit-asm
 ├─ cerune emit-obj
 └─ cerune emit-bytecode
```

Some views are generated directly by Cerune.

```text
Cerune → Sources
Cerune → Cerune IR
Cerune → MIR
Cerune → SSA
Cerune → C
Cerune → LLVM IR
Cerune → WAT
Cerune → QBE IR
Cerune → Direct ASM
Cerune → Object
Cerune → Bytecode
```

Other views intentionally show transformations performed by external tools.

```text
Cerune → C
       → Clang
       → C ASM

Cerune → LLVM IR
       → Clang
       → LLVM ASM

Cerune → QBE IR
       → QBE
       → QBE ASM
```

Tint* parses the COFF / ELF Object generated by Cerune.

```text
Cerune
  ↓
Object
  ↓
Tint*
  ├─ Sections
  ├─ Symbols
  ├─ Origin Symbols
  └─ Relocations
```

### Execution

Execution explicitly runs only the selected execution path.

```text
IR
  → cerune run

MIR
  → cerune run-mir

SSA
  → cerune run-mir --ssa

VM
  → cerune run-vm
```

Tint* does not automatically execute multiple paths when you Emit.

This keeps observation-oriented code generation separate from actually running the program.

## Design

Tint* is intentionally small.

It is not intended to be a general-purpose, full-featured IDE.

Tint* is not an IDE for writing code first; it is an observation UI for walking through the compiler.

It focuses on writing Cerune and observing how the same source changes across representations, backends, and execution paths.

The interface fundamentally focuses on:

```text
source | representation / output
```

Observation and Execution are intentionally separated.

Observation retrieves representations and generated artifacts without running the program.

Execution explicitly runs only the single path selected by the user.

Cerune is responsible for the language, semantic analysis, IR, MIR, SSA, backends, Bytecode, the VM, and Provenance.

External tools such as Clang and QBE are responsible for their respective additional transformations.

Tint* is a window for observing all of them together.

## Name

`tint` means a pale color made by adding white to a color.
