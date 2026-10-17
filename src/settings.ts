import type { Target } from "./types";

export const settingsKey = "tint.settings";

export interface Settings {
  target: Target;
  origins: boolean;
  nativeSsa: boolean;
  wrap: boolean;
  stringHeapLimit: string;
  arrayHeapLimit: string;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage():
  | SettingsStorage
  | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function parseSettings(
  raw: string | null,
): Partial<Settings> {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed === "object" &&
      parsed !== null
    ) {
      return parsed as Partial<Settings>;
    }

    return {};
  } catch {
    return {};
  }
}

export function readSettings(
  storage: SettingsStorage | undefined =
    defaultStorage(),
): Partial<Settings> {
  if (!storage) {
    return {};
  }

  try {
    return parseSettings(
      storage.getItem(settingsKey),
    );
  } catch {
    return {};
  }
}

export function writeSettings(
  settings: Settings,
  storage: SettingsStorage | undefined =
    defaultStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      settingsKey,
      JSON.stringify(settings),
    );
  } catch {
    // 設定の保存に失敗しても観測は継続します。
  }
}
