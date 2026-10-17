export interface OriginAnnotation {
  line: number;
  node: string;
  start: number;
  end: number;
}

export const originPattern =
  /cerune-origin:\s*#(\S+)\s+bytes\s+(\d+)\.\.(\d+)/;

export function parseOriginAnnotations(
  text: string,
): OriginAnnotation[] {
  const annotations: OriginAnnotation[] = [];

  const lines = text.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const match = originPattern.exec(
      lines[index],
    );

    if (!match) {
      continue;
    }

    annotations.push({
      line: index,
      node: match[1],
      start: Number(match[2]),
      end: Number(match[3]),
    });
  }

  return annotations;
}

/**
 * UTF-8 のバイト位置を UTF-16 の文字位置へ変換する表を返します。
 * `map[byte]` がそのバイト位置に対応する文字位置です。
 */
export function buildByteToChar(
  text: string,
): Uint32Array {
  const bytes = new TextEncoder().encode(text);

  const map = new Uint32Array(bytes.length + 1);

  let byte = 0;

  let char = 0;

  while (char < text.length) {
    const codePoint = text.codePointAt(char) ?? 0;

    const units = codePoint > 0xffff ? 2 : 1;

    const size =
      codePoint < 0x80
        ? 1
        : codePoint < 0x800
          ? 2
          : codePoint < 0x10000
            ? 3
            : 4;

    for (let offset = 0; offset < size; offset += 1) {
      map[byte + offset] = char;
    }

    byte += size;

    char += units;
  }

  map[byte] = text.length;

  return map;
}

export function charRangeForBytes(
  byteToChar: Uint32Array,
  start: number,
  end: number,
): { from: number; to: number } {
  const last = byteToChar.length - 1;

  return {
    from: byteToChar[Math.min(start, last)],
    to: byteToChar[Math.min(end, last)],
  };
}

export function isInstructionLine(
  line: string,
): boolean {
  const trimmed = line.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed === "{" || trimmed === "}") {
    return false;
  }

  if (/^[#;.]/.test(trimmed)) {
    return false;
  }

  if (trimmed.endsWith(":")) {
    return false;
  }

  return true;
}
