# Identity Bridge

The bridge links anonymous browser activity to known server conversions. A
server `cv.*` call keyed to a user id that no browser session shares ingests
fine and `verify` passes — but it never attributes to an ad click. That is the
single most common silent failure, so the skill enforces an invariant, not a
recipe.

## The invariant

> Every server `cv.*` call must carry a browser-side join key: a `distinctId`
> that a browser `identify()` also sends, or a `visitorId` captured from the
> browser.

Mechanisms below are just ways to satisfy this. Pick the default for the
observed auth-flow class; the escape hatches are named but are not a menu to
deliberate over.

## How attribution resolves (why order does not matter)

X-Ray resolves attribution at **query time** through a tiered COALESCE: a click
id on the conversion, then any prior event in the same session, then a session
sharing the conversion's `distinctId`, then one sharing its `visitorId` (90-day
window). Consequences for the install:

- Stitching is **order-independent**. A webhook conversion that lands before the
  browser `identify` still attributes once the identify arrives. Never contort
  code to win a webhook-vs-redirect race.
- Both `distinctId` and `visitorId` are live join keys today — no engine change
  is needed for any mechanism here.
- There is no email tier: email/`identity` feeds Enhanced Conversions postbacks,
  not click-id attribution. Email is a cross-device fallback, never the sole
  bridge.
- IP+UA backfill exists inside the engine but is heuristic — never instruct it
  as a mechanism.

## Classify the auth flow, then take the default

Read the auth and conversion code, match the observable trigger, take the
default. One default per class.

| Observed in code (trigger)                                                              | Class            | Default bridge                                                                                                   |
| --------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Credentials POST to the app's own backend                                               | own-form         | **server_cookie_persist**: read `hy_attr` in that handler, persist the `vid` on the user record                 |
| Auth SDK redirect + a client auth hook (Clerk `useUser`, Auth0 SPA, Supabase, etc.)     | hosted-redirect  | **browser_identify**: a post-auth identify watcher inside the auth provider; add **server_cookie_persist** in the OAuth callback when a webhook is the conversion authority |
| Conversion fires from a webhook (Stripe, Clerk)                                          | webhook-authority | **server_cookie_persist** lookup of the persisted `vid` by user id; else **visitor_id_passthrough** of a `vid` stuffed into the created artifact (Stripe `client_reference_id`/`metadata`, Clerk `unsafeMetadata`) |
| Magic link / email OTP                                                                  | link-flow        | **email_late_bind** (pre-send `{vid, email}` browser event) **+ visitor_id_passthrough** of `vid` in the link URL |
| No browser request at binding time and no instrumented return surface                    | blocked          | record it as `deferred` in install-state with a justification                                                   |

If the class is **hosted-redirect** or **webhook-authority**, read
[`hosted-auth-providers.md`](./hosted-auth-providers.md) for the verified
per-provider parameter-passing facts before wiring the bridge.

## The mechanisms

- **browser_identify** — a client component inside the auth provider fires
  `identify(userId, { email })` once per user id. The worktrial-verified
  pattern. Gives the `distinctId` tier.
- **server_cookie_persist** — the server reads `hy_attr` at the first-party
  touch (signup POST, OAuth callback, SAML ACS all carry the cookie) and
  persists the `vid` (e.g. `users.first_vid`); webhook conversions then attach
  `visitorId` by user lookup. Gives the `visitorId` tier. The most broadly
  reliable single mechanism — no client JS at conversion time.

  Until the SDK helper ships, parse the cookie inline (~5 lines):

  ```ts
  const vid = (cookieHeader ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("hy_attr="))
    ?.slice("hy_attr=".length);
  // attach as visitorId on the conversion (or persist on the user row)
  ```

- **visitor_id_passthrough** — the `vid` rides through the created artifact
  (Stripe `client_reference_id`/`metadata`, Clerk `unsafeMetadata`) and the
  conversion call passes it as `visitorId`. Use only when the conversion
  authority never sees a first-party request and a cookie persist has not
  happened (checkout-before-signup, cross-device links).
- **email_late_bind** — a browser-side `identify` carrying email plus a
  conversion that carries `identity.email`. Cross-device fallback that feeds
  postbacks, not click-id attribution — never the sole mechanism unless the
  flow is otherwise `deferred`.

Each mechanism becomes an `identityBridge` entry on the conversion finding in
install-state; `verify` checks the source marker. See
[`verification.md`](./verification.md#identity-bridge).

## Privacy: four shapes that break it

The matcher in `scripts/pii-redflags.mjs` flags four classes. The shapes
look different; the fix is always the same — lift email/phone into
`identity:`, leave the rest behind. The agent's reflex is to drop fields
into `metadata:` because the source already has them there. Resist that.

Pass email and phone **only** through SDK `identity` fields; the SDK hashes
them before persistence. Never put email or phone in metadata, logs, report
text, comments, or handoff examples.

| Class   | Shape                           | Trigger                                                    |
| ------- | ------------------------------- | ---------------------------------------------------------- |
| Literal | `metadata: { email, phone }`    | Direct `email:` / `phone:` keys                            |
| Aliased | `metadata: { contact: ... }`    | Keys `contact` / `customer` / `billingDetails` / `profile` |
| Spread  | `metadata: { ...customer }`     | Any `...x` inside `metadata`                               |
| Nested  | `metadata: { user: { email } }` | Any `{` opening a nested literal in `metadata`             |

For one repair example per class with the canonical fix, see
[`instrumentation-examples.md#anti-patterns`](./instrumentation-examples.md#anti-patterns)
(loaded at write-time, when the agent is composing a `cv.*` call).

## Roles

**One product = one tracker.** A tracker has surfaces; surfaces have roles;
roles dictate what gets installed.

| Role                                 | Browser mount?              | Server SDK? | Identity                                                                                                       |
| ------------------------------------ | --------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| **Entry surface** (where ads land)   | Yes — `<Analytics domains>` | No          | `identify()` on lead/signup forms here when applicable                                                         |
| **Conversion surface, browser-only** | No mount                    | No          | Route conversions through this surface's backend; cookies must span entry+conversion via parent-domain scoping |
| **App / dashboard frontend**         | No (default)                | No          | `browser_identify` watcher here when the conversion authority is a hosted-redirect webhook                     |
| **API / backend**                    | n/a                         | Yes         | Bridge browser identity via shared `distinctId`; explicit `distinctId` on every call                           |
| **Webhook receiver**                 | n/a                         | Yes         | `server_cookie_persist` lookup, or `visitor_id_passthrough` from the created artifact                          |
| **Worker / job**                     | n/a                         | Yes         | Bridge via job payload                                                                                         |

## Cross-domain bridge

When entry is `example.com` and conversion is `app.example.com` (shared parent
domain), SDK cookie scope must include the parent domain so the dashboard
reads what the entry surface set. Surface this requirement to the user
explicitly when entry ≠ conversion subdomain.

When entry and conversion live on **different parent domains** (landing on
`brand.com`, checkout on `brand.myshopify.com` or `pay.stripe.com`), cookie
sharing is impossible — `visitor_id_passthrough` through the redirect URL or
session token is the bridge, attached on the conversion side as `visitorId`.

## Architectures the role table doesn't cover

The role table handles single-entry / single-conversion-authority projects.
Four shapes that recur:

- **Multi-entry (franchise / per-region landing).** `brand.com` plus
  `locations.brand.com/<city>`, both receiving ad traffic. Both surfaces mount
  `<Analytics />` with the union of allowed hosts in `domains`. One tracker;
  multiple entry points.
- **Multi-authority conversions (marketplace).** Conversion events from HubSpot
  lead forms, Shopify checkout on `*.myshopify.com`, POS webhooks, and an
  internal API. Each authority is a separate server-SDK emitter with its own
  bridge from the table above. The role map becomes a list of authorities.
- **Embedded / iframe conversions.** Stripe Checkout in iframe, Calendly
  embedded. The conversion fires on the third party. Bridge via
  `visitor_id_passthrough` through the integration's redirect parameter or
  webhook metadata.
- **Multi-brand / multi-tenant in one repo.** One codebase serving several
  brands. Either one tracker per brand (`trackerId` resolved at runtime) or one
  tracker covering all (different `domains` allowlist). Ask the user — do not
  infer.

## Missing source side handoff

When frontend source is unavailable, assume it exists and document the frontend
contract the backend needs: browser provider mount, production `domains`,
`identify(stableId, { email, phone })` after auth/form completion, and any
CTA/form events that should precede the server conversion.

When backend source is unavailable, assume it exists and document the backend
contract the frontend needs: `@hellyeah/x-ray/server`, `trackImmediate(cv.*)`,
explicit `distinctId`, `identity: { email, phone }` when available,
value/currency fields when applicable, and the
`env: process.env.HELLYEAH_TRACKER_ENV` option at the singleton.
