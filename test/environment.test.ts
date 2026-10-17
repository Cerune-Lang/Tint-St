import test from "node:test";
import assert from "node:assert/strict";

import { detectEnvironment } from "../src/environment";

test("detects the browser environment from server and token", () => {
  const environment = detectEnvironment(
    "?server=http://127.0.0.1:51789&token=abc123",
  );

  assert.deepEqual(environment, {
    kind: "http",
    serverUrl: "http://127.0.0.1:51789",
    token: "abc123",
  });
});

test("defaults to the tauri environment without parameters", () => {
  assert.deepEqual(detectEnvironment(""), {
    kind: "tauri",
  });
});

test("requires both server and token", () => {
  assert.deepEqual(
    detectEnvironment("?server=http://127.0.0.1:1"),
    { kind: "tauri" },
  );

  assert.deepEqual(
    detectEnvironment("?token=abc"),
    { kind: "tauri" },
  );
});
