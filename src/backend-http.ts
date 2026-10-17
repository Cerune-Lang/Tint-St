import type {
  BackendCapabilities,
  TintBackend,
} from "./backend";

import type {
  Diagnostic,
  ExecutionResult,
  ModuleFile,
  ObservationResult,
  Snapshot,
  SnapshotMeta,
} from "./types";

export interface HttpBackendOptions {
  baseUrl: string;
  token: string;
}

interface DiffResponse {
  diff: string;
}

interface RenameResponse {
  path: string;
}

/**
 * ローカル HTTP サーバー（`tint-server`）に接続するバックエンドです。
 * ブラウザの Playground から利用します。
 */
export function createHttpBackend(
  options: HttpBackendOptions,
): TintBackend {
  const root = options.baseUrl.replace(/\/+$/, "");

  async function call<T>(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(
      `${root}${path}`,
      {
        method,

        headers: {
          Authorization: `Bearer ${options.token}`,

          ...(body === undefined
            ? {}
            : {
                "Content-Type":
                  "application/json",
              }),
        },

        body:
          body === undefined
            ? undefined
            : JSON.stringify(body),
      },
    );

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        errorMessage(text, response.status),
      );
    }

    return text
      ? (JSON.parse(text) as T)
      : (undefined as T);
  }

  return {
    capabilities: () =>
      call<BackendCapabilities>(
        "/capabilities",
        "GET",
      ),

    check: (source, sourcePath) =>
      call<Diagnostic[]>("/check", "POST", {
        source,
        sourcePath,
      }),

    observe: (args) =>
      call<ObservationResult>(
        "/observe",
        "POST",
        args,
      ),

    execute: (args) =>
      call<ExecutionResult>(
        "/execute",
        "POST",
        args,
      ),

    compare: (args) =>
      call<DiffResponse>(
        "/compare",
        "POST",
        args,
      ).then((result) => result.diff),

    loadModules: (source, sourcePath) =>
      call<ModuleFile[]>("/modules", "POST", {
        source,
        sourcePath,
      }),

    saveSnapshot: (input) =>
      call<SnapshotMeta>(
        "/snapshots",
        "POST",
        input,
      ),

    listSnapshots: () =>
      call<SnapshotMeta[]>(
        "/snapshots",
        "GET",
      ),

    readSnapshot: (id) =>
      call<Snapshot>(
        `/snapshots/${encodeURIComponent(id)}`,
        "GET",
      ),

    deleteSnapshot: (id) =>
      call<void>(
        `/snapshots/${encodeURIComponent(id)}`,
        "DELETE",
      ),

    diff: (args) =>
      call<DiffResponse>("/diff", "POST", args).then(
        (result) => result.diff,
      ),

    renameSource: (path, newName) =>
      call<RenameResponse>("/rename", "POST", {
        path,
        newName,
      }).then((result) => result.path),
  };
}

function errorMessage(
  text: string,
  status: number,
): string {
  if (text) {
    try {
      const parsed = JSON.parse(text) as {
        error?: string;
      };

      if (parsed.error) {
        return parsed.error;
      }
    } catch {
      return text;
    }
  }

  return `request failed with status ${status}`;
}
