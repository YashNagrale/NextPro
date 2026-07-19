# Hosted Auth Providers

Verified parameter-passing facts for the hosted auth and checkout providers a
tracker install hits most. Load this when the auth flow classifies as
hosted-redirect or webhook-authority in
[`identity-bridge.md`](./identity-bridge.md). These facts decide which bridge
mechanism survives the round-trip, so the install does not re-research them per
repo.

## Clerk

- `unsafeMetadata` set client-side at sign-up arrives as `unsafe_metadata` in
  the `user.created` webhook payload. This is the `visitor_id_passthrough`
  carrier when a watcher is not viable.
- The hosted Account Portal is **not** parameterizable — you cannot inject the
  `vid` through it. Use a `browser_identify` watcher inside `ClerkProvider`
  (`useUser`/`useAuth`) instead.
- Webhooks are async with no ordering guarantee. That is fine: attribution
  resolves at query time, so a `user.created` webhook landing before the
  browser `identify` still stitches.

## Auth0

- A post-login Action reads custom `/authorize` parameters via
  `event.request.query`. The React SDK round-trips state through `appState`
  across the redirect.
- A post-user-registration Action does **not** run for social connections — do
  not rely on it as the universal binding point; prefer the post-login Action
  or a `browser_identify` watcher.

## Cognito

- The `state` parameter round-trips, but it must be base64-encoded. A
  URL-encoded JSON `state` is rejected.

## WorkOS

- The `state` parameter round-trips verbatim. Carry the `vid` in it directly.

## Stripe

- `client_reference_id` (max 200 chars) and `metadata` round-trip into the
  `checkout.session.completed` event — the `visitor_id_passthrough` carrier for
  checkout-before-signup.
- `metadata` does **not** auto-propagate from the Checkout Session to the
  PaymentIntent. Set `payment_intent_data.metadata` when the conversion reads
  from the PaymentIntent instead of the session.

## Magic links

- The PKCE exchange must complete in the originating browser. A cross-device
  open (link tapped on a phone after requesting on a laptop) breaks both
  `browser_identify` and `server_cookie_persist`; only `visitor_id_passthrough`
  (vid in the link URL) and `email_late_bind` survive.
