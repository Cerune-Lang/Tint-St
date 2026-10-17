import { invoke } from "@tauri-apps/api/core";

import type {
  Diagnostic,
  ExecutionPath,
  ExecutionResult,
  ModuleFile,
  ObservationResult,
  Snapshot,
  SnapshotMeta,
  Target,
} from "./types";

export type SourceArgs = {
  source: string;
  sourcePath: string | null;
  stringHeapLimit: string | null;
  arrayHeapLimit: string | null;
};

export type EmitArgs = SourceArgs & {
  target: Target;
  annotateOrigins: boolean;
  nativeSsa: boolean;
};

export type ExecuteArgs = SourceArgs & {
  path: ExecutionPath;
};

export type CompareArgs = {
  source: string;
  sourcePath: string | null;
  kind: string;
  annotateOrigins: boolean;
  nativeSsa: boolean;
  stringHeapLimit: string | null;
  arrayHeapLimit: string | null;
};

export type SnapshotInput = {
  label: string;
  target: string;
  source: string;
  outputs: Record<string, string>;
};

export type DiffArgs = {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
};

export function emitAll(
  args: EmitArgs,
): Promise<ObservationResult> {
  return invoke<ObservationResult>("emit_all", args);
}

export function executeCode(
  args: ExecuteArgs,
): Promise<ExecutionResult> {
  return invoke<ExecutionResult>("execute", args);
}

export function compareTargets(
  args: CompareArgs,
): Promise<string> {
  return invoke<string>("compare_targets", args);
}

export function checkSource(
  source: string,
  sourcePath: string | null,
): Promise<Diagnostic[]> {
  return invoke<Diagnostic[]>("check_source", {
    source,
    sourcePath,
  });
}

export function loadModules(
  source: string,
  sourcePath: string | null,
): Promise<ModuleFile[]> {
  return invoke<ModuleFile[]>("load_modules", {
    source,
    sourcePath,
  });
}

export function saveSnapshot(
  snapshot: SnapshotInput,
): Promise<SnapshotMeta> {
  return invoke<SnapshotMeta>("save_snapshot", {
    snapshot,
  });
}

export function listSnapshots(): Promise<SnapshotMeta[]> {
  return invoke<SnapshotMeta[]>("list_snapshots");
}

export function readSnapshot(
  id: string,
): Promise<Snapshot> {
  return invoke<Snapshot>("read_snapshot", { id });
}

export function deleteSnapshot(
  id: string,
): Promise<void> {
  return invoke<void>("delete_snapshot", { id });
}

export function diffText(
  args: DiffArgs,
): Promise<string> {
  return invoke<string>("diff_text", args);
}

export function renameSource(
  path: string,
  newName: string,
): Promise<string> {
  return invoke<string>("rename_source", {
    path,
    newName,
  });
}
