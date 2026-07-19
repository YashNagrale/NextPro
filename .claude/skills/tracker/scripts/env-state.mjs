import { readFile } from "node:fs/promises";
import path from "node:path";
import { hasPath, writeTextAtomic } from "./utils.mjs";

export const TRACKER_ID_ENV_KEY = "HELLYEAH_TRACKER_ID";
export const PUBLIC_TRACKER_ID_ENV_KEY = "NEXT_PUBLIC_HELLYEAH_TRACKER_ID";
export const TRACKER_ENV_ENV_KEY = "HELLYEAH_TRACKER_ENV";
export const PUBLIC_TRACKER_ENV_ENV_KEY = "NEXT_PUBLIC_HELLYEAH_TRACKER_ENV";
export const DEFAULT_LOCAL_TRACKER_ENV = "local";

const ENV_FILES = [".env.example", ".env.local"];
const ENV_KEY_RE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

const trackerEnvEntries = (trackerId) => [
  [TRACKER_ID_ENV_KEY, trackerId, "upsert"],
  [PUBLIC_TRACKER_ID_ENV_KEY, trackerId, "upsert"],
  [TRACKER_ENV_ENV_KEY, DEFAULT_LOCAL_TRACKER_ENV, "insert"],
  [PUBLIC_TRACKER_ENV_ENV_KEY, DEFAULT_LOCAL_TRACKER_ENV, "insert"],
];

export const upsertEnvContent = (content, entries) => {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  if (lines.length === 1 && lines[0] === "") lines.length = 0;

  const byKey = new Map(
    entries.map(([key, value, mode]) => [key, { value, mode }])
  );
  const seen = new Set();
  const overwrites = [];
  const nextLines = lines.map((line) => {
    const key = line.match(ENV_KEY_RE)?.[1];
    if (!(key && byKey.has(key))) return line;
    seen.add(key);
    const { value, mode } = byKey.get(key);
    if (mode === "insert") return line;
    const currentValue = line.slice(line.indexOf("=") + 1);
    if (value !== "" && currentValue !== value) {
      overwrites.push({ key, oldValue: currentValue, newValue: value });
    }
    return value === "" ? line : `${key}=${value}`;
  });

  for (const [key, value] of entries) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  return { content: `${nextLines.join("\n")}\n`, overwrites };
};

const readEnvFile = async (file) => {
  if (!(await hasPath(file))) return "";
  return await readFile(file, "utf8");
};

export const detectTrackerIdConflicts = async (cwd, trackerId) => {
  const entries = trackerEnvEntries(trackerId);
  const conflicts = [];
  for (const relativePath of ENV_FILES) {
    const content = await readEnvFile(path.join(cwd, relativePath));
    const { overwrites } = upsertEnvContent(content, entries);
    for (const overwrite of overwrites) {
      if (
        overwrite.key === TRACKER_ID_ENV_KEY ||
        overwrite.key === PUBLIC_TRACKER_ID_ENV_KEY
      ) {
        conflicts.push({ file: relativePath, ...overwrite });
      }
    }
  }
  return conflicts;
};

export const writeTrackerEnvFiles = async (cwd, trackerId) => {
  const entries = trackerEnvEntries(trackerId);
  const written = [];
  const overwrites = [];

  for (const relativePath of ENV_FILES) {
    const file = path.join(cwd, relativePath);
    const content = await readEnvFile(file);
    const result = upsertEnvContent(content, entries);
    const nextContent = result.content;
    if (nextContent !== content) {
      await writeTextAtomic(file, nextContent);
      written.push(relativePath);
      overwrites.push(
        ...result.overwrites.map((entry) => ({
          file: relativePath,
          ...entry,
        }))
      );
    }
  }

  return { overwrites, written };
};
