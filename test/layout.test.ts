import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

const css = readFileSync(
  join(root, "src", "styles.css"),
  "utf8",
);

const html = readFileSync(
  join(root, "index.html"),
  "utf8",
);

/** セレクタに一致する最初の宣言ブロックの中身を返します。 */
function ruleBody(selector: string): string {
  const escaped = selector.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  const match = new RegExp(
    `${escaped}\\s*\\{([^}]*)\\}`,
  ).exec(css);

  assert.ok(match, `rule not found: ${selector}`);

  return match[1];
}

/** 括弧のネストを考慮して `grid-template-rows` をトラック単位で分割します。 */
function splitTracks(value: string): string[] {
  const tracks: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of value.trim()) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }

    if (/\s/.test(char) && depth === 0) {
      if (current.length > 0) {
        tracks.push(current);
        current = "";
      }

      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tracks.push(current);
  }

  return tracks;
}

test("the source panel reserves a row per child", () => {
  const body = ruleBody(".source-panel");

  const match = /grid-template-rows\s*:\s*([^;]+);/.exec(
    body,
  );

  assert.ok(match, "grid-template-rows is required");

  // ヘッダー / ファイルタブ / エディタの 3 行。
  // `1fr` がファイルタブ行に渡っていたためエディタが下へ押し出されていた。
  const tracks = splitTracks(match[1]);

  assert.equal(
    tracks.length,
    3,
    `.source-panel should define 3 grid rows, got: ${match[1]}`,
  );
});

test("the source panel has the three expected children", () => {
  const section =
    /<section class="panel source-panel">([\s\S]*?)<\/section>/.exec(
      html,
    );

  assert.ok(section, "source panel section not found");

  for (const child of [
    'class="panel-header"',
    'class="file-tabs"',
    'id="source-editor"',
  ]) {
    assert.ok(
      section[1].includes(child),
      `source panel is missing ${child}`,
    );
  }
});

test("unsupported controls have an unavailable style", () => {
  assert.match(
    css,
    /\.tab\.unavailable/,
    ".tab.unavailable style is required",
  );

  assert.match(
    css,
    /cursor\s*:\s*not-allowed;/,
    "unavailable controls should use a not-allowed cursor",
  );
});
