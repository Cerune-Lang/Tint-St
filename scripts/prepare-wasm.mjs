import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const crateDir = join(projectRoot, "experiments", "wasm");
const pkgDir = join(crateDir, "pkg");
const outDir = join(projectRoot, "public", "wasm");

const files = ["tint_wasm.js", "tint_wasm_bg.wasm"];

const result = spawnSync(
  "wasm-pack",
  ["build", "--release", "--target", "web"],
  {
    cwd: crateDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const file of files) {
  cpSync(join(pkgDir, file), join(outDir, file));
}

console.log(`WASM を ${outDir} に配置しました`);
