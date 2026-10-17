import assert from "node:assert/strict";
import test from "node:test";

import type { BackendCapabilities } from "../src/backend";

import {
  ALL_OUTPUTS,
  backendAvailable,
  executionPathForOutput,
  groupForOutput,
  outputAvailable,
  unavailableReason,
} from "../src/capabilities";

/** Desktop 版（Tauri）/ ローカル HTTP 版の機能フラグ。 */
const nativeCapabilities: BackendCapabilities = {
  check: true,
  observe: true,
  execute: true,
  compare: true,
  modules: true,
  snapshots: true,
  rename: true,
};

/** `experiments/wasm` の `capabilities()` が返すフラグ。 */
const wasmCapabilities: BackendCapabilities = {
  check: true,
  observe: true,
  execute: true,
  compare: false,
  modules: false,
  snapshots: false,
  rename: false,

  outputs: [
    "sources",
    "ir",
    "bytecode",
    "wat",
    "irOutput",
    "mirOutput",
    "vmOutput",
  ],

  executionPaths: ["ir", "mir", "vm"],

  native: false,
  heapLimits: false,
};

test("groups every output kind", () => {
  for (const kind of ALL_OUTPUTS) {
    assert.ok(
      groupForOutput(kind),
      `${kind} should belong to a group`,
    );
  }
});

test("execution path is derived from execution outputs", () => {
  assert.equal(executionPathForOutput("irOutput"), "ir");
  assert.equal(executionPathForOutput("mirOutput"), "mir");
  assert.equal(executionPathForOutput("ssaOutput"), "ssa");
  assert.equal(executionPathForOutput("vmOutput"), "vm");
  assert.equal(executionPathForOutput("ir"), null);
});

test("native capabilities make every output available", () => {
  for (const kind of ALL_OUTPUTS) {
    assert.equal(
      outputAvailable(kind, nativeCapabilities),
      true,
      `${kind} should be available`,
    );
  }

  for (const backend of [
    "c",
    "llvm",
    "qbe",
    "wasm",
    "native",
    "vm",
  ]) {
    assert.equal(
      backendAvailable(backend, nativeCapabilities),
      true,
      `${backend} should be available`,
    );
  }
});

test("wasm capabilities expose only the wasm-supported outputs", () => {
  const supported = [
    "sources",
    "ir",
    "bytecode",
    "wat",
    "irOutput",
    "mirOutput",
    "vmOutput",
  ];

  for (const kind of ALL_OUTPUTS) {
    assert.equal(
      outputAvailable(kind, wasmCapabilities),
      supported.includes(kind),
      `${kind} availability`,
    );
  }
});

test("wasm disables native-only outputs", () => {
  for (const kind of [
    "c",
    "llvm",
    "qbe",
    "lir",
    "directAsm",
    "object",
    "ssa",
    "ssaOutput",
    "manifest",
    "cmpLlvm",
    "modules",
  ] as const) {
    assert.equal(
      outputAvailable(kind, wasmCapabilities),
      false,
      `${kind} should be unavailable`,
    );
  }
});

test("wasm disables the SSA execution path", () => {
  assert.equal(
    outputAvailable("ssaOutput", wasmCapabilities),
    false,
  );

  assert.equal(
    groupForOutput("ssaOutput"),
    "execution",
  );
});

test("wasm backend tabs reflect their outputs", () => {
  assert.equal(
    backendAvailable("wasm", wasmCapabilities),
    true,
  );

  assert.equal(
    backendAvailable("vm", wasmCapabilities),
    true,
  );

  for (const backend of [
    "c",
    "llvm",
    "qbe",
    "native",
  ]) {
    assert.equal(
      backendAvailable(backend, wasmCapabilities),
      false,
      `${backend} should be unavailable`,
    );
  }
});

test("unavailable reasons point at the desktop build", () => {
  for (const group of [
    "pipeline",
    "backends",
    "execution",
    "compare",
    "modules",
  ] as const) {
    const reason = unavailableReason(group);

    assert.ok(reason.length > 0);
    assert.match(reason, /Desktop/);
    assert.match(reason, /HTTP/);
  }
});
