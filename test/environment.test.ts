import test from "node:test";
import assert from "node:assert/strict";

import { detectEnvironment } from "../src/environment";

test("detects the http environment from server and token", () => {
  const environment = detectEnvironment(
    "?server=http://127.0.0.1:51789&token=abc123",
    false,
  );

  assert.deepEqual(environment, {
    kind: "http",
    serverUrl: "http://127.0.0.1:51789",
    token: "abc123",
  });
});

test("detects the tauri environment on the tauri runtime", () => {
  assert.deepEqual(detectEnvironment("", true), {
    kind: "tauri",
  });
});

test("defaults to the wasm environment in the browser", () => {
  assert.deepEqual(detectEnvironment("", false), {
    kind: "wasm",
  });
});

test("prefers the http environment regardless of the runtime", () => {
  assert.deepEqual(
    detectEnvironment(
      "?server=http://127.0.0.1:1&token=abc",
      true,
    ),
    {
      kind: "http",
      serverUrl: "http://127.0.0.1:1",
      token: "abc",
    },
  );
});

test("requires both server and token for the http environment", () => {
  assert.deepEqual(
    detectEnvironment("?server=http://127.0.0.1:1", false),
    { kind: "wasm" },
  );

  assert.deepEqual(
    detectEnvironment("?token=abc", false),
    { kind: "wasm" },
  );
});
