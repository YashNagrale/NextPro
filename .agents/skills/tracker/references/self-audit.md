# Self-Audit

Walk these prompts in chat before writing state. The script catches
mechanical errors; this step catches judgment errors that pass schema but
ship the wrong signal.

1. **Funnel completeness.** For each root, did you *account for every
   plausible conversion stage*, or did you stop at the first safe event?
   Ad platforms optimize on the whole funnel, so a purchase-only install
   underperforms a full-funnel one — every stage you skipped for scope
   reasons is signal lost. For commerce roots, walk the ledger: product
   view, add-to-cart, begin-checkout (≠ purchase), purchase authority,
   newsletter (custom, not `cv.leadSubmit`), identity bridge. For
   AI/chat/productivity roots, did you consider custom activation events
   (first message, workspace created, onboarding complete) — not just
   `cv.*`? A stage you found but skipped to "keep the install small" is
   not a legitimate skip. See
   [`conversion-discovery.md`](./conversion-discovery.md#completeness-is-the-job-not-coverage-of-one-safe-event).

2. **Identity bridge.** If cookies land on one surface and conversions fire
   on another, how does identity flow? Same parent domain → confirm cookie
   scope includes it. Different parent domains → name the identifier passed
   through redirect/session/webhook. If you can't name the bridge,
   attribution is broken — fix before writing state.

3. **Catalog meaning vs. domain meaning.** For each `cv.*` you propose,
   state the catalog meaning and the site meaning side by side. If the
   codebase's word for something doesn't match the catalog (a "trial"
   that's a candidate assessment, a "subscription" that's a newsletter,
   a "contact" that's a support ticket), switch to a custom event.
   Overloading `cv.*` pollutes the ad model.

4. **Event-name form.** Every catalog reference uses `cv.X` from the SDK
   constant, never the wire-format `cv_X` string. Check source,
   `expectedEvents[]`, and `findings[].proposedEvent`. Wire-form is
   rejected at schema validation.

5. **SDK peer-dep range.** Read `@hellyeah/x-ray/package.json`
   `peerDependencies`. If your host framework is outside the range (e.g.,
   SDK declares Next `^14 || ^15` and the app is on Next 16), bump the
   SDK if a compatible version exists, otherwise document the deviation
   in chat. Don't ship past a mismatch silently.
