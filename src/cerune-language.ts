import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";

import {
  type CompletionContext,
  type CompletionSource,
} from "@codemirror/autocomplete";

import { tags } from "@lezer/highlight";

const keywordList = [
  "import",
  "as",
  "pub",
  "const",
  "enum",
  "match",
  "type",
  "fn",
  "return",
  "void",
  "print",
  "mut",
  "if",
  "else",
  "while",
  "for",
  "in",
  "break",
  "continue",
  "true",
  "false",
];

const typeList = [
  "i8",
  "u8",
  "i16",
  "u16",
  "i32",
  "u32",
  "i64",
  "u64",
  "f32",
  "f64",
  "bool",
  "string",
  "infer",
];

const keywords = new RegExp(
  `^(?:${keywordList.join("|")})\\b`,
);

const builtinTypes = new RegExp(
  `^(?:${typeList.join("|")})\\b`,
);

const keywordSet = new Set(keywordList);

const typeSet = new Set(typeList);

const keywordOptions = keywordList.map((label) => ({
  label,
  type: "keyword",
}));

const typeOptions = typeList.map((label) => ({
  label,
  type: "type",
}));

const ceruneCompletionSource: CompletionSource = (
  context: CompletionContext,
) => {
  const word = context.matchBefore(
    /[A-Za-z_][A-Za-z0-9_]*/,
  );

  if (!word) {
    return null;
  }

  if (
    word.from === word.to &&
    !context.explicit
  ) {
    return null;
  }

  const text = context.state.doc.toString();

  const identifiers = new Set<string>();

  for (const match of text.matchAll(
    /[A-Za-z_][A-Za-z0-9_]*/g,
  )) {
    const value = match[0];

    if (
      !keywordSet.has(value) &&
      !typeSet.has(value)
    ) {
      identifiers.add(value);
    }
  }

  const variableOptions = Array.from(
    identifiers,
  )
    .sort()
    .map((label) => ({
      label,
      type: "variable",
    }));

  return {
    from: word.from,

    options: [
      ...keywordOptions,
      ...typeOptions,
      ...variableOptions,
    ],
  };
};

export const ceruneLanguage =
  StreamLanguage.define<null>({
    startState() {
      return null;
    },

    token(stream) {
      if (stream.eatSpace()) {
        return null;
      }

      if (stream.match("//")) {
        stream.skipToEnd();
        return "comment";
      }

      if (stream.peek() === '"') {
        stream.next();

        while (!stream.eol()) {
          const character = stream.next();

          if (character === "\\") {
            stream.next();
            continue;
          }

          if (character === '"') {
            break;
          }
        }

        return "string";
      }

      if (stream.match(keywords)) {
        return "keyword";
      }

      if (stream.match(builtinTypes)) {
        return "typeName";
      }

      if (
        stream.match(
          /^(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?(?:f32|f64|i8|u8|i16|u16|i32|u32|i64|u64)?\b/,
        )
      ) {
        return "number";
      }

      if (
        stream.match(
          /^[A-Za-z_][A-Za-z0-9_]*/,
        )
      ) {
        return "variableName";
      }

      if (
        stream.match(
          /^(?:=>|::|==|!=|&&|\|\||<=|>=|\.\.|->|<<|>>|[=!:,.+\-*/%&|^~<>(){}\[\];])/,
        )
      ) {
        return "operator";
      }

      stream.next();
      return null;
    },

    languageData: {
      commentTokens: {
        line: "//",
      },

      autocomplete: ceruneCompletionSource,
    },
  });

const ceruneHighlightStyle =
  HighlightStyle.define([
    {
      tag: tags.keyword,
      color: "#317fa8",
      fontWeight: "600",
    },
    {
      tag: tags.typeName,
      color: "#599bc0",
      fontWeight: "600",
    },
    {
      tag: tags.number,
      color: "#8b72b1",
    },
    {
      tag: tags.string,
      color: "#768c4c",
    },
    {
      tag: tags.comment,
      color: "#9badb8",
      fontStyle: "italic",
    },
    {
      tag: tags.variableName,
      color: "#263746",
    },
    {
      tag: tags.operator,
      color: "#6d8492",
    },
  ]);

export const ceruneHighlighting =
  syntaxHighlighting(
    ceruneHighlightStyle,
  );