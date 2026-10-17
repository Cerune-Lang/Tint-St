export type Target =
  | "x86_64-pc-windows-msvc"
  | "x86_64-unknown-linux-gnu";

export type ExecutionPath =
  | "ir"
  | "mir"
  | "ssa"
  | "vm";

export interface ExecutionResult {
  output: string;
}

export type OutputKind =
  | "sources"
  | "ir"
  | "mir"
  | "ssa"
  | "ssaMap"
  | "ssaLowered"
  | "ssaLoweredMap"
  | "manifest"
  | "c"
  | "cAsm"
  | "llvm"
  | "llvmAsm"
  | "wat"
  | "qbe"
  | "qbeAsm"
  | "lir"
  | "directAsm"
  | "object"
  | "bytecode"
  | "irOutput"
  | "mirOutput"
  | "ssaOutput"
  | "vmOutput"
  | "cmpLir"
  | "cmpDirectAsm"
  | "cmpObject"
  | "cmpLlvm"
  | "cmpLlvmAsm"
  | "cmpQbe"
  | "cmpQbeAsm"
  | "cmpCAsm"
  | "modules";

export interface ObservationResult {
  sources: string;
  ir: string;
  mir: string;
  ssa: string;

  ssaMap: string;
  ssaLowered: string;
  ssaLoweredMap: string;
  manifest: string;

  c: string;
  cAsm: string;

  llvm: string;
  llvmAsm: string;

  wat: string;

  qbe: string;
  qbeAsm: string;

  lir: string;

  directAsm: string;
  object: string;

  bytecode: string;
}

export interface SnapshotMeta {
  id: string;
  createdAt: number;
  label: string;
  target: string;
}

export interface Snapshot {
  id: string;
  createdAt: number;
  label: string;
  target: string;
  source: string;
  outputs: Record<string, string>;
}

export interface Diagnostic {
  line: number;
  column: number;
  message: string;
  severity: string;
}

export interface ModuleFile {
  id: number;
  name: string;
  text: string;
}

export interface OpenFile {
  path: string;
  name: string;
  text: string;
}
