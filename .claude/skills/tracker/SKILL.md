---
name: tracker
license: Hellyeah Proprietary License
description: >
  Install Hellyeah/tracker analytics by changing existing web-app source. Use
  only for source-editing install or instrumentation tasks: install Hellyeah,
  install tracker, add tracking/analytics, make an app measurable, send
  conversion signals from signups/leads/demo bookings/trials/purchases, improve
  ad learning or ROAS with app data, connect frontend actions to checkout/
  payment/webhook conversions, prepare attribution or retargeting signals, add
  identify calls, data-hy attributes, or cv_* events across Next.js, React/Vite,
  Remix, Astro, Svelte/SvelteKit, and Vue/Nuxt. Do not use for tracker
  management/admin tasks such as listing trackers, linking a repo to an
  existing tracker id, creating/updating tracker records through the CLI, or
  explaining tracker config. Do not use for no-code tasks: ads strategy or
  planning, docs, review-only work, debugging existing events, vendor
  comparisons, campaign/creative management, or SDK/package source fixes.
compatibility: Framework installs require Node.js 20+ and a project package manager; a static-HTML target (no package manager) needs only the Hellyeah CLI for tracker-id resolution. All paths need Hellyeah CLI 1.0.0+; verify resolves the tracker id through `hellyeah tracker state` / `hellyeah tracker create`.
metadata:
  version: "0.6.0"
---

# Tracker

_Audit details (subprocesses, files written, failure semantics) live in
[`TRUST.md`](./TRUST.md)._

Install tracker instrumentation for the real product journey, not just the
first detected web app. The main agent owns judgment, edits, state, verify,
terminal feedback, and final response. Explore sub-agents gather bounded source evidence.
Scripts own deterministic postconditions: root/source enumeration,
verify-time tracker provisioning, env-file writes, and verification.

## Terminal Feedback

When this skill reaches a terminal state, run `hellyeah feedback` exactly once
before the final chat response. Use JSON stdin so the outcome is structured;
do not use positional text.

Terminal states:

- `completed` — source edits are done,
  `node_modules/.cache/hellyeah-tracker/install-state.json` is authored, and
  `verify` returned `success: true`.
- `blocked` — the workflow cannot continue without external action.
- `error` — an unexpected tool, runtime, or code error stopped the install.

Normal approval waits and user confirmation gates are not terminal stuck
states. Submit feedback for those only if you are ending the run there because
you cannot proceed.

```bash
cat <<'EOF' | hellyeah feedback --json
{
  "kind": "note",
  "about": "tracker-skill",
  "message": "Tracker install completed: verify succeeded.",
  "details": {
    "status": "completed",
    "lastStep": "verify",
    "completedSteps": [
      "prepare",
      "classify-roots",
      "discover",
      "present-plan",
      "install-sdk",
      "edit-source",
      "self-audit",
      "write-install-state",
      "verify"
    ],
    "blockers": [],
    "errors": [],
    "verifySuccess": true
  },
  "client": {
    "runtime": "<Codex|Claude Code|other>"
  }
}
EOF
```

Use `kind: "note"` for completion, `kind: "suggestion"` for terminal
blockers, and `kind: "crash"` for unexpected errors. The CLI always generates
the `id`; never put one on stdin. To retry a call that timed out
(`delivered: false`), re-invoke with `--retry` and the `id` from that prior
success envelope.

## Runtime ID Contract

The actual tracker UUID is not required until step 8. Steps 1 through 7 use
source references such as `process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ID`; they
must not hardcode the UUID into source.

The server is the tracker-id authority. `verify` ignores shell
`HELLYEAH_TRACKER_ID` when deciding which tracker the project owns. It runs
`hellyeah tracker state --json`; if the org has no tracker, it then runs
`hellyeah tracker create --domain <production-host> --json --yes` or
`hellyeah tracker create --pre-launch --json --yes`.

```bash
hellyeah tracker state --json
hellyeah tracker create --domain <production-host> --json --yes
hellyeah tracker create --pre-launch --json --yes
```

The CLI writes no files. The skill writes the resolved UUID into
`install-state.json`, `.env.example`, and `.env.local` through
`scripts/env-state.mjs`, then continues verification. `install-state.trackerId`
stays as an advisory audit field, not as an id source.

If an agent or user supplies `--tracker-id <uuid>`, `verify` reconciles it
against `tracker state`. A mismatch returns
`tracker_ownership_unconfirmed`, writes nothing, and instructs the agent to ask
whether to continue. The only override path is a re-run with
`--confirm-tracker-override <same-uuid>`, which writes the provided id and skips
delivery/source verification for that run.

When you belong to more than one org and have not selected one, `verify` returns
`code: "org_selection_required"` (with `reason: "multi_org_ambiguous"` for
back-compat) and a `question` whose `options` are the org names. Present those
options to the user, write nothing, and re-run with `--org <id>`.

If your `.env` files already point at a different tracker id (`oldId`) than the
one this run resolved (`newId`), `verify` returns
`code: "tracker_env_overwrite_unconfirmed"` and writes nothing. Overwriting
repoints analytics to `newId`; events under `oldId` stay on the other tracker.
Ask the user, then on confirmation re-run with
`--tracker-id <newId> --confirm-tracker-override <newId>`.

Agents must not read or edit `.env*` files directly. The deterministic script
owns those writes so secrets are not exposed to the language model.

## Required workflow

This skill runs as an 8-step checklist. Step 1 is `prepare`; after it succeeds,
`prepare.next[]` returns the remaining step ids for steps 2–8. Steps marked
**prescriptive** have a fixed shape — deviating breaks `verify`. Steps marked
**flexible** are where the agent uses judgment. The machine-readable step ids
and artifact names live in `scripts/workflow.mjs`; Step 2 is split into
`classify-roots` and `discover`, then Steps 3–8 are one id each.
`prepare.next[]`, this workflow, and `references/verification.md` must use
that vocabulary.

**Steps 6–8 and terminal feedback are non-skippable.** Source edits without
`discoveryReports[]`, `verify.mjs` returning `success: true`, and one
structured `hellyeah feedback` submission are an incomplete install. The most
common failure mode is stopping after step 5 with a chat summary; `verify` and
terminal feedback are the backstops that make that visible.

### Exploration architecture

After `prepare` succeeds, use the Agent tool with `subagent_type=Explore` to
walk the codebase. The main agent keeps the domain, `roots[]`, final install
decisions, and user-facing judgment in view. Use one Explore sub-agent per
root; see [`references/exploration.md`](./references/exploration.md).

Hand each sub-agent this brief verbatim, replacing the bracketed slots:

> You are surveying `[<root.path>]` for Hellyeah/tracker conversion sites.
> Production domain: `[<domain>]`. User scope: `[<scope or "none">]`.
>
> Read files from this `sourceFiles[]` inventory: `[<root.sourceFiles[]>]`.
> Cap at 25 files unless you have a load-bearing reason to read more.
> Reference `references/conversion-discovery.md` for signal meaning.
>
> You may not edit files, install packages, run `hellyeah` commands, read or
> edit `.env*`, or write `node_modules/.cache/hellyeah-tracker/install-state.json`.
>
> Return a single JSON object with the fields specified below. Cap total output
> at 3000 tokens; if you must drop findings, move them into `blocked[]` with
> `reason: "over_cap"` and list paths in `searched[]`.
>
> Return these fields: `{ root, semanticRoles, filesRead, candidateEntrySurface, identityBridge, findings, skipped, blocked, packagesToInstall, openQuestions }`

Merge sub-agent reports in this order:

1. Dedupe `findings[]` by `site`; prefer catalog `cv.*` over custom events for same-site conflicts, and surface both rationales in chat.
2. Resolve `candidateEntrySurface` collisions by picking the root with the most route-bearing files; ask the user only on ties or `unknown`.
3. Open each cited file for findings you plan to instrument and confirm `evidence` appears literally before step 7.
4. Carry every `blocked[]` entry forward into the step-7 install state; never silently drop a sub-agent's "could not prove."
5. Fold all `openQuestions` into one user-facing list rendered in step 3.

Do not delegate user-facing judgment, source edits, install-state authorship,
`verify`, or terminal feedback.

### 1. Prepare _(prescriptive; `prepare`)_

```bash
node <skill>/scripts/cli.mjs prepare --cwd <project> (--domain <production-host> | --pre-launch) --json
```

`prepare` walks every `package.json` under `--cwd`, produces per-root
`sourceFiles[]`, and returns `roots[]`, `trackerId`, `domains[]`, and `next[]`
for steps 2–8. The returned `trackerId` is always `null`; id resolution is
deferred to step 8.

`prepare` does not mutate user source, package manifests, `.env` files, or
remote tracker state. It makes no CLI subprocess calls. `--cwd` stays at the
project root across reruns so
`install-state.json` can list approved files across every root.

Each root is `{ path, packageName, dependencies, devDependencies, sourceFiles,
sourceFilesTruncated }`. `sourceFiles[]` is the root-relative source inventory.
The entry-surface decision is your conversation with the user, not a script gate.

`prepare` does not read `HELLYEAH_TRACKER_ID` from the shell.

### 2. Map the product journey _(flexible; `classify-roots`, `discover`)_

Start from the production domain the user names. Run the exploration through
Explore sub-agents as described above, then synthesize their reports in the
main agent. These passes are still required — delegation changes who gathers
evidence, not the evidence contract.

1. **Enumerate every root.** Go by `package.json` location, not directory
   naming. Non-JS services are external conversion authorities needing an
   HTTP postback. `sourceFilesTruncated: true` means navigate by directory.
2. **Classify each root from source evidence.** Decide entry surface,
   conversion authority, worker, dashboard, docs, utility, or skip. A root can
   play multiple roles; full-stack frameworks often emit backend conversions.
   When a target's entry surface is static HTML with no `package.json` or
   bundler (a static-site generator, hand-written `.html`, or a page cast by an
   external CLI), classify it as a **static entry surface** and route it to the
   script-tag path — see `references/framework-adapters.md` — instead of
   recording it in `blocked[]`. A pure static project has no roots for `prepare`
   to enumerate; a static dir inside a larger monorepo is simply not enumerated
   (no `package.json`), and its coverage lives in the step-3 plan, not the state
   file.
3. **Run the discovery procedure for every plausible signal.** Assign each
   backend-shaped root to Explore and require
   [`references/conversion-discovery.md`](./references/conversion-discovery.md).
   Custom events are first-class and additive to `cv.*`, not substitutes.
   **Account for the whole funnel, not one safe event** — ad platforms
   optimize on the full sequence, so a real stage you skip for scope reasons
   is signal lost. Commerce roots: walk the storefront ledger (view,
   add-to-cart, begin-checkout, purchase, newsletter-as-custom, identity
   bridge). AI/chat/productivity roots: custom activation events are required
   consideration, not optional extras.
4. **Every root produces a `discoveryReport` in step 7.** Use `blocked[]`
   when proof bottoms out; guessing the wrong surface is worse than declaring
   uncertainty.

Identify exactly one **entry surface** and the **identity bridge** between
browser visitors and server conversions. If multiple surfaces could
plausibly be the entry surface, ask the user — do not silently pick
`apps/admin` or `apps/docs`. For architectures that don't fit one entry +
one authority, see the archetypes in **Journey mapping** below.

### 3. Present the journey and planned events _(flexible; `present-plan`)_

Two artifacts before package install, source edits, or `.env` edits. Both go
in chat; nothing is written to disk.

**Artifact 1 — Roots table.** One row per `roots[]` entry. Required columns:
root path, semantic role, instrumentation it will receive, notes/rationale.
Skipped roots show the reason. This is the user's veto point.

**Artifact 2 — Planned events list.** One row per conversion event. Required
columns: source file (`path:line`), event name, kind (`cv.*` or custom),
identity-bridge plan, and one-line rationale. A backend root with no entries
means you missed a conversion site or must declare `skipped[]` entries.

Then narrate the entry-surface choice, identity-bridge strategy, and per-root
coverage. For roots with no findings, name the files you'll skip and why.

**STOP.** Do not proceed to step 4 until the user explicitly approves both
artifacts. The verify backstop runs after edits; it cannot recover from edits
made before approval. If the user is AFK, post the artifacts and wait.

### 4. Install the SDK and read SDK types _(prescriptive; `install-sdk`)_

After the user confirms the plan, check every root that will import
`@hellyeah/x-ray`. If the dependency is absent:

```bash
<package manager> add @hellyeah/x-ray
```

Install in every root that imports from `@hellyeah/x-ray`. The install must
complete before step 5 because later edits assume the SDK is resolvable.

**Static entry surface — skip the SDK install.** A static-HTML target has no
`<package manager> add`; the tracker loads from the hosted `script.js` at
runtime. Do not run an install for that surface, and do not read SDK `.d.ts`
types for it — the declarative `data-*` contract is fixed (see
`references/framework-adapters.md`).

Then read `TrackData`, `XRayOptions`, `Attribution`, and `IdentifyParams` from
`**/@hellyeah/x-ray/**/*.d.ts`. Closed shapes make events postback-ready.

### 5. Edit source _(prescriptive shape, flexible placement; `edit-source`)_

Use the Edit tool. The script never writes user source code. Required edits:

- **Server SDK singleton**, exactly once per server-side codebase:
  ```ts
  import { createXRay } from "@hellyeah/x-ray/server";
  export const tracker = createXRay(
    process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ID,
    {
      env: process.env.HELLYEAH_TRACKER_ENV,
    },
  );
  ```
  The first argument must read `process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ID`
  or `process.env.HELLYEAH_TRACKER_ID` directly. Hardcoded UUIDs, constants,
  and helper wrappers can drift from verify-time provisioning and are rejected.
  Do not gate individual `track()` calls; `verify` flags that shape.
- **Provider mount** in the entry surface's root layout — see
  `references/framework-adapters.md` for the per-framework import + JSX or
  `injectAnalytics` shape. Pass exact production hostnames in `domains=`. For a
  **static entry surface** there is no provider import: drop the hosted
  `<script src=".../script.js" data-website-id=...>` tag into the page `<head>`
  instead — see the "Static HTML / no-bundler" section in
  `references/framework-adapters.md`.
- **Conversion events** at the real conversion sites — see
  `references/instrumentation-examples.md` for the three call-shape
  templates (server with revenue, server without revenue, browser
  engagement). On a **static entry surface** the conversion sites are CTA
  elements (links, buttons, forms) instrumented declaratively with
  `data-hy-event` / `data-hy-prop-*`, not JS `track()` calls — see the
  declarative-HTML template in `references/instrumentation-examples.md`.
- **No direct `.env*` edits.** Source can reference
  `HELLYEAH_TRACKER_ID`, `NEXT_PUBLIC_HELLYEAH_TRACKER_ID`,
  `HELLYEAH_TRACKER_ENV`, and `NEXT_PUBLIC_HELLYEAH_TRACKER_ENV`, but the
  actual `.env.example` and `.env.local` writes happen in step 8 through
  `scripts/env-state.mjs`.

### 6. Self-audit _(flexible; `self-audit`)_

Walk the prompts in [`references/self-audit.md`](./references/self-audit.md)
before writing state — funnel completeness first, then identity bridge,
catalog-vs-domain meaning, event-name form, and SDK peer-dep range. The
script catches mechanical errors; this step catches judgment errors that pass
schema but ship the wrong signal.

### 7. Write `install-state.json` _(prescriptive; `write-install-state`)_

Author `node_modules/.cache/hellyeah-tracker/install-state.json` (v3). Full
schema, example JSON, and per-field rules live in
[`references/verification.md`](./references/verification.md#install-statejson-schema).

Rules `verify` enforces:

- Every enumerated root needs a `discoveryReports[]` entry — no exceptions.
- `filesRead[]` lists at least one source file per root that has source.
- `rationale` ≥ 40 chars; `evidence` ≥ 20 chars and substring-matches the file.
- `cv.X` form only — wire-format `cv_X` is rejected.
- Every `findings[].proposedEvent` must wire to an `approvedFiles[]`
  event in the same root, and vice versa.
- `skipped[].reason` is a specific sentence; placeholders rejected.
- `blocked[]` is optional but `searched[]` must list real paths/queries.
- Every server `cv.*` conversion finding needs an `identityBridge`: `site` for
  single-site mechanisms, `cookieSite` + `conversionSite` for
  `server_cookie_persist`, or `justification` for `deferred`. Missing one
  blocks (`identity_bridge_missing`); a declared mechanism whose sites don't
  resolve, lack markers, or don't match the conversion payload blocks
  (`identity_bridge_site_unresolved`); a `deferred` bridge passes with a
  coverage diagnostic. See
  [`references/identity-bridge.md`](./references/identity-bridge.md).

**Never register a static-HTML file in `approvedFiles[]` or
`discoveryReports[].findings[]`.** The content checks expect a JS `track(...)`
or `createXRay(...)` call; an `.html` file has neither, so registering it fails
(`conversion_event_missing` / `server_singleton_missing_init`). A static entry
surface's `<script>` tag and `data-hy-event` instrumentation are confirmed by
the agent reading the file back, and its coverage is recorded in the step-3
plan prose only — not in the state file.

For what to look for when authoring `findings[]` and rationale shape, see
[`references/conversion-discovery.md`](./references/conversion-discovery.md).

### 8. Verify _(prescriptive; `verify`)_

```bash
node <skill>/scripts/cli.mjs verify --cwd <project> (--domain <production-host> | --pre-launch) --json
```

If a step failed mid-install (SDK install, provider mount, singleton
init, install-state, verify repairs), see the "Recovery" section in
[`references/verification.md`](./references/verification.md).

Reads `install-state.json`, checks approved files, validates singleton
tracker-id/env shape and PII red flags, validates `discoveryReports[]` against
disk, resolves the org tracker through `hellyeah tracker state` / `create`, and
returns stable `repairs[]`. Loop until `success: true`. `verify` also returns
an advisory `diagnostics[]` tier (warns
that never gate, e.g. a `cv.subscribe` payload missing `revenue`) — read and
address them, but they do not block success. See the `diagnostics[]` and
lazy-rationale repair notes in
[`references/verification.md`](./references/verification.md).

`verify: success` proves the install matches disk and the declared event calls.
It does **not** prove events reached X-Ray. End-to-end delivery confirmation is
outside this skill's completion gate until the Hellyeah CLI can fetch recent
X-Ray events directly.

**Summary contract.** The final user-facing summary always includes the
attribution coverage table from `verify`'s `summary.attributionCoverage`:
conversions instrumented vs. stitched, and every conversion that will NOT
attribute to ad clicks (a `deferred` bridge). A green verify with deferred
bridges is a real install with named gaps, not a finished one — show the gaps
so the user is never silently shipped an orphan.

**Pure static project (no `package.json` anywhere).** `prepare` enumerates zero
roots, so the deterministic `verify` step has nothing to check and is N/A. The
install is confirmed by reading the edited HTML back — the `<script>` tag with
`data-website-id` and the `data-hy-event` attributes on disk. Resolve the
tracker id with `hellyeah tracker state` / `create` as usual, then submit
terminal feedback. A mixed monorepo still runs full `verify` on its framework
roots; only the static surface is exempt.

## Hand back — diff summary and PR offer

After `verify: success` and terminal feedback, the working tree holds
uncommitted edits the user didn't write. Hand them back explicitly:

1. **Show what changed.** With the final summary, list every file this skill
   edited with a one-line what-and-why each. In a git repo, include
   `git diff --stat` scoped to those files.
2. **Offer a PR — one yes/no question, at most once per install.** Ask only
   when all of these hold:
   - the project is a git repo with a remote;
   - the skill's edits are separable — the tree was clean at `prepare`, or
     every dirty path is one this skill edited;
   - this is a full install, not a repair or verify-only re-run.

   > "Want me to put these changes on a branch and open a PR? Otherwise I'll
   > leave them uncommitted for you to review."

   When any condition fails, skip the question, show the file list, and
   suggest the user review and commit themselves.
3. On **yes**: branch off the current branch, commit only the files this
   skill edited (suggested message:
   `feat: add Hellyeah X-Ray conversion tracking`), push, and open the PR
   with `gh pr create` or the host equivalent. **Never stage `.env*`** —
   env files stay local. On **no** or no answer: do nothing and state that
   the changes are uncommitted.

Never commit, push, or open a PR without an explicit "yes" in this
conversation. A silent auto-commit is a boundary violation, not initiative.

## Journey mapping

See [`references/identity-bridge.md`](./references/identity-bridge.md#roles)
for the per-role mount/SDK/identity matrix.

For architectures that don't fit one entry + one authority and for
cross-domain cookie rules, see
[`references/identity-bridge.md`](./references/identity-bridge.md).

## Gotchas

- **Stopping after step 5 is the default failure.** Source edits look complete
  in chat, but without `install-state.json` and `verify`, the install is
  unfinished. If you're tempted to summarize and stop, you're at the most
  fragile point of the workflow — finish steps 6–8.
- **Terminal feedback is part of done.** A final chat summary without one
  structured `hellyeah feedback` submission is incomplete.
- **Staging does not contaminate production.** The SDK always sends events,
  regardless of environment. Each event carries the `env` tag from
  `HELLYEAH_TRACKER_ENV`, and X-Ray segments production from staging
  server-side at query time. So there is no client-side "off switch" to wire —
  the only requirement is that `env` reads `HELLYEAH_TRACKER_ENV` so every
  event is tagged. `verify` flags a missing or non-env-driven `env`.
- **CLI-created trackers collect enhanced matching data.** `tracker create`
  enables raw IP and user-agent storage (`storeIpAddress`,
  `storeUserAgent`) along with autocapture and Web Vitals. Tell the user when
  this collection matters for their privacy posture.

Identity-bridge gotchas (an agent will not know to load a reference for these):

- **`distinct_id` is the join key, not the cookie `vid`.** The same value must
  appear on the browser `identify` and the server conversion for the tiers to
  meet.
- **`domains` is a silent client-side kill switch.** Clear it for localhost
  testing or no browser events fire.
- **`env` participates in the session hash.** The browser, the identify, and
  the server leg must all carry the same `env`, and API queries need the same
  `env=` or the legs never join.
- **Attribution resolves at query time.** Webhook-vs-identify ordering does not
  matter; do not add code to win that race.
- **First-time-only guards (`!existingUser`) silently skip conversions on
  re-test.** Exercise the SDK path directly rather than trusting a repeat run.

## References

| When to load                                                                                              | File                                     |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **When delegating** codebase exploration after `prepare`                                                  | `references/exploration.md`              |
| **Before writing state** — identity, event meaning, SDK range, smoke plan                                 | `references/self-audit.md`               |
| **Before** authoring `findings[]` — signal contract + discovery procedure                                 | `references/conversion-discovery.md`     |
| **When writing a `cv.*` call** — call-shape templates + PII anti-patterns                                 | `references/instrumentation-examples.md` |
| **When mounting** `<Analytics>` / `injectAnalytics()` in step 5                                           | `references/framework-adapters.md`       |
| **When reading** `TrackData` / `XRayOptions` / `Attribution` closed shapes                                | `references/sdk-contract.md`             |
| **When entry and conversion live on different surfaces** (subdomain, parent domain, iframe, multi-tenant) | `references/identity-bridge.md`          |
| **When wiring** the singleton `env:` tag or `domains` allowlist                                           | `references/production-safety.md`        |
| **After a `verify` failure** — repair codes, schema, recovery                                             | `references/verification.md`             |

## Boundaries

- The script never writes user source code. Only the agent does, via Edit.
- Do not build public rollback or tracker deletion commands.
- Do not delete remote tracker records on failed install.
- Do not mutate repo policy files (`AGENTS.md`, `CLAUDE.md`, etc.).
- Do not commit, push, or open a PR without an explicit user "yes"; never
  stage `.env*`.
- Do not write `./.hellyeah/config.json`; it is removed and not migrated.
- Do not read or edit `.env*`; `scripts/env-state.mjs` owns those writes.
- Do not auto-install the Hellyeah CLI globally; guide the user or use
  `--hellyeah-bin` / `--hellyeah-runner`.
- Do not import from `@hellyeah/shared` in user projects.
- Do not gate individual `track()` calls behind environment checks. The SDK
  always sends; `env` tags each event and X-Ray filters non-production traffic
  server-side. Per-call wrapping is an anti-pattern that `verify` rejects.
