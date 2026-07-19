import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  EXCLUDED_ROOT_PREFIXES,
  IGNORED_DIRS,
  SOURCE_EXTENSIONS,
  SOURCE_FILE_CAP,
} from "./constants.mjs";
import { toPosix } from "./paths.mjs";
import { readJson } from "./utils.mjs";

const isExcludedRootPath = (relPath) => {
  const posix = toPosix(relPath);
  return EXCLUDED_ROOT_PREFIXES.some((prefix) => posix.startsWith(prefix));
};

const findPackageJsons = async (cwd) => {
  const found = [];
  const visit = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(cwd, full);
      if (isExcludedRootPath(rel)) continue;
      switch (true) {
        case entry.isDirectory():
          await visit(full);
          break;
        case entry.isFile() && entry.name === "package.json":
          found.push(full);
          break;
        default:
          break;
      }
    }
  };
  await visit(cwd);
  return found;
};

const enumerateSourceFiles = async (rootDir, otherRootSet, cwd) => {
  const files = [];
  let truncated = false;
  const visit = async (dir) => {
    if (truncated) return;
    if (dir !== rootDir && otherRootSet.has(path.resolve(dir))) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (isExcludedRootPath(path.relative(cwd, full))) continue;
      if (entry.isDirectory()) {
        await visit(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (files.length >= SOURCE_FILE_CAP) {
        truncated = true;
        return;
      }
      files.push(path.relative(rootDir, full).split(path.sep).join("/"));
    }
  };
  await visit(rootDir);
  files.sort();
  return { files, truncated };
};

export const enumerateRoots = async (cwd) => {
  const pkgPaths = await findPackageJsons(cwd);
  const rootDirs = pkgPaths.map((p) => path.dirname(p));
  const resolvedRootSet = new Set(rootDirs.map((r) => path.resolve(r)));
  const roots = [];
  for (const pkgPath of pkgPaths) {
    let pkg;
    try {
      pkg = await readJson(pkgPath);
    } catch {
      continue;
    }
    const dir = path.dirname(pkgPath);
    const relativePath = path.relative(cwd, dir) || ".";
    const otherRootSet = new Set(resolvedRootSet);
    otherRootSet.delete(path.resolve(dir));
    const { files, truncated } = await enumerateSourceFiles(
      dir,
      otherRootSet,
      cwd
    );
    roots.push({
      path: relativePath,
      packageName: pkg.name ?? null,
      dependencies: pkg.dependencies ?? {},
      devDependencies: pkg.devDependencies ?? {},
      sourceFiles: files,
      sourceFilesTruncated: truncated,
    });
  }
  roots.sort((a, b) => a.path.localeCompare(b.path));
  return roots;
};
