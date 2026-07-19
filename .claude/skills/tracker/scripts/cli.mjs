#!/usr/bin/env node
import { enumerateRoots } from "./roots.mjs";
import { resolveProductionDomains } from "./safety.mjs";
import { parseArgs, resolveCwd, writeOutput } from "./utils.mjs";
import { verify } from "./verify.mjs";
import { buildNextSteps } from "./workflow.mjs";

const HELP = `Tracker skill harness.

Usage:
  node scripts/cli.mjs prepare --cwd <root> (--domain <production-host> | --pre-launch) [--json]
  node scripts/cli.mjs verify  --cwd <root> [--domain <production-host> | --pre-launch] [--tracker-id <uuid>] [--confirm-tracker-override <uuid>] [--json]
  node scripts/cli.mjs --help

prepare:
  Enumerates every package.json under --cwd, walks each root's source tree
  (read-only) and surfaces a sourceFiles[] inventory per root. trackerId is
  null because verify resolves the org tracker through hellyeah tracker state.
  The agent classifies each root
  semantically and decides which files to read from the
  sourceFiles[] inventory — the script does not tag roles or guess at
  conversions. No source mutation. Pass --domain or --domains for the
  production hostname allowlist, or --pre-launch when no production domain exists.

verify:
  Reads node_modules/.cache/hellyeah-tracker/install-state.json (agent-authored), checks every
  approved file for the expected events / singleton init shape / PII red
  flags, validates the per-root discoveryReports[] (every enumerated root
  has a report; every filesRead/site path resolves; every proposed event
  wires to an approvedFile and vice versa), resolves the id through
  hellyeah tracker state (and hellyeah tracker create when the org has no
  tracker), writes the resolved ID to install-state and .env files, then
  verifies. Pass --pre-launch to provision through hellyeah tracker create
  --pre-launch.
`;

const cmdPrepare = async (flags) => {
  const cwd = resolveCwd(flags);
  const roots = await enumerateRoots(cwd);
  const domains = resolveProductionDomains(flags);

  return {
    success: true,
    trackerId: null,
    domains: domains.mode === "production" ? domains.allowlist : [],
    mode: domains.mode,
    source: "deferred_to_verify",
    roots,
    next: buildNextSteps(cwd, domains),
  };
};

const cmdVerify = async (flags) => {
  const cwd = resolveCwd(flags);
  return await verify(cwd, flags);
};

const main = async () => {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const flags = parseArgs(argv.slice(1));
  if (!command || command === "--help" || command === "-h" || flags.help) {
    process.stdout.write(`${HELP.trim()}\n`);
    return command ? 0 : 2;
  }
  let result;
  try {
    switch (command) {
      case "prepare":
        result = await cmdPrepare(flags);
        break;
      case "verify":
        result = await cmdVerify(flags);
        break;
      default:
        process.stderr.write(`Unknown command: ${command}\n\n${HELP.trim()}\n`);
        return 2;
    }
  } catch (err) {
    writeOutput(flags, {
      success: false,
      error: { message: err?.message ?? String(err) },
    });
    return 1;
  }
  writeOutput(flags, result);
  return result?.success === false ? 1 : 0;
};

main().then((code) => process.exit(code));
