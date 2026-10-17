import test from "node:test";
import assert from "node:assert/strict";

import { diagnosticOffsets } from "../src/diagnostics";

test("maps the first line first column", () => {
  assert.deepEqual(
    diagnosticOffsets(
      { line: 1, column: 1 },
      [10, 5, 3],
    ),
    { from: 0, to: 1 },
  );
});

test("maps a column in the middle of a line", () => {
  assert.deepEqual(
    diagnosticOffsets(
      { line: 1, column: 4 },
      [10, 5, 3],
    ),
    { from: 3, to: 4 },
  );
});

test("counts newlines for later lines", () => {
  assert.deepEqual(
    diagnosticOffsets(
      { line: 2, column: 1 },
      [10, 5, 3],
    ),
    { from: 11, to: 12 },
  );

  assert.deepEqual(
    diagnosticOffsets(
      { line: 3, column: 2 },
      [10, 5, 3],
    ),
    { from: 18, to: 19 },
  );
});

test("clamps the line number into range", () => {
  assert.deepEqual(
    diagnosticOffsets(
      { line: 99, column: 1 },
      [10, 5, 3],
    ),
    { from: 17, to: 18 },
  );

  assert.deepEqual(
    diagnosticOffsets(
      { line: 0, column: 1 },
      [10, 5, 3],
    ),
    { from: 0, to: 1 },
  );
});

test("clamps the column to the end of the line", () => {
  assert.deepEqual(
    diagnosticOffsets(
      { line: 1, column: 100 },
      [10, 5, 3],
    ),
    { from: 10, to: 10 },
  );

  assert.deepEqual(
    diagnosticOffsets(
      { line: 1, column: 0 },
      [10, 5, 3],
    ),
    { from: 0, to: 1 },
  );
});

test("handles an empty line list", () => {
  assert.deepEqual(
    diagnosticOffsets(
      { line: 1, column: 1 },
      [],
    ),
    { from: 0, to: 0 },
  );
});

test("matches the code mirror positions for a two line doc", () => {
  const lineLengths = [3, 3];

  assert.deepEqual(
    diagnosticOffsets(
      { line: 2, column: 1 },
      lineLengths,
    ),
    { from: 4, to: 5 },
  );
});
