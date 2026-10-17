import test from "node:test";
import assert from "node:assert/strict";

import {
  directoryOf,
  normalizePath,
  parseImports,
} from "../src/imports";

test("normalizes windows extended paths", () => {
  assert.equal(
    normalizePath("\\\\?\\C:\\Work\\Main.Ceru"),
    "c:/work/main.ceru",
  );
});

test("normalizes separators and case", () => {
  assert.equal(
    normalizePath("C:\\Work\\values.ceru"),
    "c:/work/values.ceru",
  );

  assert.equal(
    normalizePath("a/b.ceru"),
    "a/b.ceru",
  );
});

test("finds the directory of a path", () => {
  assert.equal(
    directoryOf("c:/work/main.ceru"),
    "c:/work",
  );

  assert.equal(
    directoryOf("c:\\work\\main.ceru"),
    "c:\\work",
  );

  assert.equal(directoryOf("main.ceru"), "");
});

test("parses import statements", () => {
  const text = [
    'import "values.ceru" as values;',
    "integer: i64 = values.one;",
    'import "nested/deep.ceru" as deep;',
  ].join("\n");

  assert.deepEqual(parseImports(text), [
    { path: "values.ceru", alias: "values" },
    { path: "nested/deep.ceru", alias: "deep" },
  ]);
});

test("ignores imports without an alias", () => {
  assert.deepEqual(
    parseImports('import "values.ceru";'),
    [],
  );
});

test("parsing is stateless across calls", () => {
  const text = 'import "a.ceru" as a;';

  assert.deepEqual(parseImports(text), parseImports(text));
});
