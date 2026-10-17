import type { Diagnostic } from "./types";

export interface DiagnosticRange {
  from: number;
  to: number;
}

/**
 * 診断の 1 始まりの行・桁を、ソースの文字オフセット範囲へ変換します。
 * `lineLengths` は各行の改行を含まない長さです（CodeMirror の `doc.line(n).length` 相当）。
 */
export function diagnosticOffsets(
  diagnostic: Pick<Diagnostic, "line" | "column">,
  lineLengths: number[],
): DiagnosticRange {
  const lineCount = lineLengths.length;

  const lineIndex =
    Math.min(
      Math.max(diagnostic.line, 1),
      Math.max(lineCount, 1),
    ) - 1;

  let offset = 0;

  for (
    let index = 0;
    index < lineIndex;
    index += 1
  ) {
    offset += lineLengths[index] + 1;
  }

  const length = lineLengths[lineIndex] ?? 0;

  const columnIndex = Math.min(
    Math.max(diagnostic.column - 1, 0),
    length,
  );

  const from = offset + columnIndex;

  const to = Math.min(
    from + 1,
    offset + length,
  );

  return {
    from,
    to: Math.max(to, from),
  };
}
