# Developing Tint*

[日本語](development.ja.md) · [README](../README.en.md)

## Prerequisites

- Node.js / npm, Rust / Cargo
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for desktop
- [Cerune CLI](https://github.com/Cerune-Lang/Cerune) for desktop / local HTTP

Install Cerune CLI from source:

```sh
git clone https://github.com/Cerune-Lang/Cerune.git
cd Cerune
cargo install --path .
cerune --version
```

After updating Cerune, run `cargo install --path . --force` to reinstall its CLI.

## Desktop

```sh
git clone https://github.com/Cerune-Lang/Tint-St.git
cd Tint-St
npm ci
npm run tauri dev
```

Build with `npm run tauri build`.

## Tests

```sh
npm test
cargo check
cargo test
```

`cargo test -p tint-core --test cerune_cli_integration` uses Cerune CLI; relevant integration tests skip when it is unavailable.

## Clang and QBE

C ASM and LLVM ASM require `clang`; QBE ASM requires `qbe`. On Windows, QBE is invoked through WSL. Outputs requiring missing tools are shown as `unavailable`.

## Local HTTP mode

The desktop application starts an HTTP server in its own process. To run it separately:

```sh
cargo run -p tint-server
npm run build
npm run preview
```

Append `?server=<base_url>&token=<token>` to the browser URL using values printed by `tint-server`. The server listens only on `127.0.0.1`. Keep the token private.

## Browser WASM version

`experiments/wasm` expects a sibling Cerune directory:

```text
workspace/
├── Cerune/
└── Tint-St/
```

Install Rust's `wasm32-unknown-unknown` target and `wasm-pack`, then run:

```sh
npm ci
npm run build:pages
npm run test:wasm
```

See [pages.yml](../.github/workflows/pages.yml) for GitHub Pages build settings.
