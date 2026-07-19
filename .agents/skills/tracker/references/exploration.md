# Exploration

Use this as the full report contract when delegating product-journey
discovery to Explore sub-agents.

## Report fields

Each Explore sub-agent returns one compact JSON object:

- `root` — root path from `prepare`
- `semanticRoles` — entry surface / conversion authority / worker /
  dashboard / docs / utility / skip, with evidence
- `filesRead` — root-relative source files it actually opened
- `candidateEntrySurface` — yes/no/unknown, with route/domain evidence
- `identityBridge` — a structured object recording how browser identity can
  reach this root's server conversions (see below). Near-zero added context:
  the sub-agent already visited the auth code; it records what it saw.
- `findings[]` — candidate conversion sites in the same shape step 7 needs:
  `{ site, kind, proposedEvent, rationale, evidence }`
- `skipped[]` — concrete sites it considered and rejected, with reasons
- `blocked[]` — plausible signals it could not prove, with `searched[]`
- `packagesToInstall` — roots that would need `@hellyeah/x-ray`
- `openQuestions` — only load-bearing ambiguity for the user

## The `identityBridge` object

The sub-agent records how browser identity can reach this root's server
conversions. The main agent maps `proposedMechanism` to the install-state
`identityBridge.mechanism` at step 7 — `blocked` becomes `deferred` with a
justification (same fact, two phases).

```json
{
  "authFlowType": "own_form | hosted_redirect | magic_link | none_observed",
  "provider": "clerk | auth0 | workos | cognito | other | null",
  "conversionAuthority": "browser | server_route | webhook",
  "returnsToInstrumentedSurface": true,
  "proposedMechanism": "browser_identify | server_cookie_persist | visitor_id_passthrough | email_late_bind | blocked",
  "evidence": "path:line — what was observed"
}
```

Classify from observable triggers per
[`identity-bridge.md`](./identity-bridge.md); load
[`hosted-auth-providers.md`](./hosted-auth-providers.md) when
`authFlowType` is `hosted_redirect`. Use `blocked` rather than guessing a
mechanism you cannot prove from source.

## Grouping

Use one Explore sub-agent per root. Group roots only when they share a
`package.json` and the same primary purpose, such as a Vite library and its
docs site under one workspace. Never group across `apps/*` boundaries.
