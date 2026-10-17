import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSettings,
  readSettings,
  settingsKey,
  writeSettings,
  type Settings,
  type SettingsStorage,
} from "../src/settings";

function memoryStorage(
  initial: Record<string, string> = {},
): SettingsStorage & { data: Record<string, string> } {
  const data = { ...initial };

  return {
    data,
    getItem(key) {
      return key in data ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
  };
}

const settings: Settings = {
  target: "x86_64-unknown-linux-gnu",
  origins: true,
  nativeSsa: false,
  wrap: true,
  stringHeapLimit: "1024",
  arrayHeapLimit: "2048",
};

test("parses missing and invalid settings as empty", () => {
  assert.deepEqual(parseSettings(null), {});
  assert.deepEqual(parseSettings(""), {});
  assert.deepEqual(parseSettings("not json"), {});
  assert.deepEqual(parseSettings("42"), {});
  assert.deepEqual(parseSettings('"text"'), {});
});

test("parses a settings object", () => {
  assert.deepEqual(parseSettings('{"wrap":true}'), {
    wrap: true,
  });
});

test("reads partial settings from storage", () => {
  const storage = memoryStorage({
    [settingsKey]: '{"wrap":true}',
  });

  assert.deepEqual(readSettings(storage), {
    wrap: true,
  });
});

test("returns empty when storage is missing the key", () => {
  assert.deepEqual(
    readSettings(memoryStorage()),
    {},
  );
});

test("returns empty when storage access throws", () => {
  const storage: SettingsStorage = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };

  assert.deepEqual(readSettings(storage), {});
});

test("round trips settings through storage", () => {
  const storage = memoryStorage();

  writeSettings(settings, storage);

  assert.deepEqual(
    readSettings(storage),
    settings,
  );
});

test("writing never throws when storage fails", () => {
  const storage: SettingsStorage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("denied");
    },
  };

  assert.doesNotThrow(() =>
    writeSettings(settings, storage),
  );
});

test("reading without a storage returns empty", () => {
  assert.deepEqual(readSettings(undefined), {});
});
