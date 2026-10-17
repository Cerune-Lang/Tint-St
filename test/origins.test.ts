import test from "node:test";
import assert from "node:assert/strict";

import {
  buildByteToChar,
  charRangeForBytes,
  isInstructionLine,
  parseOriginAnnotations,
} from "../src/origins";

test("byte/char map handles ascii", () => {
  const map = buildByteToChar("abc");

  assert.equal(map.length, 4);

  assert.deepEqual(charRangeForBytes(map, 0, 1), {
    from: 0,
    to: 1,
  });

  assert.deepEqual(charRangeForBytes(map, 1, 3), {
    from: 1,
    to: 3,
  });
});

test("byte/char map handles two byte code points", () => {
  const map = buildByteToChar("é");

  assert.equal(map.length, 3);

  assert.deepEqual(charRangeForBytes(map, 0, 2), {
    from: 0,
    to: 1,
  });
});

test("byte/char map handles four byte code points", () => {
  const map = buildByteToChar("😀");

  assert.equal(map.length, 5);

  assert.deepEqual(charRangeForBytes(map, 0, 4), {
    from: 0,
    to: 2,
  });
});

test("byte/char map mixes ascii and multibyte", () => {
  const map = buildByteToChar("aé😀b");

  assert.equal(map.length, 9);

  assert.deepEqual(charRangeForBytes(map, 1, 3), {
    from: 1,
    to: 2,
  });

  assert.deepEqual(charRangeForBytes(map, 7, 8), {
    from: 4,
    to: 5,
  });
});

test("byte/char map maps the known cerune offset", () => {
  const source = "integer: i64 = 1 + 2;";

  const map = buildByteToChar(source);

  assert.deepEqual(charRangeForBytes(map, 15, 16), {
    from: 15,
    to: 16,
  });

  assert.deepEqual(charRangeForBytes(map, 15, 20), {
    from: 15,
    to: 20,
  });
});

test("byte/char map counts a multibyte prefix", () => {
  const source = "// あ\nx = 1;";

  const map = buildByteToChar(source);

  assert.equal(map[7], 5);
});

test("byte/char range clamps out of range offsets", () => {
  const map = buildByteToChar("abc");

  assert.deepEqual(charRangeForBytes(map, 99, 99), {
    from: 3,
    to: 3,
  });
});

test("parses llvm and asm origin annotations", () => {
  const text = [
    "define i64 @main() {",
    "  ; cerune-origin: #5 bytes 15..20",
    "  ret i64 0",
    "}",
    "# cerune-origin: #9 bytes 0..3",
    "  mov rax, 0",
  ].join("\n");

  assert.deepEqual(parseOriginAnnotations(text), [
    { line: 1, node: "5", start: 15, end: 20 },
    { line: 4, node: "9", start: 0, end: 3 },
  ]);
});

test("origin parsing returns empty for plain text", () => {
  assert.deepEqual(
    parseOriginAnnotations("no annotations here"),
    [],
  );
});

test("detects instruction lines", () => {
  assert.equal(isInstructionLine("mov eax, 1"), true);
  assert.equal(isInstructionLine("  ret "), true);

  assert.equal(isInstructionLine(""), false);
  assert.equal(isInstructionLine("   "), false);
  assert.equal(isInstructionLine("{"), false);
  assert.equal(isInstructionLine("}"), false);
  assert.equal(isInstructionLine("# comment"), false);
  assert.equal(isInstructionLine("; comment"), false);
  assert.equal(isInstructionLine(".section .text"), false);
  assert.equal(isInstructionLine("main:"), false);
});
