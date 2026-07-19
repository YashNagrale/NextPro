# Framework Adapters

Detect config files first and package dependencies second. In monorepos, prefer
a `package.json` colocated with a framework config over the nearest package
file alone.

| Framework                | Config hints                                                    | SDK API                                                   | Mount target               |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------------------- | -------------------------- |
| Next App Router          | `next.config.*`, `app/layout.*` or `src/app/layout.*`           | `@hellyeah/x-ray/next` `<Analytics>`                      | root layout body           |
| Next Pages Router        | `next.config.*`, `pages/_app.*` or `src/pages/_app.*`           | `@hellyeah/x-ray/next` `<Analytics>`                      | custom App component       |
| React/Vite/CRA           | `vite.config.*`, `react-scripts`, React deps without Next/Remix | `@hellyeah/x-ray/react` `<Analytics>`                     | app root component         |
| Remix                    | `remix.config.*`, `@remix-run/react`                            | `@hellyeah/x-ray/remix` `<Analytics>`                     | `app/root.*` body          |
| Vue                      | `vite.config.*`, Vue deps without Nuxt                          | `@hellyeah/x-ray/vue` `<Analytics>`                       | `src/App.vue`              |
| Nuxt                     | `nuxt.config.*`, `nuxt` dep                                     | `@hellyeah/x-ray/nuxt` `<Analytics>` or `injectAnalytics` | `app.vue`                  |
| Svelte/SvelteKit         | `svelte.config.*`, Svelte deps                                  | `@hellyeah/x-ray/svelte` `injectAnalytics`                | root layout `onMount`      |
| Astro                    | `astro.config.*`, `astro` dep                                   | `@hellyeah/x-ray/astro` `inject`                          | layout client script       |
| Static HTML / no bundler | no `package.json`, `.html` entry, static-site generator         | hosted `script.js` (no npm)                               | `<script>` tag in `<head>` |

There is **no SvelteKit-specific subpath**. Use `@hellyeah/x-ray/svelte` for
both Svelte and SvelteKit. Astro and Svelte do not export an `<Analytics>`
component despite generic SDK patterns suggesting one — Svelte uses
`injectAnalytics(props)` and Astro uses `inject(...)`.

## Generator and template-variant coverage

Some repos are generators or scaffolders: a single command emits one of
several template variants (e.g. a `selectBoilerplate.ts` that picks
among App Router / Pages Router / Vite outputs, or a CLI that copies a
chosen template directory). The conversion surface is not one fixed file
— it is whichever variant the generator can emit.

When a root selects among template output variants, **instrument every
selectable entry variant**, or record an explicit `skipped[]` /
`blocked[]` rationale for the variants you are not covering and why. Do
not instrument only the default variant and leave the others silently
untracked — a user who selects a non-default template gets a measurement
gap that looks identical to a clean install in `verify`. Read the
selection logic (the file that maps a choice to an output path) to
enumerate the variants before deciding.

## Public env-var names

`scripts/env-state.mjs` writes the Next.js-compatible key because the current
manual smoke target is a Next.js app. For non-Next frameworks, use the
framework-required public prefix in source and make the matching deployment env
available outside the agent.

| Framework             | Public tracker keys                                                   |
| --------------------- | --------------------------------------------------------------------- |
| Next.js               | `NEXT_PUBLIC_HELLYEAH_TRACKER_ID`, `NEXT_PUBLIC_HELLYEAH_TRACKER_ENV` |
| Vite React/Vue/Svelte | `VITE_TRACKER_ID`, `VITE_TRACKER_ENV`                                 |
| Nuxt                  | `NUXT_PUBLIC_TRACKER_ID`, `NUXT_PUBLIC_TRACKER_ENV`                   |
| SvelteKit             | `PUBLIC_TRACKER_ID`, `PUBLIC_TRACKER_ENV`                             |
| Astro                 | `PUBLIC_TRACKER_ID`, `PUBLIC_TRACKER_ENV`                             |
| Remix                 | Loader data preferred; `REMIX_PUBLIC_TRACKER_*` only if already used  |

## Provider mount

Every browser mount passes the same two props: the public tracker-id env
var and a comma-separated allowlist of exact production hostnames. The
JSX shape (`<Analytics />`) covers React/Next/Remix/Vue/Nuxt; Svelte uses
`injectAnalytics(props)` inside `onMount`; Astro uses `inject(props)`
inside a layout client script.

```tsx
<Analytics
  websiteId={process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ID}
  env={process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ENV}
  domains="example.com,www.example.com"
/>
```

Svelte and SvelteKit use `injectAnalytics` in the root layout.

```ts
import { injectAnalytics } from "@hellyeah/x-ray/svelte";
import { onMount } from "svelte";

onMount(() => {
  injectAnalytics({
    websiteId: import.meta.env.PUBLIC_TRACKER_ID,
    env: import.meta.env.PUBLIC_TRACKER_ENV,
    domains: "example.com,www.example.com",
  });
});
```

Astro uses `import { inject } from "@hellyeah/x-ray/astro"` and the same
object shape inside a `<script>` block in the layout.

## Server SDK singleton placement

The server SDK is initialized exactly once per server-side codebase. Put the
singleton in a path the rest of the server imports from — never re-create it
per request, per route, or per webhook.

| Stack                                | Recommended path                               |
| ------------------------------------ | ---------------------------------------------- |
| Next.js (App Router, route handlers) | `lib/tracker.ts` or `app/lib/tracker.ts`       |
| Next.js Pages Router API routes      | `lib/tracker.ts`                               |
| Express / Fastify                    | `src/lib/tracker.ts`                           |
| Hono                                 | `src/lib/tracker.ts`                           |
| Remix loaders/actions                | `app/lib/tracker.server.ts` (`.server` suffix) |
| Nuxt server/api routes               | `server/lib/tracker.ts`                        |
| SvelteKit `+server.ts` / hooks       | `src/lib/server/tracker.ts` (`server` segment) |
| Astro server endpoints               | `src/lib/tracker.ts`                           |
| Mastra agents/workflows              | `src/lib/tracker.ts`                           |

The `.server` / `server` suffix matters in Remix and SvelteKit — it keeps the
file out of the client bundle so `@hellyeah/x-ray/server` imports don't leak
to the browser.

The singleton's import path is the agent's choice within these conventions.
What `verify` enforces is the init shape — see
[`production-safety.md`](./production-safety.md) for the canonical block
and the env-tagging rule. If the existing codebase has a different singleton
convention (e.g., `src/services/analytics.ts`), follow it. The path is
flexible; the init shape is not.

## Static HTML / no-bundler

When the entry surface is static HTML with no `package.json` or bundler, there
is no SDK to install and no provider to import. The tracker is a self-initializing
script hosted by X-Ray; drop this tag into the page `<head>`:

```html
<script
  defer
  src="https://xray.hellyeahai.com/script.js"
  data-website-id="YOUR_TRACKER_ID"
  data-env="prod"
></script>
```

Resolve `YOUR_TRACKER_ID` with `hellyeah tracker state` / `hellyeah tracker
create`, same as every other surface. The tag handles pageviews, clicks, form
submits, and outbound links automatically; conversions fire declaratively via
`data-hy-event` (see
[`instrumentation-examples.md`](./instrumentation-examples.md)).

Only `data-website-id` is required. The few optional attributes worth surfacing:

| Attribute           | Purpose                                                  | Default |
| ------------------- | -------------------------------------------------------- | ------- |
| `data-env`          | Environment tag X-Ray segments on (`prod`, `staging`, …) | `prod`  |
| `data-domains`      | Comma-separated allowlist of exact production hostnames  | all     |
| `data-cookies`      | Set to `false` to disable the visitor cookie             | `true`  |
| `data-do-not-track` | Set to `true` to honor browser DNT                       | `false` |

The full attribute set is in the public docs
(`tracking/install-sdk`); do not enumerate all 15 here.

**Never register the static HTML file in `approvedFiles[]` or `findings[]`** —
the JS content checks would reject it. Confirm the install by reading the file
back, and record its coverage in the step-3 plan, not `install-state.json`.

**CSP.** This skill never edits a target's CSP. If the page has a sealed CSP, a
human must add `script-src https://xray.hellyeahai.com` (plus the inline-hash if
the tag is inlined) and `connect-src` for the collect host. Note what is
required; do not write it.
