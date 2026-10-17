import type { TintHost } from "./host";

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: PickerType[];
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: PickerType[];
}

interface PickerType {
  description?: string;
  accept: Record<string, string[]>;
}

interface WritableStreamLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableStreamLike>;
}

interface PickerWindow {
  showOpenFilePicker?: (
    options?: OpenFilePickerOptions,
  ) => Promise<FileHandleLike[]>;

  showSaveFilePicker?: (
    options?: SaveFilePickerOptions,
  ) => Promise<FileHandleLike>;
}

const CERUNE_TYPES: PickerType[] = [
  {
    description: "Cerune",
    accept: { "text/plain": [".ceru"] },
  },
];

function isAbort(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

function pickWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input =
      document.createElement("input");

    input.type = "file";
    input.accept = ".ceru";
    input.style.display = "none";

    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;

      input.remove();

      resolve(file);
    });

    document.body.appendChild(input);

    input.click();
  });
}

function download(name: string, text: string) {
  const blob = new Blob([text], {
    type: "text/plain",
  });

  const url = URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = name;
  anchor.click();

  URL.revokeObjectURL(url);
}

/**
 * ブラウザ用のホスト実装です。
 *
 * File System Access API が使える場合は読み書きをそのまま行い、使えない
 * ブラウザではファイル選択とダウンロードにフォールバックします。パスは
 * 実ファイルシステムのパスではなく、ファイル名をキーにした論理パスです。
 */
export function createWebHost(): TintHost {
  const handles = new Map<string, FileHandleLike>();
  const contents = new Map<string, string>();

  async function readText(path: string): Promise<string> {
    const handle = handles.get(path);

    if (handle) {
      const file = await handle.getFile();

      const text = await file.text();

      contents.set(path, text);

      return text;
    }

    const cached = contents.get(path);

    if (cached !== undefined) {
      return cached;
    }

    throw new Error(`unknown file: ${path}`);
  }

  return {
    async openSource() {
      const picker = window as unknown as PickerWindow;

      if (picker.showOpenFilePicker) {
        try {
          const [handle] =
            await picker.showOpenFilePicker({
              multiple: false,
              types: CERUNE_TYPES,
            });

          if (!handle) {
            return null;
          }

          handles.set(handle.name, handle);

          return handle.name;
        } catch (error) {
          if (isAbort(error)) {
            return null;
          }

          throw error;
        }
      }

      const file = await pickWithInput();

      if (!file) {
        return null;
      }

      contents.set(file.name, await file.text());

      return file.name;
    },

    async saveSource(defaultPath) {
      const picker = window as unknown as PickerWindow;

      if (picker.showSaveFilePicker) {
        try {
          const handle =
            await picker.showSaveFilePicker({
              suggestedName:
                defaultPath ?? "Untitled.ceru",

              types: CERUNE_TYPES,
            });

          handles.set(handle.name, handle);

          return handle.name;
        } catch (error) {
          if (isAbort(error)) {
            return null;
          }

          throw error;
        }
      }

      return defaultPath ?? "Untitled.ceru";
    },

    readText,

    async writeText(path, text) {
      const handle = handles.get(path);

      if (handle) {
        const writable =
          await handle.createWritable();

        await writable.write(text);
        await writable.close();

        contents.set(path, text);

        return;
      }

      contents.set(path, text);

      download(path, text);
    },

    async setTitle(title) {
      document.title = title;
    },
  };
}
