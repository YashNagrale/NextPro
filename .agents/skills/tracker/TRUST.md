# Trust

This skill modifies your project through an AI agent. This document is the
security contract: what the skill writes, what it does not, and how to verify
every claim by reading the scripts.

The skill ships as plain ESM modules under `scripts/`. No bundler, no
minification, no transpilation. You can read the whole thing directly.

## What this skill does

1. **Root + source enumeration** — walks every `package.json` under `--cwd`
   to identify roots, then walks each root's source tree (read-only,
   ignoring `node_modules`/build outputs/caches) to produce a per-root
   `sourceFiles[]` inventory. The script does no role tagging and no
   content matching — its only judgment is which directories to skip
   (build outputs) and which file extensions count as source. Explore
   sub-agents read source from the inventory and propose root roles and
   conversion sites; the main agent decides the install plan, spot-checks
   evidence, edits source, and writes state. The script's job is making
   sure no root and no source file is silently invisible. Read-only.
2. **Verify-time tracker resolution** — checks the Hellyeah CLI version, invokes
   `hellyeah tracker state --json` once, and invokes
   `hellyeah tracker create --domain <host> --json --yes` or
   `hellyeah tracker create --pre-launch --json --yes` only when state says the
   org has no tracker. It parses `data.tracker.trackerId` from state or
   `data.trackerId` from create, then writes that id through deterministic
   local scripts. The CLI writes no files.
3. **Verify** — reads agent-authored
   `node_modules/.cache/hellyeah-tracker/install-state.json` (v2 schema),
   verifies approved files contain real tracker event calls, checks the server
   SDK singleton shape, runs PII red-flag patterns, and validates the
   per-root `discoveryReports[]` (every enumerated root has a report; every
   `filesRead`/`site` path resolves to a real file inside the root; every
   `findings[].evidence` non-blank line appears as a substring in the cited
   source file; every proposed event wires to an approvedFile and vice
   versa).
4. **Env-state writes** — `scripts/env-state.mjs` writes
   `HELLYEAH_TRACKER_ID`, `NEXT_PUBLIC_HELLYEAH_TRACKER_ID`,
   `HELLYEAH_TRACKER_ENV`, and `NEXT_PUBLIC_HELLYEAH_TRACKER_ENV` into
   `.env.example` and `.env.local` after a tracker id is known. The tracker id
   keys are server-authoritative upserts; the tracker env keys are inserted
   only when absent so a user's `staging` or `preview` value is not clobbered.

That's the entire script surface. Source mutation is performed by the agent via
its Edit tool, not by these scripts.

## Source walk posture

`prepare` and `verify` both walk user source read-only. The walk:

- Ignores `node_modules`, `.git`, `.next`, `.nuxt`, `.output`, `.svelte-kit`,
  `.turbo`, `.cache`, `.parcel-cache`, `.vercel`, `.serverless`,
  `.docusaurus`, `dist`, `build`, `coverage`, `out`, `target`, `vendor`,
  `bower_components`. The full set is in `scripts/constants.mjs#IGNORED_DIRS`.
- Lists only files whose extension is in `SOURCE_EXTENSIONS`
  (`.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs`/`.svelte`/`.vue`/`.astro`).
- Caps the per-root inventory at `SOURCE_FILE_CAP` (1000 entries) and
  surfaces a `sourceFilesTruncated: true` flag when hit. The agent
  navigates by directory rather than expecting a complete list.
- Does **not** read file contents during enumeration. `prepare` only collects
  paths; the agent reads files using its own Edit/Read tooling. `verify`
  reads file contents only for files explicitly listed in
  `install-state.json` (approvedFiles + every `findings[].site`, including
  reads triggered by the v2 evidence-in-source substring check).

The walk replaces an earlier v0.2.0 promise that scripts never touched user
source. The trade is intentional: with no source visibility, the script
could not detect when the agent's skip rationale was ungrounded. Per-root
accountability needs verifiable references, and verifiable references need the
script to know which paths exist. The walk is read-only; what gets read is
bounded; what gets considered "source" is in one auditable file.

## What this skill does not do

| Claim                                                              | Verify with                                                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| No direct network calls from scripts                               | `grep -nE 'fetch\(\|http[s]?\.\|XMLHttpRequest\|net\.\|dns\.\|tls\.' scripts/*.mjs` returns empty                                            |
| No `eval`, no `new Function`, no shell strings                     | `grep -nE 'eval\(\|new Function\|child_process\.exec\b' scripts/*.mjs` returns empty                                                         |
| No `spawn`; only `execFile` with explicit argv                     | `grep -nE 'spawn\(\|\bexecFile\b' scripts/*.mjs` returns only `execFile` matches                                                             |
| Refuses non-FQDN production domains, IPs, localhost, credentials   | `scripts/safety.mjs` `normalizeHostname`                                                                                                     |
| Never writes user source code                                      | `grep -nE '\bwriteFile\b\|\bwriteText\b' scripts/*.mjs` returns matches only inside `utils.mjs`, `verify.mjs`, and `env-state.mjs` |
| `verify` writes only install-state and env files                   | `grep -nE '\bwriteFile\b\|\bmkdir\b\|\brename\b' scripts/verify.mjs scripts/env-state.mjs scripts/utils.mjs` shows only atomic JSON/env helpers |
| Source walk reads filenames only, not contents, during enumeration | `grep -nE '\breadFile\b\|\breadText\b' scripts/roots.mjs` returns empty                                                                      |

## Network egress

The scripts make no direct network calls. Remote provisioning happens through
one subprocess you can monitor in your shell:

| Subprocess                                      | When                                          | Where                                      |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| `hellyeah --version` | `verify`, before tracker state/create | `provisioning.mjs` `assertMinimumCliVersion` |
| `hellyeah tracker state --json` | `verify`, exactly once for normal resolution | `provisioning.mjs` `resolveTrackerFromCli` / `resolveTrackerStateFromCli` |
| `hellyeah tracker create --domain <host> --json --yes` or `hellyeah tracker create --pre-launch --json --yes` | `verify`, only when state returns `no_tracker` | `provisioning.mjs` `provisionTracker` |

Every call uses `execFile` with an explicit argv array — no shell, no string
interpolation, no globbing.

The skill does **not** run `pnpm/npm/yarn/bun add @hellyeah/x-ray` itself.
The agent runs it directly via the user's package manager so the install
appears verbatim in the transcript.

## Files the skill writes

`prepare`:

- nothing. It enumerates roots and does not read `HELLYEAH_TRACKER_ID` from the
  parent process.

`verify`:

- `node_modules/.cache/hellyeah-tracker/install-state.json` after normalizing
  `trackerId`,
- `.env.example` and `.env.local` through `scripts/env-state.mjs`.

The agent — separately, via the Edit tool — writes:

- package manifests and lockfiles per `SKILL.md` step 4 when a root imports
  `@hellyeah/x-ray` and does not already depend on it,
- the chosen app's source files (singleton init, provider mount, conversion
  events) per `SKILL.md` step 5,
- `node_modules/.cache/hellyeah-tracker/install-state.json` per `SKILL.md`
  step 7.

The script's `utils.mjs` exposes `writeJsonAtomic` (write-to-tmp + rename) so
`verify` and script-invoked state writes never leave half-written
`install-state.json` files on a crash.

The skill never writes:

- `./.hellyeah/config.json`
- `node_modules`, `.git`, `.next`, `.turbo`, build outputs, or anything under
  ignored dirs except
  `node_modules/.cache/hellyeah-tracker/install-state.json`
- `AGENTS.md`, `CLAUDE.md`, or other repo policy files

## Failure handling

The skill does not snapshot files or perform hidden rollback. Once the agent
edits source, those writes are visible in the working tree. If `verify`
fails, every issue lands in `repairs[]` with a stable `code` and `message`.
The agent fixes them with `Edit` and reruns `verify`. No magic restore.

Missing install-state is treated as a fresh install. There is no migration or
self-healing from old `./.hellyeah/config.json` state.

## PII red-flag rules

`scripts/pii-redflags.mjs` enumerates the patterns `verify` flags inside
`metadata:` blocks adjacent to `cv.*` calls:

- literal `email:` or `phone:` keys
- alias keys: `contact:`, `customer:`, `billingDetails:`, `profile:`
- object spreads: `...customer`, `...session`, etc.
- nested object literals (anything containing `{` inside the metadata block)

The rule list is auditable in one file. Email and phone must travel through
SDK `identity:`, which is hashed server-side. `metadata:` ships plaintext.

## Trust knobs and overrides

| Knob                                | Where                                  | Effect                                                         |
| ----------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `--hellyeah-bin <path>`             | `provisioning.mjs` `resolveHellyeahCli` | Uses `<path>` as the `hellyeah` CLI                            |
| `--hellyeah-runner pnpm\|npx\|yarn` | same                                    | Resolves `hellyeah` via the named package runner               |
| `HELLYEAH_TRACKER_CLI_BIN` env var  | same                                    | Same effect as `--hellyeah-bin`; the flag wins if both are set |
| `--cwd <path>`                      | `cli.mjs`                              | Project root for prepare/verify; defaults to `process.cwd()`   |
| `--domain` / `--domains`            | `cli.mjs` → `safety.mjs`               | Production hostname allowlist for prepare and missing-id verify           |
| `--pre-launch`                      | `cli.mjs` → `safety.mjs`               | Explicit no-production-domain mode; provisions with a placeholder tracker |
| `--org <uuid>`                      | `provisioning.mjs`                     | Disambiguates the org for verify-time tracker state/create     |

Every subprocess inherits the parent process environment by default (standard
Node behavior). The skill does not redact, filter, or rewrite environment
variables before invoking subprocesses. If the parent shell exposes secrets,
those secrets reach `hellyeah` and any package runner you configure.

The `hellyeah` CLI honors `HELLYEAH_API_URL` without signature verification.
That matches Stripe, Supabase, and Vercel CLI override conventions: if you
point the installer at a custom API URL, you are trusting that server to return
skill files that the local agent may execute.

## What this skill does not promise

- It does not validate the agent's source edits beyond what `verify` checks
  (events present, singleton shape, PII red flags, discoveryReports
  references resolve, proposed events wire to approvedFiles). The
  `discoveryReports[]` rules catch the agent skipping a root without
  reading its source, but the actual call to "is this code path a real
  conversion site" is the agent's judgment, not the script's. Review the
  diff before merging.
- It does not protect you from a malicious agent. Every script invocation
  appears verbatim in the transcript with full args — that is the audit
  trail. If you do not trust the agent, do not run it.
- It does not guarantee the SDK install succeeds on every package manager.
  The agent runs the install in your terminal; the failure is visible.
- It does not prove events reached X-Ray. End-to-end delivery confirmation is
  outside this skill's completion gate until the Hellyeah CLI can fetch recent
  X-Ray events directly.

## Audit by reading

| File                       | Responsibility                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/constants.mjs`    | SDK package name, UUID regex, ignored dirs, source extensions, source-file cap, install artifact path                                                                                                                                |
| `scripts/workflow.mjs`     | Workflow step ids, artifact names, install-state version, post-prepare `next[]` labels                                                                                                                                               |
| `scripts/utils.mjs`        | `parseArgs`, `readJson`, `writeJsonAtomic`, `writeOutput`, `hasPath`                                                                                                                                                                 |
| `scripts/safety.mjs`       | `normalizeHostname`, `normalizeDomainList`, `resolveProductionDomains`                                                                                                                                                               |
| `scripts/roots.mjs`        | Walks `package.json` files, walks each root's source tree (read-only, paths only), returns `{ path, packageName, dependencies, devDependencies, sourceFiles, sourceFilesTruncated }` per root. No role tagging, no content matching. |
| `scripts/paths.mjs`        | `--cwd`, root, approved-file, source-file, `filesRead`, and `site` path resolution                                                                                                                                                   |
| `scripts/state.mjs`        | install-state v2 schema validation, `cv_X` wire-format rejection, `rationale`/`evidence` minimums                                                                                                                                    |
| `scripts/sources.mjs`      | Call-aware event verification, singleton shape, source matching, PII invocation                                                                                                                                                      |
| `scripts/discovery.mjs`    | Per-root discoveryReports validation, filesRead/site resolution, evidence substring checks, forward + reverse event cross-checks                                                                                                     |
| `scripts/repairs.mjs`      | Stable repair construction and repair catalog                                                                                                                                                                                        |
| `scripts/provisioning.mjs` | Minimum CLI version check, single verify-time `hellyeah tracker state`, optional `tracker create`, and JSON envelope parsing                                                                                                         |
| `scripts/env-state.mjs`    | Deterministic `.env.example` / `.env.local` writes for tracker ids and event gate keys                                                                                                                                               |
| `scripts/pii-redflags.mjs` | Pattern list for PII detection inside `metadata:` blocks                                                                                                                                                                             |
| `scripts/verify.mjs`       | Orchestrates state validation, approved-file checks, root enumeration, and discovery checks into stable public output                                                                                                                |
| `scripts/cli.mjs`          | Command dispatch (`prepare`, `verify`, `--help`)                                                                                                                                                                                     |

No bundler. No transpilation. Script responsibilities are split so each file
is auditable in isolation.
