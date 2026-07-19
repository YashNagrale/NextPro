# Verification

`scripts/cli.mjs verify --cwd <root> (--domain <host> | --pre-launch) --json` reads
`node_modules/.cache/hellyeah-tracker/install-state.json` (agent-authored),
validates source state, resolves the tracker id through the Hellyeah CLI, and
runs four checks: per-file event presence, singleton shape, PII red flags, and
per-root discoveryReports validation. It
also emits an advisory `diagnostics[]` tier (warns that never gate `success`)
— see [Advisory diagnostics](#advisory-diagnostics-diagnostics).

Workflow step ids, artifact names, and the install-state version are owned by
`scripts/workflow.mjs`. Keep this reference aligned with that contract
instead of inventing new vocabulary.

## `install-state.json` schema

```json
{
  "version": 3,
  "trackerId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "approvedFiles": [
    {
      "path": "apps/api/src/lib/tracker.ts",
      "kind": "server_singleton",
      "expectedEvents": []
    },
    {
      "path": "apps/api/src/webhooks/stripe.ts",
      "kind": "conversion_event",
      "expectedEvents": ["cv.purchase"]
    }
  ],
  "discoveryReports": [
    {
      "root": "apps/api",
      "filesRead": ["src/webhooks/stripe.ts"],
      "findings": [
        {
          "site": "src/webhooks/stripe.ts:42",
          "kind": "stripe checkout completion webhook",
          "proposedEvent": "cv.purchase",
          "rationale": "The catalog says cv.purchase is a completed paid transaction. This site handles a paid checkout completion webhook, so it is the durable purchase moment.",
          "evidence": "case \"checkout.session.completed\":",
          "identityBridge": {
            "mechanism": "server_cookie_persist",
            "cookieSite": "src/auth/callback.ts:18",
            "conversionSite": "src/webhooks/stripe.ts:34"
          }
        }
      ],
      "skipped": [
        {
          "site": "src/routes/health.ts",
          "reason": "This health endpoint is operational monitoring only and does not represent product intent or a conversion moment."
        }
      ],
      "blocked": [
        {
          "site": "src/jobs/",
          "searched": ["src/jobs/", "src/jobs/**/*.ts", "queue handler types"],
          "reason": "The job handlers looked conversion-adjacent, but no durable checkout or lead-completion source could be proven from the files present."
        }
      ]
    }
  ]
}
```

- `version` — must be `3`. Bump when the schema changes; v2 added the
  required `rationale` and `evidence` fields on `findings[]` and rejected
  the wire-format `cv_X` string in `expectedEvents` / `proposedEvent`. v3
  added the `findings[].identityBridge` object, required for every server
  `cv.*` conversion finding.
- `trackerId` — may be `null` while steps 1 through 7 run without a UUID.
  `verify` mirrors the id resolved from `hellyeah tracker state` or, when the
  org has no tracker, `hellyeah tracker create`. The field is advisory and is
  not an id source.
- `approvedFiles[].path` — relative to `--cwd`, posix-style.
- `approvedFiles[].kind`:
  - `server_singleton` — the file that calls `createXRay(...)`.
  - `conversion_event` — a file emitting `cv.*` or custom events.
  - `provider_mount` — the layout/root file mounting `<Analytics>` or
    calling `injectAnalytics()` / `inject()`.
- `approvedFiles[].expectedEvents` — for `conversion_event` files, the
  exact event identifiers (e.g., `cv.purchase`, `cv.leadSubmit`,
  `plan_selected`) the file must emit. `verify` requires each one as the
  first argument to a real `track(...)` or `trackImmediate(...)` call.
  Catalog events must use the `cv.X` form (matches the typed constant
  exported by `@hellyeah/x-ray`); custom events must use a string literal;
  the wire-format `cv_X` is rejected at schema validation. Use `[]` for
  kinds that don't emit events.
- `discoveryReports[]` — required. One entry per enumerated root from
  `prepare`'s `roots[]`.
- `discoveryReports[].root` — must match a `roots[].path` from `prepare`.
- `discoveryReports[].filesRead` — paths of files the agent opened during
  discovery, **root-relative** posix-style. Must include at least one
  entry whose extension is in `SOURCE_EXTENSIONS` for any root that has
  source files. The rule proves the agent looked at code, not just at the
  package manifest.
- `discoveryReports[].findings[]` — one entry per conversion site the
  agent will instrument in this root.
  - `site` — `path[:line]` reference, root-relative, posix-style. Path
    must exist; if `:line` is provided, it must be within the file.
    Server `cv.*` findings must cite the exact conversion call line;
    line-less server conversion findings are not allowed to claim an
    `identityBridge`. Findings sites must point at files (not
    directories) — they describe specific call sites.
  - `kind` — short description so a reviewer reading the diff knows what
    the site is.
  - `proposedEvent` — the event identifier this site will emit. Catalog
    events use the `cv.X` form (wire-format `cv_X` rejected). Must
    appear in some `approvedFiles[].expectedEvents` whose path is owned
    by the same root (forward cross-check).
  - `rationale` — one or two sentences explaining why this site maps to
    this event. The catalog says X; this site does Y; X matches Y because
    Z. Minimum 40 characters (anti-laziness floor); the real check is
    whether a reviewer reading the sentence and opening the cited file
    agrees with the mapping. Required so the reasoning ships in the audit
    trail — `findings[].kind` describes the code, `rationale` justifies
    the event choice.
  - `evidence` — literal source from the cited file showing the
    conversion call site or the surrounding handler. Minimum 20
    characters. `verify` confirms each non-blank line of `evidence`
    appears as a substring of the file at `site`. Forces real reading;
    paraphrased after-the-fact justifications fail the check. Multi-line
    blocks are encouraged (use `\n` in JSON).
  - `identityBridge` — **required** for every server `cv.*` finding. This is
    the attribution contract: a conversion with no browser join key ingests but
    never attributes to ad clicks, and a conversion with the wrong join key has
    the same failure mode. Object shape:
    - `mechanism` — one of `browser_identify`, `server_cookie_persist`,
      `visitor_id_passthrough`, `email_late_bind`, `deferred`. The first four
      are the bridge mechanisms from
      [`identity-bridge.md`](./identity-bridge.md); `deferred` is the
      install-state spelling of a `blocked` bridge — acknowledged, not built.
    - `site` — `path[:line]` where the bridge lives. If it resolves inside the
      conversion root, that file must carry the mechanism marker. If the bridge
      lives in another root, cite it as a cwd-relative path such as
      `apps/web/src/layout.tsx`. Required for `browser_identify`,
      `visitor_id_passthrough`, and `email_late_bind`.
    - `cookieSite` / `conversionSite` — required only for
      `server_cookie_persist`. `cookieSite` is where the first-party request
      reads `hy_attr`; `conversionSite` is where the server conversion passes
      the persisted `vid` as `visitorId`.
    - `justification` — required only for `deferred`. A sentence naming which
      surface owns the unbuilt bridge and why it is out of scope now. A
      deferred bridge means this conversion will NOT attribute to ad clicks,
      so the justification ships in the audit trail and the coverage summary.
- `discoveryReports[].skipped[]` — one entry per file or path the agent
  considered but is not instrumenting.
  - `site` — root-relative path or `path/` for a directory. Path must
    exist on disk.
  - `reason` — non-empty sentence specific to the site. Placeholder
    reasons (`"none"`, `"skip"`, `"n/a"`, `"tbd"`, `"todo"`, etc.) are
    rejected; write a sentence specific enough that a reviewer reading
    the diff can audit the decision.
- `discoveryReports[].blocked[]` — optional. One entry per conversion
  site the agent identified as plausible but could **not** prove from
  source. Use this instead of guessing. Empty or omitted is fine when
  every site has either been instrumented (`findings[]`) or
  consciously passed over (`skipped[]`).
  - `site` — root-relative path or `path/`. Path must exist on disk.
  - `searched` — non-empty array of strings. Each entry names a query,
    file, or type path the agent actually tried (e.g.,
    `"node_modules/better-auth/dist/types/index.d.ts"`,
    `"grep databaseHooks src/"`, `"@better-auth/core BetterAuthOptions"`).
    Empty arrays are rejected — "I couldn't find it" without listing
    what was tried is a guess in disguise.
  - `reason` — non-empty sentence describing what could not be proven
    (which candidate looked plausible, what the agent could not confirm
    in types or source, why a guess would be unsafe). Placeholder
    reasons rejected like `skipped[].reason`.

Author this file through `writeJsonAtomic` (`scripts/utils.mjs`) so a partial
write never leaves `install-state.json` malformed for the next run.

For a minimal skeleton with example `approvedFiles[]` and
`discoveryReports[]`, use the example above and replace every path, event,
rationale, and evidence field with source-backed values from the current
install.

## Event delivery boundary

`verify` proves the install matches disk and the declared tracker calls. It
does not prove events reached X-Ray. End-to-end delivery confirmation is
outside this skill's completion gate until the Hellyeah CLI can fetch recent
X-Ray events directly.

## Verify-time tracker resolution

`verify` ignores shell `HELLYEAH_TRACKER_ID` when deciding which tracker the
project owns. It resolves the id from the server-authoritative CLI surface:

```bash
hellyeah --version
hellyeah tracker state --json
```

The version guard runs before `state` so stale CLIs fail with a "run
hellyeah update" repair instead of "unknown command." If `state` returns
`code: "no_tracker"`, `verify` requires `--domain`, `--domains`, or
`--pre-launch` and runs one create subprocess:

```bash
hellyeah tracker create --domain <host> --json --yes
hellyeah tracker create --pre-launch --json --yes
```

`--hellyeah-bin`, `--hellyeah-runner`, `HELLYEAH_TRACKER_CLI_BIN`, `--org`,
`--name`, and `--api-key` are forwarded through `scripts/provisioning.mjs`.
The skill reads the nested state id from `data.tracker.trackerId` and the flat
create id from `data.trackerId`. The CLI writes no files. The skill then
writes:

- `node_modules/.cache/hellyeah-tracker/install-state.json` with the resolved
  `trackerId`,
- `.env.example` and `.env.local` with `HELLYEAH_TRACKER_ID`,
  `NEXT_PUBLIC_HELLYEAH_TRACKER_ID`, `HELLYEAH_TRACKER_ENV`, and
  `NEXT_PUBLIC_HELLYEAH_TRACKER_ENV`.

`HELLYEAH_TRACKER_ENV` and `NEXT_PUBLIC_HELLYEAH_TRACKER_ENV` are user-owned:
`env-state.mjs` inserts `local` only when those keys are absent. Tracker id keys
are upserts because the server-resolved id is authoritative. Production deploys
must set `HELLYEAH_TRACKER_ENV=prod` and the matching public env var explicitly.
If a stale id in `.env` is overwritten on the no-id-provided path, `verify` logs
the old and new id to stderr while stdout remains JSON.

### Caller-provided tracker ids

`verify --tracker-id <uuid>` does not blindly trust the provided id. It runs
`tracker state` and compares the provided id to the org's tracker id.

- Match: proceeds normally, writes `.env`, and records
  `trackerIdSource: "provided"`.
- Mismatch: returns `success:false`, `code`/`reason:
  "tracker_ownership_unconfirmed"`, includes `providedId`, `orgTrackerId`, and
  writes nothing.
- Provided id with no org tracker: same failure, with `orgTrackerId:null`, and
  no `tracker create`.
- Confirmed override: re-run with `--confirm-tracker-override <same-uuid>`.
  This writes the provided id, sets
  `verificationSkipped: "ownership_override"`, and skips delivery/source
  verification for that run.

Agents must not read or edit `.env*` themselves. `env-state.mjs` is the only
writer for those files.

## Why discoveryReports[] looks the way it does

The pre-v2 audit trail was freeform prose. A motivated agent could write a
confident-sounding sentence skipping every backend root, and no validator
could distinguish a real engineering reason from a rationalized skip.
`discoveryReports[]` (v2 schema) requires the agent to enumerate **what they
read** (`filesRead`), **what they found** (`findings[].site` with file:line
refs, `rationale`, `evidence`), and **what they passed over**
(`skipped[].site` with file refs). Every claim grounds out in a path the
script can resolve. A reviewer reading the diff sees specific files cited and
can open them to audit the decision.

`rationale` and `evidence` close the gap that a path-only audit trail
left open. With just a `proposedEvent` field, the agent could correctly
cite a file and still pick the wrong event — say, mapping a candidate-
assessment "trial" flow to `cv.startTrial` because the variable name
includes the word "trial." `rationale` forces the agent to articulate
the catalog meaning and the site's domain meaning side-by-side, which
makes that kind of category error visible to the agent at write time and
to the reviewer at read time. `evidence` requires a literal source quote
that `verify` substring-matches against the file — the agent cannot
paraphrase code they didn't actually read, and a fabricated rationale
without supporting source fails outright.

The script does not judge whether something is a "real" conversion or
whether the rationale is _correct_ — those are the agent's calls. The
script's job is making sure the agent's claims about each root are
checkable: paths exist, evidence appears in source, events wire to
approvedFiles in both directions.

## Checks performed

### `server_singleton` files

- Must contain a `createXRay(...)` or `new XRay(...)` call.
- The first argument must read `process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ID`
  or `process.env.HELLYEAH_TRACKER_ID` directly.
- Must pass an `env:` option to that call.
- The `env:` value must reference `HELLYEAH_TRACKER_ENV` so every server event
  carries the environment tag X-Ray uses to segment production from staging.

`verify` ignores comments and strings while finding the singleton call and
auditing its first argument and inline options object. Hardcoded UUIDs,
constants, helper wrappers, and extracted-const options (`createXRay(id, opts)`)
are rejected because they can drift from verify-time provisioning or require a
TypeScript parser to audit safely.

### `conversion_event` files

For each event in `expectedEvents`, the file must contain a real
`track(...)` or `trackImmediate(...)` call whose first argument is that event.
Catalog events must be direct `cv.X` expressions; custom events must be string
literals. Comments, standalone strings, constants, aliases, and wrapper calls
do not satisfy this check.

### `provider_mount` files

Phase 3 deferred. `verify` skips PII red-flag and event-presence checks for
`provider_mount` files. The provider mount's correctness is enforced via
trigger evals + reading `framework-adapters.md`.

### PII red flags

Run on `server_singleton` and `conversion_event` files. The matcher in
`scripts/pii-redflags.mjs` flags four categories inside `metadata:` blocks
adjacent to `cv.*` calls: literal PII keys, alias keys, spreads, nested
literals. For one repair example per category, see
[`instrumentation-examples.md#anti-patterns`](./instrumentation-examples.md#anti-patterns).

False positives are acceptable — the agent reviews and either fixes the
shape or leaves a comment justifying the false positive. False negatives
(missed PII) are not.

### Per-root discoveryReports

`verify` enumerates every `package.json` under `--cwd` (the same walk
`prepare` does) plus each root's source files. For each root, it requires
a matching `discoveryReports[]` entry, and within that entry:

- `filesRead[]` — every entry resolves to a real file inside the root.
  If the root has any source files (per `SOURCE_EXTENSIONS`), at least one
  source file must appear in `filesRead`. The thinness rule is what
  prevents the gaming pattern of writing eloquent skipped reasons without
  having opened any code.
- `findings[].site` — every entry resolves to a real file (not directory)
  inside the root. If `:line` is present, it must be a valid line number
  in the file. Server `cv.*` identity-bridge matching requires `:line`
  and treats line-less conversion findings as unclaimed.
- `findings[].proposedEvent` — must appear in some `approvedFiles[]`
  conversion event whose path is owned by the same root (forward
  cross-check). Catches "discovered but not instrumented."
- `findings[].evidence` — every non-blank trimmed line must appear as a
  substring of the file at `site`. Catches paraphrased / fabricated
  evidence that wasn't actually read from source.
- `skipped[].site` — every entry resolves to a real path (file or
  directory) inside the root.
- `skipped[].reason` — non-placeholder, non-empty.
- `blocked[].site` — every entry resolves to a real path (file or
  directory) inside the root.
- `blocked[].searched` — non-empty array of non-empty strings.
- `blocked[].reason` — non-placeholder, non-empty.
- Reverse cross-check: every `approvedFiles[]` conversion event whose
  path is owned by a root must trace back to a `findings[].proposedEvent`
  in that root's report. Catches "instrumented without rationale."

A discoveryReport with both empty `findings[]` and empty `skipped[]` is
treated as vacuous and rejected (`discovery_report_empty`) — the agent
must commit to either a finding or a skip; "I read these files and have
no opinion" is not a valid audit trail. `blocked[]` does not satisfy
this rule on its own — a report that identifies sites it could not
prove must still document either the proven sites (`findings[]`) or the
ones consciously passed over (`skipped[]`).

`blocked[]` exists for the in-between case: the agent identified a
plausible conversion site but could not prove from source which
integration surface fires only at the signal moment. Emitting a
`blocked[]` entry with `searched` and `reason` is strictly preferred
over guessing — a wrong guess instruments the wrong moment, looks
correct in `verify`, and silently corrupts the conversion stream.

When a root has no source files at all (`sourceFiles[]` empty), the
thinness rule does not fire; the agent can write `filesRead: []` and use
`skipped[]` to point at `package.json` or another non-source file with a
reason explaining why this root is not in scope.

### Identity bridge

For every server `cv.*` conversion finding, `verify` requires an
`identityBridge` and validates that the declared mechanism matches source:

- **`identity_bridge_missing`** (repair, blocks) — a server conversion call
  has no matching `path:line` finding with an `identityBridge`. Strict on the
  agent: it must decide how browser identity reaches this conversion, even if
  the decision is "deferred." Costs the user nothing to record.
- **`identity_bridge_site_unresolved`** (repair, blocks) — the recorded `site`
  / `cookieSite` / `conversionSite` does not resolve to a file or the
  mechanism's source marker is absent.
- **`identity_bridge_join_key_missing`** (repair, blocks) — the conversion
  payload is statically resolvable and does not carry the join key required by
  the declared mechanism. If the payload is not statically resolvable, `verify`
  validates the bridge marker and emits `identity_bridge_join_key_unverifiable`
  instead of repairing the unknown as absent. Markers are substring checks in
  the spirit of the singleton/event checks:
  - `browser_identify` — `site` calls `identify(` and the conversion passes
    `distinctId`.
  - `server_cookie_persist` — `cookieSite` references `hy_attr`,
    `conversionSite` passes `visitorId`, and the conversion passes
    `visitorId`.
  - `visitor_id_passthrough` — `site` passes `visitorId`, and the conversion
    passes `visitorId`.
  - `email_late_bind` — `site` calls `identify(` carrying `email`, and the
    conversion passes `identity`. Email-only late bind is counted as
    unstitched unless the conversion also carries `visitorId` or `distinctId`.
- **`conversion_unstitched_from_entry`** (diagnostic, passes green) — the
  mechanism is `deferred`, or `email_late_bind` is the only confirmed bridge.
  Lenient on the outcome: a consciously deferred or email-only bridge does not
  block the install, but it is surfaced as a diagnostic and counted in the
  attribution coverage summary so the user is never silently shipped an orphan.

The summary carries an `attributionCoverage` object —
`{ instrumented, stitched, unstitched, summary }` — where `unstitched` entries
are `event (site)` labels and `summary` is the one-line "N instrumented; M
stitched; cv_x (path:line) will NOT attribute…" string the skill repeats in its
final user-facing summary.

## Output

```json
{
  "success": false,
  "trackerId": "<uuid>",
  "repairs": [
    {
      "code": "discovery_proposed_event_unwired",
      "root": "apps/server",
      "event": "cv.purchase",
      "site": "src/webhooks/stripe.ts:42",
      "message": "findings[].proposedEvent \"cv.purchase\" at src/webhooks/stripe.ts:42 has no approvedFiles[] entry owned by \"apps/server\" listing it in expectedEvents..."
    }
  ],
  "diagnostics": [
    {
      "code": "payload_required_field_absent",
      "severity": "warn",
      "site": "src/billing/subscribe.ts",
      "expectedEvent": "cv.subscribe",
      "message": "cv.subscribe call in src/billing/subscribe.ts appears to omit required payload field(s): revenue, currency..."
    }
  ],
  "summary": {
    "approvedFiles": 4,
    "discoveryReports": 5,
    "findings": 2,
    "skipped": 3,
    "enumeratedRoots": 5,
    "repairsCount": 1
  }
}
```

### Repair codes

| Code                                         | Meaning                                                                                                                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server_singleton_missing_init`              | No `createXRay(...)` or `new XRay(...)` found                                                                                                                                                                                       |
| `server_singleton_missing_tracker_id`        | Init is missing the tracker id first argument                                                                                                                                                                                       |
| `server_singleton_tracker_id_not_env_driven` | Tracker id does not directly read `NEXT_PUBLIC_HELLYEAH_TRACKER_ID` or `HELLYEAH_TRACKER_ID`                                                                                                                                        |
| `server_singleton_env_missing`               | Init is missing an `env:` option that references `HELLYEAH_TRACKER_ENV`                                                                                                                                                             |
| `server_singleton_env_not_env_driven`        | `env` exists but doesn't reference `HELLYEAH_TRACKER_ENV`                                                                                                                                                                           |
| `conversion_event_missing`                   | Declared `expectedEvents` entry was not found as the first argument to a real `track(...)` or `trackImmediate(...)` call                                                                                                            |
| `pii_in_metadata`                            | One or more PII red-flag patterns found inside a `metadata:` block                                                                                                                                                                  |
| `approved_file_missing`                      | Path in `install-state.json` doesn't exist on disk                                                                                                                                                                                  |
| `approved_file_outside_cwd`                  | Path resolves outside `--cwd` (path-traversal guard)                                                                                                                                                                                |
| `discovery_report_missing`                   | Enumerated root has no `discoveryReports[]` entry                                                                                                                                                                                   |
| `discovery_report_unknown_root`              | `discoveryReports[].root` doesn't match any enumerated root path                                                                                                                                                                    |
| `discovery_report_empty`                     | Report has empty `findings[]` and empty `skipped[]` — vacuous audit trail                                                                                                                                                           |
| `discovery_files_read_invalid`               | `filesRead[]` path does not exist on disk                                                                                                                                                                                           |
| `discovery_files_read_outside_root`          | `filesRead[]` path escapes its root (paths are root-relative)                                                                                                                                                                       |
| `discovery_files_read_outside_cwd`           | `filesRead[]` resolves outside `--cwd` (path-traversal guard)                                                                                                                                                                       |
| `discovery_files_read_too_thin`              | Root has source files but `filesRead[]` lists none of them                                                                                                                                                                          |
| `discovery_site_invalid`                     | `findings[].site` points at a directory, has a line on a directory, or is malformed (also fires on `skipped[].site` / `blocked[].site` when malformed)                                                                              |
| `discovery_site_outside_root`                | Site escapes its root or resolves outside `--cwd` (any site array)                                                                                                                                                                  |
| `discovery_site_unresolved`                  | Site does not exist on disk (any site array)                                                                                                                                                                                        |
| `discovery_site_line_out_of_range`           | Site's `:line` is not a valid line in the file (any site array)                                                                                                                                                                     |
| `discovery_proposed_event_unwired`           | `findings[].proposedEvent` has no matching `approvedFiles[]` event for the cited file                                                                                                                                               |
| `discovery_event_unproposed`                 | `approvedFiles[]` conversion event has no matching `findings[]` proposal for that file                                                                                                                                              |
| `discovery_evidence_not_in_source`           | `findings[].evidence` has lines that don't appear as substrings of the file at `site` (paraphrased or fabricated)                                                                                                                   |
| `skipped_reason_lazy_rationale`              | `skipped[].reason` leans on a banned lazy phrasing ("one safe real conversion", "purchase is enough", "would broaden the install") to pass over a real conversion stage. Substring match — rephrase honestly or instrument the site |
| `identity_bridge_missing`                    | A server `cv.*` conversion finding has no `identityBridge`. Record the bridge mechanism, or mark it `deferred` with a justification                                                                                                    |
| `identity_bridge_site_unresolved`            | An identity-bridge site does not resolve in the conversion root or as cwd-relative cross-root evidence, or the resolved file lacks the declared marker                                                                                   |
| `identity_bridge_join_key_missing`           | The declared bridge mechanism requires a join key that the conversion payload confidently omits                                                                                                                                        |

### Advisory diagnostics (`diagnostics[]`)

`verify` returns a `diagnostics[]` array alongside `repairs[]` on both
success and failure. Diagnostics are **advisory**: they never affect
`success` and never block the install. They surface things worth a human
glance that the script cannot prove are wrong. Each entry is
`{ code, severity, root?, site?, expectedEvent?, message }`.

| Code                            | Severity | Meaning                                                                                                                                                                                                                   |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payload_required_field_absent` | `warn`   | A `cv.purchase` / `cv.subscribe` / `cv.registrationComplete` call has an **inline** payload object that confidently omits a required field (e.g. `revenue`, `currency`, `identity`, `distinctId`). Improves match quality |
| `identity_bridge_join_key_unverifiable` | `warn` | A bridge marker resolves, but the conversion payload is a helper/spread/expression the verifier cannot statically inspect. Confirm the payload carries the named join key |
| `conversion_unstitched_from_entry` | `warn` | A conversion finding's `identityBridge.mechanism` is `deferred`, or it uses `email_late_bind` without `visitorId` / `distinctId`. The conversion ingests but will NOT attribute to ad clicks until a click-id bridge is built. Counted in the attribution coverage summary |

Detection is deliberately conservative: it inspects inline object literals and
one-step same-file `const payload = { ... }` variables. Required-field
diagnostics stay silent when the payload is a spread, helper call, import, or
anything else it cannot statically resolve. Identity-bridge join keys warn on
those unknown payload shapes instead of blocking.

### Top-level reasons (no `repairs[]`)

| `reason`                       | Meaning                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing_install_state`        | `node_modules/.cache/hellyeah-tracker/install-state.json` not found                                                                                                                                                                                                                                                                                                        |
| `invalid_install_state_json`   | File exists but is not valid JSON (probably half-written)                                                                                                                                                                                                                                                                                                                  |
| `invalid_install_state_schema` | JSON parsed but failed schema validation. Includes: `version` not 3; unknown `kind`; empty `approvedFiles[]` / `discoveryReports[]`; placeholder `skipped[].reason` or `blocked[].reason`; empty `blocked[].searched`; `expectedEvents` or `proposedEvent` using wire-format `cv_X` instead of `cv.X`; `rationale` shorter than 40 chars; `evidence` shorter than 20 chars; `identityBridge` with an unknown `mechanism` or a `deferred` bridge missing its `justification` |
| `invalid_tracker_id`           | `--tracker-id` was supplied but is not a UUID                                                                                                                                                                                                                                                                                                                               |
| `invalid_tracker_override`     | `--confirm-tracker-override` was supplied but is not a UUID                                                                                                                                                                                                                                                                                                                |
| `tracker_override_mismatch`    | `--confirm-tracker-override` did not match `--tracker-id`                                                                                                                                                                                                                                                                                                                   |
| `tracker_ownership_unconfirmed` | A provided tracker id differs from `tracker state`, or the org has no tracker. Verify writes nothing until the caller explicitly re-runs with `--confirm-tracker-override`                                                                                                                                                                                                |
| `missing_cli`                  | The `hellyeah` executable could not be found                                                                                                                                                                                                                                                                                                                                |
| `cli_too_old`                  | The resolved Hellyeah CLI is older than the minimum version that supports `tracker state/create`; run `hellyeah update`                                                                                                                                                                                                                                                     |
| `tracker_provision_failed`     | The verify-time `hellyeah tracker state` or `tracker create` subprocess failed before returning a usable JSON envelope                                                                                                                                                                                                                                                       |
| `invalid_cli_json`             | The subprocess returned stdout that was not JSON                                                                                                                                                                                                                                                                                                                           |
| `invalid_cli_response`         | The subprocess JSON envelope did not contain a valid nested `data.tracker.trackerId` from state or flat `data.trackerId` from create                                                                                                                                                                                                                                       |

`approvedFiles` must be non-empty. An empty list verifies as success and
hides incomplete installs, so the schema rejects it up front. Same rule
for `discoveryReports[]` — the schema rejects state files that omit it.

## Idempotency

Rerunning `verify` against an already-clean install returns
`success: true, repairs: []`. It rewrites install-state and env files with
the same tracker id. Rerunning after fixing one repair reduces `repairs[]` by
exactly that repair, with the rest unchanged.

The agent fixes repairs with `Edit` and reruns until clean.

## Recovery

If a step fails after writing source:

| Failed at        | Do                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| SDK install      | Read `package.json` first; if `@hellyeah/x-ray` is present, skip — it succeeded                                                |
| Provider mount   | Read the layout file; if the SDK import + `<Analytics>` / `injectAnalytics()` is present, skip                                 |
| Singleton init   | Read the singleton file; if `createXRay(...)` exists with tracker id and `env:` env-driven, edit only what's missing |
| `install-state`  | Atomic write to `.tmp` then rename. If JSON parse fails, delete and re-author                                                  |
| `verify` repairs | Each repair has a stable `code`; address one at a time, rerun verify until `success: true`                                     |

Missing install-state means fresh install. Do not inspect or migrate
`./.hellyeah/config.json`; that path is no longer part of the contract.
