export const SDK_PACKAGE = "@hellyeah/x-ray";
export const TRACKER_STATE_DIR = "node_modules/.cache/hellyeah-tracker";
export const DEFAULT_INSTALL_STATE_PATH = `${TRACKER_STATE_DIR}/install-state.json`;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const IGNORED_DIRS = new Set([
  ".cache",
  ".docusaurus",
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".parcel-cache",
  ".serverless",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  "bower_components",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

export const SOURCE_EXTENSIONS = new Set([
  ".astro",
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
]);

export const SOURCE_FILE_CAP = 1000;

export const EXCLUDED_ROOT_PREFIXES = [
  ".codex/skills/",
  ".claude/skills/",
  ".agents/skills/",
];
