# SDK Contract

Source of truth: https://github.com/finalroundai/xray-sdk
(`packages/sdk/src`). Always read the `.d.ts` files in
`node_modules/@hellyeah/x-ray/...` directly — package layouts vary across
package managers (pnpm hoisted/isolated, yarn classic/PnP, bun, npm flat),
so locate the types by search rather than by hardcoded path.

## How to find the types at runtime

```bash
# From the project root, find the types:
find . -path '*/node_modules/@hellyeah/x-ray/**/*.d.ts' -not -path '*/.git/*'
```

Or use your tool's native search to glob `**/@hellyeah/x-ray/**/*.d.ts`.

The four types you need before writing any tracker code:

- `TrackData` — closed shape of `track()` / `trackImmediate()` payload
- `XRayOptions` — second argument to `createXRay(websiteId, options)`
- `Attribution` — session-scoped click IDs (UTM, gclid, fbclid, etc.)
- `IdentifyParams` — second argument to `identify(distinctId, params)`

## Valid imports

| Import                   | Use                                                                     |
| ------------------------ | ----------------------------------------------------------------------- |
| `@hellyeah/x-ray`        | Browser `inject`, `track`, `identify`, `pageview`, cookie helpers, `cv` |
| `@hellyeah/x-ray/react`  | React `<Analytics>` plus browser re-exports                             |
| `@hellyeah/x-ray/next`   | Next `<Analytics>` plus browser re-exports                              |
| `@hellyeah/x-ray/remix`  | Remix `<Analytics>` plus browser re-exports                             |
| `@hellyeah/x-ray/vue`    | Vue `<Analytics>` plus browser re-exports                               |
| `@hellyeah/x-ray/svelte` | `injectAnalytics(props)` plus browser re-exports                        |
| `@hellyeah/x-ray/nuxt`   | Nuxt `<Analytics>`, `injectAnalytics(props)`, browser re-exports        |
| `@hellyeah/x-ray/astro`  | `inject` plus browser re-exports                                        |
| `@hellyeah/x-ray/server` | `XRay`, `createXRay`, `cv`, server types                                |

There is no SvelteKit-specific SDK subpath. Use `@hellyeah/x-ray/svelte` for
both Svelte and SvelteKit.

## Conversion events

Import `cv` from `@hellyeah/x-ray` (browser) or `@hellyeah/x-ray/server`
(server). The validated event names and what each one means live in
[`conversion-discovery.md`](./conversion-discovery.md#signal-contract).

## `TrackData` (closed shape — extra keys are compile errors)

```ts
type TrackData = {
  distinctId?: string;
  revenue?: number;
  currency?: string;
  metadata?: Record<string, string | number | boolean | null>;
  tag?: string;
  url?: string;
  hostname?: string;
  identity?: { email?: string; phone?: string };
  visitorId?: string;
};
```

When sending email or phone from server code, put them under
`identity: { email, phone }` and pass an explicit `distinctId` on the same
`track()` or `trackImmediate()` call. Do not rely on server
`tracker.identify()` in webhooks or request handlers; it is process-local
default state and races across concurrent requests.

Provider-specific fields (`order_id`, `payment_status`, `session_id`,
`plan`, `subscription_id`, `line_items`) go under `metadata` as scalars.
`metadata` accepts `string | number | boolean | null` only. Flatten or
stringify objects/arrays before passing them.

## `XRayOptions` — second argument to `createXRay`

```ts
type XRayOptions = {
  env?: string;
  context?: Attribution;
  waitUntil?: (promise: Promise<unknown>) => void;
  // … (additional fields exist; check the .d.ts for current surface)
};
```

The three options you almost always care about:

- **`env`** — tracker environment tag attached to events. Drive it from
  `process.env.HELLYEAH_TRACKER_ENV`. The SDK always sends; X-Ray uses this tag
  to segment production from local, staging, and preview traffic at query time.
- **`context`** — session-scoped attribution data (UTM params, click IDs).
  Set at SDK init, attaches to every event in the session. **Never** put
  click IDs in event `metadata`.
- **`waitUntil`** — for serverless platforms (Vercel, Cloudflare Workers)
  where you need the runtime to keep the function alive until the event
  flush completes. Pass `event.waitUntil` from the platform's request
  handler.

## `Attribution` — session-scoped click IDs

```ts
type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string; // Google Ads
  fbclid?: string; // Facebook/Meta
  msclkid?: string; // Microsoft Ads
  ttclid?: string; // TikTok
  li_fat_id?: string; // LinkedIn
  twclid?: string; // Twitter/X
  gbraid?: string; // Google enhanced (web)
  wbraid?: string; // Google enhanced (app)
};
```

Browser provider mounts read these from the URL automatically and store
them in a session cookie. Server-only setups must extract the values from
the original request and pass them through `XRayOptions.context` at SDK
init for that request scope.

## `trackImmediate` vs `track`

Use `trackImmediate` in serverless, edge, webhook, and route-handler code
because the process may exit before the next batch flush. Long-running
servers can use `track`.

## `IdentifyParams`

`IdentifyParams` carries `email?` and `phone?` (plus additional fields —
read the `.d.ts`). Browser `identify(stableId, params)` is request-scoped
(sets a cookie). Server `identify(stableId, params)` is process-local —
it sets default state for the next batched call, which races across
concurrent requests. **Do not call server `identify()` in webhooks or
route handlers.** Pass `distinctId` and `identity` explicitly per call.

## `websiteId` vs `trackerId`

The schema field is `websiteId`. The CLI surfaces it as `trackerId` for users.
SDK `createXRay()` and browser `<Analytics websiteId={...} />` still use the
prop name `websiteId` because that is the SDK API. The value is the tracker
UUID from `HELLYEAH_TRACKER_ID` / `NEXT_PUBLIC_HELLYEAH_TRACKER_ID`.

The skill no longer reads or writes `./.hellyeah/config.json`. Anywhere you
write source code, pass the env var value into the SDK `websiteId` parameter.
Anywhere you talk to the user or parse CLI output, call the same UUID
"tracker id."

Use these names consistently:

| Name | Where it appears | Purpose |
| --- | --- | --- |
| `HELLYEAH_TRACKER_ID` | `.env*`, optional caller-provided verify input | Private runtime id for server code; not a shell authority |
| `NEXT_PUBLIC_HELLYEAH_TRACKER_ID` | Next.js browser/server source and `.env*` | Public SDK id shipped to browser bundles |
| `websiteId` | SDK option/property name | Existing SDK API parameter for the same UUID |
| `trackerId` | CLI JSON envelopes and install-state field | User-facing name for the same UUID |
