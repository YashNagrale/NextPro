import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const BOOLEAN_FLAGS = new Set(["pre-launch", "json", "help"]);

export const parseArgs = (argv, booleanFlags = BOOLEAN_FLAGS) => {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (booleanFlags.has(key)) {
      flags[key] = true;
      continue;
    }
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
};

export const resolveCwd = (flags) =>
  path.resolve(String(flags.cwd ?? process.cwd()));

export const isFlagEnabled = (flags, key) =>
  flags[key] === true || flags[key] === "true";

export const hasPath = async (file) => {
  try {
    await stat(file);
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
};

export const readText = (file) => readFile(file, "utf8");

export const readJson = async (file) => JSON.parse(await readText(file));

export const writeTextAtomic = async (file, content) => {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, file);
};

export const writeJsonAtomic = async (file, value) =>
  writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`);

const skipLineComment = (content, start) => {
  let i = start + 2;
  while (i < content.length && content[i] !== "\n") {
    i += 1;
  }
  return i;
};

const skipBlockComment = (content, start) => {
  let i = start + 2;
  while (
    i < content.length - 1 &&
    !(content[i] === "*" && content[i + 1] === "/")
  ) {
    i += 1;
  }
  return Math.min(i + 2, content.length);
};

const skipQuotedString = (content, start, quote) => {
  let i = start + 1;
  while (i < content.length && content[i] !== quote) {
    i += content[i] === "\\" ? 2 : 1;
  }
  return Math.min(i + 1, content.length);
};

const skipTemplateExpression = (content, start) => {
  let depth = 1;
  let i = start + 2;
  while (i < content.length && depth > 0) {
    const after = skipStringOrComment(content, i);
    if (after > i) {
      i = after;
      continue;
    }
    if (content[i] === "{") {
      depth += 1;
    } else if (content[i] === "}") {
      depth -= 1;
    }
    i += 1;
  }
  return i;
};

const skipTemplateString = (content, start) => {
  let i = start + 1;
  while (i < content.length && content[i] !== "`") {
    if (content[i] === "\\") {
      i += 2;
      continue;
    }
    if (content[i] === "$" && content[i + 1] === "{") {
      i = skipTemplateExpression(content, i);
      continue;
    }
    i += 1;
  }
  return Math.min(i + 1, content.length);
};

export const skipStringOrComment = (content, i) => {
  const ch = content[i];
  const next = content[i + 1];
  switch (ch) {
    case "/":
      if (next === "/") return skipLineComment(content, i);
      if (next === "*") return skipBlockComment(content, i);
      return i;
    case '"':
    case "'":
      return skipQuotedString(content, i, ch);
    case "`":
      return skipTemplateString(content, i);
    default:
      return i;
  }
};

export const findMatchingBrace = (content, openIdx) => {
  if (content[openIdx] !== "{") return -1;
  let depth = 0;
  let i = openIdx;
  while (i < content.length) {
    const after = skipStringOrComment(content, i);
    if (after > i) {
      i = after;
      continue;
    }
    switch (content[i]) {
      case "{":
        depth += 1;
        break;
      case "}":
        depth -= 1;
        if (depth === 0) return i;
        break;
      default:
        break;
    }
    i += 1;
  }
  return -1;
};

export const writeOutput = (flags, value) => {
  if (isFlagEnabled(flags, "json")) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (typeof value === "string") {
    process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};
