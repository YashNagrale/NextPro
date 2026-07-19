# Conversion Discovery

This is the meaning reference for authoring `discoveryReports[]`. It
defines the **signal contract** for each `cv.*` event (what behavior
the event represents, library-neutral) and the **discovery procedure**
for locating that behavior in the user's installed source.

The script does no content matching. You read source from the root's
`sourceFiles[]` inventory and from the user's `node_modules/<lib>`
type declarations, then decide what's a conversion. This doc tells
you _what counts_ and _how to prove it from source_.

This procedure runs inside an Explore sub-agent during step 2. The main
agent uses the returned evidence while authoring step 7; it does not re-run
the full procedure.

## How to author a discoveryReport

For each root from `prepare`'s `roots[]`, open enough files from
`sourceFiles[]` to form an opinion (record every file in `filesRead`),
then commit each path to one of three lists:

- **`findings[]`** — sites you'll instrument. Run the [Discovery
  Procedure](#discovery-procedure) for each, then write `{ site, kind,
proposedEvent, rationale, evidence }`. See [Writing rationale and
  evidence](#writing-rationale-and-evidence).
- **`skipped[]`** — sites you considered and rejected. Site must exist;
  reason must be specific enough for a reviewer to audit.
- **`blocked[]`** — sites that look plausible but can't be proven from
  source. Strictly preferred over guessing. See [The blocked[]
  artifact](#the-blocked-artifact).

The full schema and field rules are in
[`verification.md`](./verification.md#install-statejson-schema). The
top-level rule: every cited path resolves on disk, every claim grounds
out somewhere a reviewer can open.

### Completeness is the job, not coverage of one safe event

Decide this _here_, at the findings point — not after you have already
settled on one event and are looking for reasons to stop. The most
expensive failure mode this skill has seen is not a wrong event; it is a
**correct event installed alone** while real funnel stages sat in
`skipped[]` with eloquent reasons ("the purchase event is enough", "one
safe real conversion", "adding more would broaden the install"). Those
reasons read like judgment but they are the failure.

Why one event is not enough: **ad platforms optimize on the whole
funnel.** The optimizer learns from view → cart → checkout → purchase as
a sequence. A purchase-only install gives it the rarest, latest signal
and nothing upstream to find lookalikes from, so it underperforms a
full-funnel install on the exact metric the user is paying for. Each
funnel stage you skip is signal lost — that cost outweighs the instinct
to "ship one safe event and stop." Completeness here means **accounting
for every plausible stage** (instrument it, or write an audit-grade skip
that a reviewer would actually agree with), not instrumenting the single
most defensible site.

A skip is legitimate when the stage genuinely does not exist or genuinely
does not qualify (see [Writing good `skipped[]`
reasons](#writing-good-skipped-reasons)). A skip is _not_ legitimate when
the stage exists, you found it, and you passed it over to keep the
install small. `verify` hard-rejects the specific lazy phrasings; but the
rule is broader than the string match — do not skip a real stage for
scope reasons.

#### Storefront funnel ledger

When a root declares commerce dependencies (a payment SDK, a cart/store
framework, a checkout library — read `roots[].dependencies`, never grep
example text), your report must **account for each** of these stages —
captured in `findings[]`, or explicitly reasoned in `skipped[]` /
`blocked[]`:

- product / content view (`cv.viewContent`)
- add-to-cart (`cv.addToCart`)
- begin-checkout (`cv.beginCheckout`) — note this is **not** payment
  completion; it is the client navigation into checkout, distinct from
  the server-confirmed `cv.purchase` webhook
- purchase authority (`cv.purchase`, the server/webhook site)
- newsletter / custom subscription (a custom event — see below; **not**
  `cv.leadSubmit`)
- identity bridge across the surfaces (so cart-side and webhook-side
  events attribute to the same visitor)

"Account for each" is not "instrument each" — a store with no newsletter
has nothing to capture there, and you say so. The point is that each
stage gets a _conscious decision_ in the report, so a reviewer can see
you considered the whole funnel rather than stopping at the first safe
event.

#### Newsletter is a custom event, never `cv.leadSubmit`

A newsletter / mailing-list subscribe is product engagement, not a sales
lead handed to a sales team. Emit a custom event (`newsletter_subscribed`
or the source's own vocabulary), not `cv.leadSubmit`. `cv.leadSubmit` is
a prospect surfacing contact info so **sales** can follow up; a marketing
email opt-in is a different motion and overloading the catalog event
pollutes the ad model. See
[`instrumentation-examples.md`](./instrumentation-examples.md#template-2--server-webhook-without-revenue)
for a worked `newsletter_subscribed` example.

#### Custom activation events are required consideration, not optional extras

For AI / chat / productivity / workspace products, the catalog `cv.*`
events frequently miss the actual conversion: the moment the user gets
value. Decide on activation events **before** you settle your findings
opinion, not after — durable first chat, first message persisted, first
prompt run, workspace created, onboarding completed. These are the
signals that predict retention and paid conversion for these products, so
treat them as a required consideration for the root, the same way you
treat `cv.purchase` for a store. Read the source for the persisted
milestone, prove the call site, cite source — the
[Discovery Procedure](#discovery-procedure) is identical to `cv.*`.

## Writing rationale and evidence

`rationale` and `evidence` turn `findings[]` from "the agent points at a
file" into "the agent points at a file and explains, with quoted source,
why this site emits this event."

### Rationale

One or two sentences in this shape:

> The catalog says `<event>` means `<catalog meaning in your words>`.
> This site does `<what the code actually does>`. They match because
> `<connector — usually who the user is and what they just did>`.

Examples that hold up:

- "The catalog says `cv.purchase` is a completed paid transaction.
  This site fires when the payment provider's webhook confirms a
  one-time charge succeeded; the payload carries `customer_email` for
  postback identity. They match because this is the moment ad
  platforms optimize toward."
- "No catalog event covers this; `cv.leadSubmit` would be wrong
  because the actor is already a customer, not a prospect.
  `team_invited` is a network-effect signal worth tracking. The
  endpoint runs only when an authenticated user invites a
  non-member."

What fails review:

- **Catalog-only** — "cv.purchase fires on completed payment." No
  engagement with the site.
- **Site-only** — "Server action that creates a session record." No
  link to the event. This is the failure that overloaded one install:
  a "session" was assumed to map to `cv.startTrial` because the
  variable was named `trial`, with no rationale linking the catalog
  meaning ("free SaaS trial") to the site meaning ("candidate
  assessment").

If you can't write the catalog meaning and the site meaning side by
side and have them match, the event is wrong — switch to a custom
event, or move the site to `skipped[]` / `blocked[]`.

### Evidence

A literal source quote from the file at `site`. `verify` substring-
checks each non-blank line — paraphrased blocks fail. Multi-line is
encouraged (`\n` in JSON). Quote the call site itself if it exists, or
the handler where the call _will_ live. Don't quote a single common
token (`}` matches every file); the 20-char minimum is a floor.

## Signal Contract

The `cv.*` catalog is intentionally narrow — these events postback to
ad platforms and need stable cross-library names. Each entry defines
what behavior the event represents in **library-neutral** terms, plus
the adjacent moments that must be distinguished from it. On the wire
these render as `snake_case` (`cv_purchase`, `cv_lead_submit`, etc.).
Always use the dotted form in code; `verify` rejects wire-format
strings in `expectedEvents` and `proposedEvent`.

| Event                                                                        | Signal                                                                                                                     | Distinguish from                                                                                                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `cv.purchase`                                                                | One-time payment confirmed on the server — money has moved, order is durable.                                              | Checkout opened, payment-pending, recurring subscription charge.                                                                |
| `cv.subscribe`                                                               | Recurring-billing subscription created with a charged or about-to-charge state.                                            | `cv.startTrial` (deferred billing), `cv.purchase` (one-time), subscription updates.                                             |
| `cv.startTrial`                                                              | Free trial subscription starts — billing window opens without a charge today.                                              | A "trial" of a free feature in product vocabulary (use a custom event); `cv.subscribe` (no trial window); trial-end conversion. |
| `cv.registrationComplete`                                                    | A new user record is first persisted — a durable account exists where it did not before.                                   | Sign-in, OAuth callback, session creation, JWT mint, email verification.                                                        |
| `cv.leadSubmit` / `cv.contact`                                               | Prospect hands over contact info so sales can follow up. `leadSubmit` for marketing intent; `contact` for general support. | Logged-in customer support ticket, newsletter subscribe, client-only validation success.                                        |
| `cv.bookAppointment`                                                         | Calendar booking durably persisted — the appointment exists on both calendars.                                             | Calendar render, date selected, tentative draft, cancelled / rescheduled.                                                       |
| `cv.submitApplication`                                                       | Structured application submitted (job, school, financial-services). Higher intent than `leadSubmit`.                       | Application started / draft saved; downstream review or acceptance.                                                             |
| `cv.viewContent` / `cv.addToCart` / `cv.beginCheckout` / `cv.addPaymentInfo` | Browser-side engagement along the purchase funnel — page mount, click handler, checkout-start, payment-info submitted.     | `cv.purchase` (server-confirmed payment fires from the webhook, not the client navigation that follows).                        |
| `cv.search`                                                                  | User submits a search query — fires on the question, not on the results render.                                            | Filter / sort changes, auto-suggest interaction.                                                                                |

## Required and optional fields per event

Required fields must be present for the event to be usable downstream by
ad platforms; optional fields improve match quality.

| Event                             | Required                                                            | Optional                                                         |
| --------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `cv.purchase`                     | `distinctId`, `revenue` (major units), `currency`, `identity.email` | `identity.phone`, `metadata.order_id`, `metadata.payment_status` |
| `cv.subscribe`                    | `distinctId`, `revenue`, `currency`, `identity.email`               | `metadata.subscription_id`, `metadata.plan`, `metadata.interval` |
| `cv.startTrial`                   | `distinctId`, `identity.email`                                      | `metadata.plan`                                                  |
| `cv.leadSubmit`                   | `distinctId` (email or phone), `identity.email`                     | `identity.phone`, `metadata.form_id`, `metadata.company`         |
| `cv.registrationComplete`         | `distinctId` (new user ID), `identity.email`                        | `metadata.signup_method`                                         |
| `cv.bookAppointment`              | `distinctId`, `identity.email`                                      | `metadata.event_uri`, `metadata.scheduled_at`                    |
| `cv.viewContent` / `cv.addToCart` | `metadata.product_id` (for product-level)                           | `metadata.category`                                              |
| `cv.beginCheckout`                | `revenue`, `currency` (when cart total is known)                    | `metadata.product_id`, `metadata.category`                       |

For browser engagement events, `distinctId` is optional — the SDK
attaches the visitor cookie automatically. Pass it explicitly only after
`identify()` in the same session. `revenue` is in major units (divide by
100 if the provider ships cents); `currency` is a three-letter ISO code.

## Discovery Procedure

The catalog above tells you what each event represents in
library-neutral terms. This procedure tells you how to find the
exact integration surface in the user's installed source. Run it
every install, for every conversion site.

The mistake this procedure prevents: memorizing a library's API name
("Better Auth uses `onSignUp`") and grepping for it. Library APIs
change, names vary between versions, and a remembered name that is
wrong looks confidently correct in chat — and silently misses the
real conversion surface. The procedure forces you to read the
library's installed types instead.

### The five steps

For each conversion behavior the signal contract defines:

**Step 1 — Identify the owning library.** Read `package.json`
`dependencies`. Which dependency owns the concern this signal
describes? (Auth library for `cv.registrationComplete`, payment
provider SDK for `cv.purchase`, calendar SDK for `cv.bookAppointment`,
form-handler library or the user's own route for `cv.leadSubmit`.) If
no library owns the concern — the user's app handles it directly —
skip to step 4.

**Step 2 — Read the library's installed types.** Find the library's
`.d.ts` files in `node_modules` (path varies by package manager —
pnpm hoisted, pnpm isolated, npm flat, yarn classic, yarn-PnP, bun
all differ). Use `Read`/`Grep` against
`**/node_modules/<library>/**/*.d.ts`. Read the public-API surface
the user imports. Form a model of the library's lifecycle. Find the
integration surface (callback, hook, event, server-side handler,
middleware) that fires _only_ at the signal moment. Many libraries
expose multiple surfaces near the right moment — for
`cv.registrationComplete`, an auth library typically has a
sign-in-success hook AND a user-create hook AND a session-create
hook. Only one fires _only_ at the signal moment.

**Step 3 — If no in-process hook exists, find the webhook
receiver.** Some libraries (hosted checkout, hosted calendar
booking, third-party form embeds) deliver events out-of-process via
webhook. The conversion site is the user's own webhook-receiver
file in source — search for the provider's signature-verification
function or the route the provider documents.

**Step 4 — If neither library hook nor webhook exists, the
conversion site is the user's own code.** A custom signup route, a
hand-rolled lead form handler, a server action. Identify the line
where the durable resource (user, lead, booking) is first persisted.

**Step 5 — Prove the candidate fires _only_ at the signal moment.**
Cite source. For an in-process hook, the type declaration plus the
configured callsite. For a webhook receiver, the signature-verify
call plus the dispatch on event type. For app-owned code, the
persistence call (`db.user.create(...)` or equivalent).

If you cannot prove it, do not guess. Emit a `blocked[]` artifact
(see below) describing what you searched and why the candidate is
uncertain. A wrong guess is worse than a `blocked[]` — it
instruments the wrong moment, looks correct to `verify`, and
silently corrupts the conversion stream.

### Behavioral fingerprints

Each event has a behavioral fingerprint that translates the signal
contract into "what to look for in types." Library APIs vary; the
fingerprint does not.

| Event class                                            | Fingerprint to look for in types                                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cv.registrationComplete`                              | A lifecycle hook that fires once per new user record being persisted — distinct from session-creation, sign-in-success, OAuth-callback, or email-verification hooks. Often nested under a database/persistence callback group. |
| `cv.purchase`                                          | A webhook event type or callback that fires after payment is confirmed (not when checkout opens or a payment intent is created). Shape clue: the payload carries an amount-paid field and a receipt/order ID.                  |
| `cv.subscribe` / `cv.startTrial`                       | A subscription lifecycle event for the create moment specifically; distinguish trial-window-open from immediate-charge by reading whether the type carries a trial-end / trial-period field.                                   |
| `cv.bookAppointment`                                   | A booking-created webhook or callback; distinguish from booking-rescheduled / booking-cancelled (separate event types in most calendar providers).                                                                             |
| `cv.leadSubmit` / `cv.contact`                         | The user's own route handler or server action that validates form input and either persists a lead record or forwards to a CRM. Often an in-app concern with no library to consult.                                            |
| `cv.submitApplication`                                 | The user's own route handler that persists a structured application record. Look for keywords matching the product domain (`apply`, `application`, `submit`).                                                                  |
| `cv.viewContent` / `cv.addToCart` / `cv.beginCheckout` | Browser-side; the conversion site is a `useEffect` (view) or a click handler (action) inside the user's frontend code. No library lifecycle to consult.                                                                        |
| `cv.search`                                            | A search-submission handler; the conversion is on the user's submit, not on the results render.                                                                                                                                |

Read the type declarations, then map them onto the fingerprint. If
the fingerprint matches and the type's docstring confirms the
trigger condition, you have your candidate. If the fingerprint
matches but the trigger condition is ambiguous (a generic callback
that "may fire on user events"), that is a `blocked[]` candidate —
not a finding.

## The blocked[] artifact

`blocked[]` is the structured output of step 5 when proof fails. The
schema lives in
[`verification.md`](./verification.md#install-statejson-schema); this
section is when to emit it and how to write it.

Emit `blocked[]` when:

- The library exposes plausible candidates but typed contracts don't
  narrow to "fires only at the signal moment."
- The package ships untyped JS and a guess from generic names is
  worse than no instrumentation.
- An external webhook would deliver the event but the codebase has no
  receiver yet (no site exists to instrument).

`searched` must list specific file paths (`.d.ts`, not package dirs),
grep queries you ran, or type names you traced. Vague entries
("checked the docs") fail `verify`. `reason` names which candidate
looked plausible, what the source did not confirm, and which adjacent
moment a guess would fire on by mistake.

A `blocked[]` entry is the right answer when proof bottoms out. A
wrong guess looks identical to a correct finding in `install-state`
but fires the wrong moment in production.

## Custom events

The catalog is narrow. Most products have meaningful milestones it
doesn't cover — activation moments (first project created, first
deploy, first message sent), engagement upgrades (free → paid,
viewer → contributor), network effects (invitations, shares,
referrals), product-specific outcomes (recipe saved, workout
completed, deploy finished).

Custom events name the product's actual outcomes. Read source for
the verbs the codebase uses — if the codebase calls them
"workspaces" emit `workspace_created`, not `team_created`. Match
the source vocabulary. The discovery procedure is the same: read
where the milestone is persisted, prove the call site fires only at
the signal moment, cite source.

### Naming

- `snake_case`. The `cv_` prefix is reserved for the catalog (`cv.*`
  constants render as `cv_purchase` on the wire); custom events
  must not use it.
- Verb-phrase past tense: `project_created`, not `create_project` or
  `creating_project`. Past tense matches the moment the event fires.
- Specific over generic: `team_invited` beats `invitation_sent`
  (which invitation? to what?).
- Match the source vocabulary, as above.

### Required fields for custom events

Same rules as `cv.*`: `distinctId` for identity, `identity: { email,
phone }` when PII is involved, `metadata` for scalar context. See
[Required and optional fields per event](#required-and-optional-fields-per-event).
Even though custom events don't postback, the SDK still hashes identity
and rejects non-scalar metadata.

## Worked trap example: registration vs. sign-in

The procedure applied to `@example/auth` (illustrative names) for
`cv.registrationComplete`. Reading
`node_modules/@example/auth/dist/types/index.d.ts` finds five plausible
surfaces. Step 5 eliminates by trigger semantics:

- `callbacks.signIn` — every sign-in. Wrong.
- `callbacks.session` — every session check. Massively wrong.
- `callbacks.jwt` — JWT mint and refresh. Wrong.
- `events.signIn` with `isNewUser: true` — fires after sign-in, can
  race ahead of the user-create. Close, not exact.
- `events.createUser` — "fired once, when a new user is added to the
  database." Matches.

Candidate: `events.createUser`. Evidence: the type declaration plus
the user's configured callsite (`src/auth/config.ts`).

**Trap demonstrated.** Grepping for `signIn` lands on
`callbacks.signIn` — a hurried agent calls it "the signup hook." It
fires on every sign-in. Step 5 beat the trap by demanding proof of
"only at the signal moment," which forced reading the docstring.

**When proof fails — `blocked[]`.** Same library shipping untyped JS:
two undocumented callbacks (`onAuth`, `onUser`) with no narrowed
trigger semantics. Emit:

```json
{
  "site": "src/auth/config.ts",
  "searched": [
    "node_modules/@example/auth/dist/index.js",
    "grep -r 'onUser\\|onAuth' node_modules/@example/auth/"
  ],
  "reason": "Untyped JS. onUser could fire on every user load, not only on creation — instrumenting it would emit cv.registrationComplete on every sign-in. Needs maintainer-confirmed semantics."
}
```

## Auth lifecycle: worked examples of reading the installed types

These are worked applications of the [Discovery
Procedure](#discovery-procedure) for `cv.registrationComplete` across
common auth libraries — **not** an API-name lookup table. Do not grep for
the function names below; they vary by version and rename across
releases. Read the library's installed `.d.ts`, find the surface that
fires _only_ when a new user record is first persisted, and prove it.
The names here are signposts for what the type surface tends to look
like, so you know you have found the right one.

- **Auth.js / NextAuth.** The lifecycle hook that fires once per new user
  is typically `events.createUser` — distinct from `events.signIn`
  (every sign-in) and `callbacks.session` (every session check). For an
  OAuth/SSO-first app where the first sign-in _is_ the registration,
  `events.signIn` carries an `isNewUser` flag; the create-user moment is
  still the precise site, but if the app only exposes the sign-in event,
  branch on first-user (`isNewUser === true`) and prove it from the type.
- **Supabase.** Distinguish `auth.signUp` (account row created) from
  onboarding completion (a separate app-owned step where the profile /
  workspace is finalized). `cv.registrationComplete` is the account-create
  moment; an "onboarding complete" milestone, if the product has one, is a
  separate custom event — do not collapse the two.
- **Clerk.** Clerk's hosted `<SignUp>` UI renders inside the app but the
  user record is created on Clerk's servers. There is **no in-process hook
  to instrument** unless the app has wired a Clerk webhook
  (`user.created`) or a server-side lifecycle hook. If no such receiver
  exists in source, the correct output is a **`skipped[]` (or
  `blocked[]`)** entry explaining that registration happens out-of-process
  with no app-side site — **not** a false capture bolted onto a button
  click or a page mount. Render-only hosted auth with no app hook is a
  legitimate skip; precedent and next-js-boilerplate are real repos where
  this is the right call.

The negative case matters as much as the positive one: instrumenting a
hosted-UI mount as if it were a registration emits
`cv.registrationComplete` on every page render, which is worse than no
event. When the real site is out-of-process and the app has no receiver,
skip it honestly.

## Writing good `skipped[]` reasons

A `skipped[]` entry says "I considered this site/path and chose not
to instrument." The reviewer's question is "do I agree?" The reason
should be specific enough to answer that.

Patterns that hold up:

- Concrete role: "Internal admin panel; the only users are staff and
  we do not run paid acquisition for staff."
- Cross-repo handoff: "Conversions for this surface live in the
  billing service repo (separate codebase); this API only emits
  operational events."
- Out-of-scope architecture: "Static marketing landing; checkout
  flows through Shopify on `*.myshopify.com` (different parent
  domain). Cookie sharing is impossible; the entry-side identity
  bridge would need a redirect parameter that this surface does not
  currently inject."
- Non-conversion subsystem: "Background sync worker; processes data
  after conversions are recorded by other services and does not emit
  acquisition signals."
- Documentation: "MDX content site; no acquisition forms or backend
  routes."
- Mobile-only conversion: "Native iOS/Android tracking lives in the
  mobile SDK; the web SDK installed here cannot reach those events."

Patterns that fail (validator rejects placeholder strings, but a
reviewer would also flag these):

- `"none"`, `"skip"`, `"n/a"`, `"todo"`, `"tbd"`, `"no conversions"`
  — rejected as placeholders.
- "Pure documentation" without specifying what kind — too generic;
  if it's an MDX site, say so; if it's an OpenAPI spec render, say
  that.
- "No conversion sites" — this is a claim, not a reason. Cite the
  files you read in `filesRead` and explain what was there instead.
- Reasons that don't connect to a specific path. If you're skipping
  `src/admin/`, say what's in `src/admin/`, not generic claims about
  internal tools.

A `skipped[]` reason that fits the legitimate-pattern shape gives a
reviewer everything they need: which path, what's in it, why it
doesn't qualify. A reason that doesn't fit triggers a follow-up —
and that's the right outcome.

## When `findings[]` should be empty vs. aggressive

**Empty is legitimate** for utility/types packages, internal
admin/staff dashboards, docs/marketing static sites whose CTAs
redirect to a different surface, and workers that process
already-converted data. `skipped[]` must still cover the specific
paths you considered — empty `findings[]` and empty `skipped[]`
together is vacuous and `verify` rejects it.

**Empty is suspicious** when the root has backend code, payment
deps, auth deps, or form handlers. Common misses: payment-provider
webhook is inline in another route; auth library is configured but
the create-user hook is not wired (the job is to wire it in, not
find an existing call); forms post directly to a third party
(instrument the `onSubmit` with `trackImmediate`); background jobs
named `processOrder` / `syncBilling` emit downstream conversions.
Re-run the procedure for each plausible signal; if proof bottoms
out, emit `blocked[]`, not a guess.
