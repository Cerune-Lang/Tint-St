import {
  open,
  save,
} from "@tauri-apps/plugin-dialog";

import {
  getCurrentWindow,
} from "@tauri-apps/api/window";

import {
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

import {
  checkSource,
  compareTargets,
  deleteSnapshot,
  diffText,
  emitAll,
  executeCode,
  listSnapshots,
  loadModules,
  readSnapshot,
  renameSource,
  saveSnapshot,
} from "./cerune";

import type {
  BackendCapabilities,
  TintBackend,
} from "./backend";

import type { TintHost } from "./host";

/**
 * Tauri 版はインストール済み Cerune CLI とネイティブツールを利用できます。
 */
export const tauriCapabilities: BackendCapabilities = {
  check: true,
  observe: true,
  execute: true,
  compare: true,
  modules: true,
  snapshots: true,
  rename: true,
};

export function createTauriBackend(): TintBackend {
  return {
    capabilities: async () => tauriCapabilities,

    check: checkSource,

    observe: emitAll,

    execute: executeCode,

    compare: compareTargets,

    loadModules,

    saveSnapshot,

    listSnapshots,

    readSnapshot,

    deleteSnapshot,

    diff: diffText,

    renameSource,
  };
}

export function createTauriHost(): TintHost {
  return {
    async openSource() {
      const path = await open({
        multiple: false,

        filters: [
          {
            name: "Cerune",
            extensions: ["ceru"],
          },
        ],
      });

      if (!path || Array.isArray(path)) {
        return null;
      }

      return path;
    },

    async saveSource(defaultPath) {
      const path = await save({
        defaultPath:
          defaultPath ?? undefined,

        filters: [
          {
            name: "Cerune",
            extensions: ["ceru"],
          },
        ],
      });

      if (!path || Array.isArray(path)) {
        return null;
      }

      return path;
    },

    readText: readTextFile,

    writeText: writeTextFile,

    async setTitle(title) {
      await getCurrentWindow().setTitle(title);
    },
  };
}
