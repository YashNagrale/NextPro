import path from "node:path";
import { isInsideRoot, resolveCwdPath, toPosix } from "./paths.mjs";
import {
  conversionTrackCalls,
  moduleSpecifiers,
  referencesServerSdk,
} from "./sources.mjs";
import { hasPath, readText } from "./utils.mjs";

export const isCatalogConversion = (event) => event.startsWith("cv.");

export const findOwningRoot = (filePath, roots) => {
  let best = null;
  for (const root of roots) {
    if (!isInsideRoot(filePath, root.path)) continue;
    if (best === null || root.path.length > best.path.length) best = root;
  }
  return best;
};

export const indexReportsByRoot = (state) => {
  const reportsByRoot = new Map();
  for (const report of state.discoveryReports) {
    reportsByRoot.set(report.root, report);
  }
  return reportsByRoot;
};

export const summarizeDiscovery = (state) => ({
  approvedFiles: state.approvedFiles.length,
  discoveryReports: state.discoveryReports.length,
  findings: state.discoveryReports.reduce(
    (sum, r) => sum + r.findings.length,
    0
  ),
  skipped: state.discoveryReports.reduce((sum, r) => sum + r.skipped.length, 0),
  blocked: state.discoveryReports.reduce(
    (sum, r) => sum + (r.blocked?.length ?? 0),
    0
  ),
});

export const indexConversionFilesByRoot = (state, roots) => {
  const filesByRoot = new Map();
  for (const entry of state.approvedFiles) {
    if (entry.kind !== "conversion_event") continue;
    const owning = findOwningRoot(entry.path, roots);
    if (!owning) continue;
    if (!filesByRoot.has(owning.path)) {
      filesByRoot.set(owning.path, []);
    }
    filesByRoot.get(owning.path).push(entry);
  }
  return { filesByRoot };
};

const MODULE_EXTENSION_RE = /\.[cm]?[jt]sx?$/;
const LOCAL_ALIAS_PREFIX_RE = /^(?:@|~|#)\//;
const SOURCE_MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const stripModuleExtension = (p) => p.replace(MODULE_EXTENSION_RE, "");

const rootOwns = (root, filePath) => findOwningRoot(filePath, [root]) !== null;

const moduleCandidates = (basePath) => {
  const normalized = path.posix.normalize(
    stripModuleExtension(toPosix(basePath))
  );
  return [
    ...SOURCE_MODULE_EXTENSIONS.map((ext) => `${normalized}${ext}`),
    ...SOURCE_MODULE_EXTENSIONS.map((ext) => `${normalized}/index${ext}`),
  ];
};

const moduleCandidatePaths = (spec, importerPath, root) => {
  const importerDir = path.posix.dirname(toPosix(importerPath));
  const rootPrefix = root.path === "." ? "" : `${toPosix(root.path)}/`;
  let bases = [];
  if (spec.startsWith(".")) {
    bases = [path.posix.join(importerDir, spec)];
  } else if (spec.startsWith("src/")) {
    bases = [`${rootPrefix}${spec}`];
  } else if (LOCAL_ALIAS_PREFIX_RE.test(spec)) {
    const tail = spec.replace(LOCAL_ALIAS_PREFIX_RE, "");
    bases = [`${rootPrefix}${tail}`, `${rootPrefix}src/${tail}`];
  }
  return bases
    .flatMap(moduleCandidates)
    .filter((candidate) => rootOwns(root, candidate));
};

const findExistingCandidate = async (cwd, candidates) => {
  for (const candidate of candidates) {
    const resolved = resolveCwdPath(cwd, candidate);
    if (resolved.ok && (await hasPath(resolved.fullPath))) return candidate;
  }
  return null;
};

const isServerConversionFile = async ({
  content,
  cwd,
  entryPath,
  root,
  singletonPaths,
}) => {
  if (referencesServerSdk(content)) return true;
  const specs = moduleSpecifiers(content);
  for (const spec of specs) {
    const candidates = moduleCandidatePaths(spec, entryPath, root);
    if (candidates.some((candidate) => singletonPaths.has(candidate))) {
      return true;
    }
    const wrapperPath = await findExistingCandidate(cwd, candidates);
    if (wrapperPath === null) continue;
    const wrapper = resolveCwdPath(cwd, wrapperPath);
    if (!(wrapper.ok && (await hasPath(wrapper.fullPath)))) continue;
    const wrapperSpecs = moduleSpecifiers(await readText(wrapper.fullPath));
    if (
      wrapperSpecs.some((wrapperSpec) => {
        const wrapperCandidates = moduleCandidatePaths(
          wrapperSpec,
          wrapperPath,
          root
        );
        return wrapperCandidates.some((candidate) =>
          singletonPaths.has(candidate)
        );
      })
    ) {
      return true;
    }
  }
  return false;
};

export const indexCatalogConversionCallsByRoot = async (state, roots, cwd) => {
  const byRoot = new Map();
  const singletonPathsByRoot = new Map();
  for (const entry of state.approvedFiles) {
    if (entry.kind !== "server_singleton") continue;
    const owning = findOwningRoot(entry.path, roots);
    if (!owning) continue;
    if (!singletonPathsByRoot.has(owning.path)) {
      singletonPathsByRoot.set(owning.path, new Set());
    }
    singletonPathsByRoot.get(owning.path).add(entry.path);
  }
  for (const entry of state.approvedFiles) {
    if (entry.kind !== "conversion_event") continue;
    const owning = findOwningRoot(entry.path, roots);
    if (!owning) continue;
    const singletonPaths = singletonPathsByRoot.get(owning.path) ?? new Set();
    const resolved = resolveCwdPath(cwd, entry.path);
    if (!(resolved.ok && (await hasPath(resolved.fullPath)))) continue;
    const content = await readText(resolved.fullPath);
    if (
      !(await isServerConversionFile({
        content,
        cwd,
        entryPath: entry.path,
        root: owning,
        singletonPaths,
      }))
    ) {
      continue;
    }
    const conversions = conversionTrackCalls(content)
      .filter((call) => isCatalogConversion(call.eventValue))
      .map((call) => ({
        ...call,
        expectedEvent: call.eventValue,
        path: entry.path,
      }));
    if (conversions.length === 0) continue;
    if (!byRoot.has(owning.path)) {
      byRoot.set(owning.path, []);
    }
    byRoot.get(owning.path).push(...conversions);
  }
  return byRoot;
};
