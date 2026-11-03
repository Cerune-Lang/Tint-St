<div align="center">

# Tint*

[日本語](README.md) | English

Tint* is a visual tool for inspecting [Cerune](https://github.com/Cerune-Lang/Cerune) compilation and execution results.

[Try in your browser](https://tint.hokutaka.dev/) · [Usage](docs/reference/usage.en.md) · [Development](docs/development.en.md) · [Technical docs](docs/README.md)

![Tint* screenshot](images/image.png)

</div>

## Try it

The [browser version](https://tint.hokutaka.dev/) requires no installation. It runs Cerune through WebAssembly and does not support native code generation or target comparison.

For desktop development, install the [Cerune CLI and Tauri prerequisites](docs/development.en.md).

```sh
git clone https://github.com/Cerune-Lang/Tint-St.git
cd Tint-St
npm ci
npm run tauri dev
```

## Features

- **Inspect:** Cerune IR / MIR / SSA, C, LLVM IR, QBE IR, WAT, x86-64 assembly, object files, bytecode
- **Execute:** Run IR / MIR / SSA / VM explicitly
- **Compare:** Windows/Linux generated output, source locations, saved snapshots

Browser and desktop features differ. See [usage and shortcuts](docs/reference/usage.en.md).

## Documentation

[Documentation index](docs/README.md) · [Implementation](docs/playground-architecture.md)

## License

[MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
