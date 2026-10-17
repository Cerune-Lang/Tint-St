export function normalizePath(path: string): string {
  return path
    .replace(/^\\\\\?\\/, "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

export function directoryOf(path: string): string {
  const index = Math.max(
    path.lastIndexOf("/"),
    path.lastIndexOf("\\"),
  );

  return index >= 0
    ? path.slice(0, index)
    : "";
}

export interface ParsedImport {
  path: string;
  alias: string;
}

export function parseImports(
  text: string,
): ParsedImport[] {
  const imports: ParsedImport[] = [];

  const pattern =
    /import\s+"([^"]+)"\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g;

  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    imports.push({
      path: match[1],
      alias: match[2],
    });
  }

  return imports;
}
