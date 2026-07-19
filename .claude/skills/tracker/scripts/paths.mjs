import { stat } from "node:fs/promises";
import path from "node:path";
import { readText } from "./utils.mjs";

const LEADING_SLASH_RE = /^\/+/;
const TRAILING_SLASH_RE = /\/+$/;
const DIGITS_RE = /^\d+$/;

export const toPosix = (p) => p.split(path.sep).join("/");

export const isInsideRoot = (filePath, rootPath) => {
  const file = toPosix(filePath);
  const root = toPosix(rootPath);
  if (root === ".") return true;
  return file === root || file.startsWith(`${root}/`);
};

export const joinRootRelative = (rootPath, relPath) => {
  const trimmed = relPath.replace(LEADING_SLASH_RE, "");
  const joined = rootPath === "." ? trimmed : `${toPosix(rootPath)}/${trimmed}`;
  const normalized = path.posix.normalize(joined);
  if (normalized === ".." || normalized.startsWith("../")) return null;
  if (rootPath !== "." && !isInsideRoot(normalized, rootPath)) return null;
  return normalized;
};

export const parseSite = (site) => {
  const trimmed = site.trim();
  const colonIdx = trimmed.lastIndexOf(":");
  if (colonIdx === -1) {
    return { path: trimmed, line: null };
  }
  const after = trimmed.slice(colonIdx + 1);
  if (!DIGITS_RE.test(after)) {
    return { path: trimmed, line: null };
  }
  return {
    path: trimmed.slice(0, colonIdx),
    line: Number.parseInt(after, 10),
  };
};

export const normalizeSiteForRoot = (rootPath, rawSite) => {
  const parsed = parseSite(rawSite);
  if (!parsed.path) return null;
  const cleanPath = parsed.path.replace(TRAILING_SLASH_RE, "");
  const normalized = path.posix.normalize(
    cleanPath.replace(LEADING_SLASH_RE, "")
  );
  const joined =
    rootPath !== "." && isInsideRoot(normalized, rootPath)
      ? normalized
      : joinRootRelative(rootPath, cleanPath);
  if (joined === null) return null;
  return { line: parsed.line, path: joined };
};

export const renderSiteReference = ({ line, path: sitePath }) =>
  line === null ? sitePath : `${sitePath}:${line}`;

export const isInsideCwd = (fullPath, cwd) => {
  const cwdWithSep = cwd.endsWith(path.sep) ? cwd : cwd + path.sep;
  return fullPath === cwd || fullPath.startsWith(cwdWithSep);
};

export const resolveCwdPath = (cwd, relPath) => {
  const fullPath = path.resolve(cwd, relPath);
  if (!isInsideCwd(fullPath, cwd)) {
    return { ok: false, reason: "outside_cwd", fullPath };
  }
  return { ok: true, fullPath };
};

export const resolveRootPath = (cwd, rootPath, relPath) => {
  const joined = joinRootRelative(rootPath, relPath);
  if (joined === null) return { ok: false, reason: "outside_root" };
  const resolved = resolveCwdPath(cwd, joined);
  if (!resolved.ok) return { ...resolved, joined };
  return { ...resolved, joined };
};

export const resolveSitePath = (rawSite, cwd, rootPath) => {
  const parsed = parseSite(rawSite);
  if (!parsed.path) {
    return {
      ok: false,
      code: "discovery_site_invalid",
      message: `site "${rawSite}" is not a valid path or path:line reference.`,
    };
  }
  const cleanPath = parsed.path.replace(TRAILING_SLASH_RE, "");
  const resolved = resolveRootPath(cwd, rootPath, cleanPath);
  if (!resolved.ok && resolved.reason === "outside_root") {
    return {
      ok: false,
      code: "discovery_site_outside_root",
      message: `site "${rawSite}" escapes root "${rootPath}".`,
    };
  }
  if (!resolved.ok) {
    return {
      ok: false,
      code: "discovery_site_outside_root",
      message: `site "${rawSite}" resolves outside --cwd. Refused for safety.`,
    };
  }
  return { ...resolved, parsed };
};

export const validateSite = async (rawSite, cwd, rootPath, allowDirectory) => {
  const resolved = resolveSitePath(rawSite, cwd, rootPath);
  if (!resolved.ok) return resolved;
  let stats;
  try {
    stats = await stat(resolved.fullPath);
  } catch {
    return {
      ok: false,
      code: "discovery_site_unresolved",
      message: `site "${rawSite}" does not exist on disk.`,
    };
  }
  if (stats.isDirectory()) {
    if (!allowDirectory) {
      return {
        ok: false,
        code: "discovery_site_invalid",
        message: `findings[].site "${rawSite}" must point at a file, not a directory. Use a specific call site.`,
      };
    }
    if (resolved.parsed.line !== null) {
      return {
        ok: false,
        code: "discovery_site_invalid",
        message: `site "${rawSite}" specifies a line but the path is a directory.`,
      };
    }
    return { ...resolved, stats };
  }
  if (resolved.parsed.line === null) {
    return { ...resolved, stats };
  }
  const content = await readText(resolved.fullPath);
  const lineCount = content.split("\n").length;
  if (resolved.parsed.line < 1 || resolved.parsed.line > lineCount) {
    return {
      ok: false,
      code: "discovery_site_line_out_of_range",
      message: `site "${rawSite}" line ${resolved.parsed.line} is outside the file (1-${lineCount}).`,
    };
  }
  return { ...resolved, stats };
};
