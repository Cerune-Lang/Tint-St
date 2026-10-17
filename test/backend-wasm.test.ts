import test from "node:test";
import assert from "node:assert/strict";

import {
  createWasmBackend,
  type WasmModule,
} from "../src/backend-wasm";

import type { ObserveArgs } from "../src/backend";

function fakeModule(
  overrides: Partial<WasmModule> = {},
): WasmModule {
  return {
    capabilities: () =>
      JSON.stringify({
        check: true,
        observe: true,
        execute: true,
        compare: false,
        modules: false,
        snapshots: false,
        rename: false,
      }),

    check: (source) =>
      source.includes("missing")
        ? '[{"line":1,"column":7,"message":"unknown binding","severity":"error"}]'
        : "[]",

    emit_ir: () => "; Cerune IR v0.2\nprint\n",

    emit_bytecode: () => "bytecode\n",

    emit_wat: () => "(module)\n",

    execute: (source, path) => `${path}:${source}\n`,

    ...overrides,
  };
}

const observeArgs: ObserveArgs = {
  source: "x: i64 = 1;",
  sourcePath: null,
  target: "x86_64-unknown-linux-gnu",
  annotateOrigins: false,
  nativeSsa: false,
  stringHeapLimit: null,
  arrayHeapLimit: null,
};

test("reports the capabilities exposed by the wasm module", async () => {
  const backend = createWasmBackend(fakeModule());

  assert.deepEqual(await backend.capabilities(), {
    check: true,
    observe: true,
    execute: true,
    compare: false,
    modules: false,
    snapshots: false,
    rename: false,
  });
});

test("parses diagnostics from the wasm module", async () => {
  const backend = createWasmBackend(fakeModule());

  assert.deepEqual(await backend.check("print(missing);", null), [
    {
      line: 1,
      column: 7,
      message: "unknown binding",
      severity: "error",
    },
  ]);

  assert.deepEqual(
    await backend.check("x: i64 = 1;", null),
    [],
  );
});

test("fills the supported observation outputs only", async () => {
  const backend = createWasmBackend(fakeModule());

  const observation = await backend.observe(observeArgs);

  assert.equal(observation.sources, "x: i64 = 1;");
  assert.equal(observation.ir, "; Cerune IR v0.2\nprint\n");
  assert.equal(observation.bytecode, "bytecode\n");
  assert.equal(observation.wat, "(module)\n");

  assert.equal(observation.llvm, "");
  assert.equal(observation.object, "");
  assert.equal(observation.manifest, "");
});

test("executes through the requested path", async () => {
  const backend = createWasmBackend(fakeModule());

  const result = await backend.execute({
    source: "print(1);",
    sourcePath: null,
    path: "vm",
    stringHeapLimit: null,
    arrayHeapLimit: null,
  });

  assert.equal(result.output, "vm:print(1);\n");
});

test("rejects the features the wasm backend cannot provide", async () => {
  const backend = createWasmBackend(fakeModule());

  await assert.rejects(
    backend.compare({
      source: "",
      sourcePath: null,
      kind: "lir",
      annotateOrigins: false,
      nativeSsa: false,
      stringHeapLimit: null,
      arrayHeapLimit: null,
    }),
    /compare is not supported/,
  );

  await assert.rejects(
    backend.loadModules("", null),
    /loadModules is not supported/,
  );

  await assert.rejects(
    backend.saveSnapshot({
      label: "l",
      target: "t",
      source: "",
      outputs: {},
    }),
    /saveSnapshot is not supported/,
  );

  await assert.rejects(
    backend.diff({
      left: "a",
      right: "b",
      leftLabel: "l",
      rightLabel: "r",
    }),
    /diff is not supported/,
  );

  await assert.rejects(
    backend.renameSource("a.ceru", "b.ceru"),
    /renameSource is not supported/,
  );
});
