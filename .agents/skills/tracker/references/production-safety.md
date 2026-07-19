# Production Safety

The SDK always sends events, regardless of environment. Production and
staging traffic do not contaminate each other on the client — each event is
tagged with `env`, and X-Ray excludes non-production traffic server-side at
query time. So there is no client-side gate to wire; the requirement is that
every event carries an accurate `env` tag.

## Browser tracking

Always pass exact production hostnames to the SDK `domains` prop —
lowercase, no protocol, no path, no port, no query string, no wildcards,
no localhost, no IPs. The browser SDK only fires events when the current
page hostname matches the allowlist; a missing or misspelled hostname
turns the install into a silent no-op.

## Server tracking — the singleton pattern

Initialize the server SDK exactly once per server-side codebase. Pass `env`
so every event is tagged with its environment; do not gate individual
`track()` calls.

```ts
// apps/api/src/lib/tracker.ts
import { createXRay } from "@hellyeah/x-ray/server";

export const tracker = createXRay(process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ID, {
  env: process.env.HELLYEAH_TRACKER_ENV,
});
```

Why this shape:

- The SDK sends every event regardless of environment, so there is no
  per-site flag to remember. The `env` tag is what keeps prod, staging, and
  preview traffic distinguishable; X-Ray excludes non-production server-side.
- Adding new conversion events later just works — the new event inherits the
  singleton's `env` tag automatically.
- `verify` enforces the shape: the first arg must read the tracker-id env var
  directly, and `env:` must read `HELLYEAH_TRACKER_ENV`. Hardcoded ids and
  extracted options produce stable repair codes.

### `.env` setup

`verify` writes `HELLYEAH_TRACKER_ID` and
`NEXT_PUBLIC_HELLYEAH_TRACKER_ID` to `.env.example` and `.env.local` through
`scripts/env-state.mjs`. It inserts `HELLYEAH_TRACKER_ENV=local` and
`NEXT_PUBLIC_HELLYEAH_TRACKER_ENV=local` only when those keys are absent; an
existing `prod`, `staging`, or `preview` value is preserved.

Local files must not default to `prod`. Set `HELLYEAH_TRACKER_ENV=prod` and
the matching public env var only in production deployment settings. Set
`staging`, `preview`, or another non-prod value in non-production deploys so
X-Ray can segment that traffic. Do not infer the environment from `NODE_ENV`
alone; that variable is set in too many places.

### CLI-created tracker data collection

`hellyeah tracker create` enables autocapture, Web Vitals, raw IP storage, and
raw user-agent storage. IP and user agent are used for postback enhanced
matching and are stored on every event for trackers created through this CLI
path. Document that collection in user-facing setup notes when privacy review
matters.

### Anti-pattern: per-call gating

Wrapping calls in environment checks is wrong — the SDK already always sends,
and X-Ray filters by `env` server-side. Per-call gating just silently drops
events you would otherwise be able to segment.

```ts
if (process.env.NODE_ENV === "production") {
  await tracker.trackImmediate(cv.purchase, payload);
}
```

`verify` checks the singleton init, not call sites. If the singleton is
correct, every call site is correct by construction.
