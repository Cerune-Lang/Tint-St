# Using Tint*

[日本語](usage.ja.md) · [README](../../README.en.md)

## Start

[Browser](https://tint.hokutaka.dev/) runs Cerune through WebAssembly. The desktop development build requires Cerune CLI and starts with `npm run tauri dev`.

[Setup](../development.en.md)

## Workspace

| Item | Action |
| --- | --- |
| Emit | Generate Cerune outputs without executing the source |
| Pipeline | Sources, IR, MIR, SSA, SSA Map, SSA→MIR, Manifest |
| Backends | C, LLVM, QBE, WAT, native LIR / ASM / Object, VM bytecode |
| Execution | Explicitly run one of IR / MIR / SSA / VM |
| Compare | Compare Windows x64 and Linux x86-64 output |
| Modules | Browse imported Cerune files |
| Snapshot / History | Save outputs and compare them against current results |

## Shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+Enter` | Emit |
| `Ctrl+O` | Open |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+G` | Go to line |

## Native output

- **Target:** `x86_64-pc-windows-msvc` or `x86_64-unknown-linux-gnu`
- **Origins:** Navigate between NodeIds/UTF-8 byte offsets and Cerune source
- **Native SSA:** Generate native LIR / ASM / objects through SSA
- **Object:** Inspect COFF / ELF sections, symbols, origin symbols, and relocations
- **str heap / arr heap:** Set Cerune heap limits

Clang is needed for C ASM and LLVM ASM; QBE is needed for QBE ASM.

## Browser limitations

WASM offers Sources, IR, bytecode and WAT output, plus IR / MIR / VM execution. Native output, SSA, target comparison, modules, and snapshots are unavailable.

Use [local HTTP mode](../development.en.md#local-http-mode) with Cerune CLI for native features.
