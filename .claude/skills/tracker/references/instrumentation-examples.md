# Instrumentation Examples

Three call-shape templates covering every conversion call you'll write
during install. Each shows the canonical event call with all fields the
SDK contract expects; substitute the user's real source-of-truth fields
read from your provider's installed types.

Email and phone go through `identity:`. Provider-specific business
fields (`order_id`, `payment_status`, `plan`, `session_id`) go through
`metadata:` as scalars only. Click IDs are session-scoped via
`XRayOptions.context` at SDK init, never per event.

## Server SDK init pattern (shared by every server example)

```ts
// apps/api/src/lib/tracker.ts
import { createXRay } from "@hellyeah/x-ray/server";

export const tracker = createXRay(process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ID, {
  env: process.env.HELLYEAH_TRACKER_ENV,
});

export { cv } from "@hellyeah/x-ray/server";
```

For the `env` tag rationale, env-var setup, and `verify` repair codes
covering this shape, see [`production-safety.md`](./production-safety.md).

## Template 1 — Server webhook with revenue

For server-confirmed paid conversions: payment-provider webhooks,
order-paid handlers, subscription lifecycle events. Use `trackImmediate`
because webhook handlers may exit before the next batch flush.

Pull leaf fields from the provider's typed payload. The example below uses
a Stripe-style `payload.data.object` shape; Paddle/LemonSqueezy-style SDKs
often use `payload.data`, and Shopify-style handlers are often flat.

```ts
import { cv, tracker } from "@/lib/tracker";

export const handlePaymentConfirmed = async (payload: ProviderEvent) => {
  // Pull the leaf fields from the payload's typed shape — read the
  // provider's .d.ts to confirm where each value lives. Common shapes:
  // payload.data.object (Stripe), payload.data (Paddle/LemonSqueezy),
  // payload (Shopify-style flat).
  const order = payload.data.object;

  await tracker.trackImmediate(cv.purchase, {
    distinctId: order.app_user_id ?? order.customer_email,
    identity: {
      email: order.customer_email ?? undefined,
      phone: order.customer_phone ?? undefined,
    },
    revenue: order.amount_total / 100,
    currency: order.currency,
    metadata: {
      provider: "<provider name>",
      order_id: order.id,
      payment_status: order.status,
    },
  });
};
```

Key choices:

- **`distinctId`** — prefer the app's durable user ID (set as
  `client_reference_id` / `custom_data.userId` / similar at checkout
  creation). Fall back to email only when no shared ID exists. Never
  fall back to a provider-only ID like Stripe's `cus_*` unless the app
  also uses that exact value in browser `identify()`.
- **`revenue`** — major units (dollars, not cents). Most payment
  providers ship cents in `amount_total` / `amount` fields; divide by 100. Read the type to confirm.
- **`currency`** — three-letter ISO code (`"usd"`, `"eur"`). Lowercase
  is conventional but the SDK normalizes either way.
- **`identity` vs `metadata`** — email and phone go in `identity:`
  only. Providers commonly nest phone/email under address objects
  (`shipping_address.phone`, `customer.email`). Pull the leaf field
  into `identity:` — never pass the parent object through `metadata`,
  even via spread, even via an alias key like `contact:` or
  `customer:`. The PII is still PII.

## Template 2 — Server webhook without revenue

For non-revenue conversions: bookings, leads, application submits,
registration. Same `trackImmediate` shape; `revenue` and `currency` stay
unset rather than zeroed. A `0`-revenue purchase is a meaningful signal
to ad platforms; an unset value correctly says "no revenue applies."

```ts
import { cv, tracker } from "@/lib/tracker";

export const handleBookingCreated = async (payload: BookingEvent) => {
  const booking = payload.data;

  await tracker.trackImmediate(cv.bookAppointment, {
    distinctId: booking.invitee.email,
    identity: {
      email: booking.invitee.email,
      phone: booking.invitee.phone ?? undefined,
    },
    metadata: {
      provider: "<provider name>",
      event_uri: booking.event_uri,
      scheduled_at: booking.scheduled_at,
    },
  });
};
```

The same shape applies to `cv.leadSubmit` (form-handler route emitting
on a validated submission) and `cv.registrationComplete` (auth
provider's create-user hook firing once per new user). The signal
contract is identical — the changing variable is which durable
identifier is available at that lifecycle moment.

### Newsletter subscribe is a custom event, not `cv.leadSubmit`

A mailing-list opt-in is product engagement, not a sales lead. Use a
custom event named for the source's vocabulary, never `cv.leadSubmit`
(which means a prospect surfacing contact info for sales follow-up):

```ts
import { track } from "@hellyeah/x-ray";

export const onNewsletterSubscribe = async (values: NewsletterForm) => {
  track("newsletter_subscribed", {
    distinctId: values.email,
    identity: { email: values.email },
    metadata: { list_id: values.listId },
  });
  await saveSubscriber(values);
};
```

Custom events are string literals (the `cv.` prefix is reserved for the
catalog). Past-tense verb phrase, source vocabulary — see
[`conversion-discovery.md`](./conversion-discovery.md#custom-events).

## Delegated route-factory with response-status gating

Some apps wrap their route handlers in a factory that runs the inner
handler and then acts on the response (a logging wrapper, an
auth-checking wrapper, a status-gated tracker). The conversion site is
inside the wrapper, gated on the _delegated_ handler's outcome — you
fire only when the inner handler reports success, not on every request.

```ts
import { cv, tracker } from "@/lib/tracker";

export const withConversionTracking =
  (event: string, handler: RouteHandler): RouteHandler =>
  async (req) => {
    const res = await handler(req);
    // Gate on the delegated handler's status — only a 2xx means the
    // durable resource was actually created.
    if (res.status >= 200 && res.status < 300) {
      await tracker.trackImmediate(event, {
        distinctId: res.locals?.userId,
      });
    }
    return res;
  };
```

This is a genuinely hard case to detect: the conversion is one
indirection removed from the persistence call, and the gating condition
lives in the wrapper, not the handler. If you can read the wrapper and
prove which status the delegated handler returns on success, instrument
it. If the delegation chain is too dynamic to prove the success path from
source, emit a `blocked[]` entry rather than guessing.

## Template 3 — Browser engagement event

For in-app interactions and view-throughs: product page views, button
clicks, search submissions, add-to-cart. Use `track` (not
`trackImmediate`) because the browser SDK batches and the page is not
about to terminate. `distinctId` is optional — the SDK attaches the
visitor cookie automatically; pass it explicitly only after `identify`
in the same session.

```tsx
"use client";
import { track, cv } from "@hellyeah/x-ray";
import { useEffect } from "react";

type ProductPageProps = {
  product: Product;
};

export const ProductPage = ({ product }: ProductPageProps) => {
  useEffect(() => {
    track(cv.viewContent, {
      metadata: {
        product_id: product.id,
        product_name: product.name,
        category: product.category,
      },
    });
  }, [product.id]);

  return (
    <button
      onClick={() => {
        track(cv.addToCart, {
          metadata: { product_id: product.id, quantity: 1 },
        });
        addToCart(product.id);
      }}
    >
      Add to cart
    </button>
  );
};
```

For browser-side form submits where the form posts directly to a third
party (HubSpot Embed, Marketo) and there is no own backend route to
attach the conversion to, call `identify` then `track` in the
`onSubmit` handler:

```ts
import { identify, track, cv } from "@hellyeah/x-ray";

export const onLeadFormSubmit = async (values: LeadForm) => {
  identify(values.email, { email: values.email, phone: values.phone });
  track(cv.leadSubmit, {
    distinctId: values.email,
    metadata: { form_id: "demo-request", company: values.company },
  });
  await postLeadToThirdParty(values);
};
```

`identify` before `track` lets the SDK attach the email/phone to
subsequent events in the same session.

## Template 4 — Declarative HTML conversion (static, no bundler)

For a static entry surface instrumented with the hosted `script.js` (see
[`framework-adapters.md`](./framework-adapters.md#static-html--no-bundler)),
there are no JS `track()` call sites. A CTA element fires a conversion
declaratively: `data-hy-event="<name>"` triggers `track("<name>", {...})` on
click, and each `data-hy-prop-<key>="<value>"` becomes one `{ <key>: "<value>" }`
metadata field.

```html
<button data-hy-event="cv.leadSubmit" data-hy-prop-plan="pro">
  Get started
</button>
```

fires `track("cv.leadSubmit", { plan: "pro" })` on click.

The `cv.*` naming convention still applies for catalog conversions; the
attribute value is the literal event name. The tracker does no validation, so
the agent owns correctness — a typo in the event name ships silently.

## Capturing click IDs at SDK init (Attribution)

Click IDs (`gclid`, `fbclid`, `utm_*`) live on `XRayOptions.context`, not
in event `metadata:`. The browser provider captures them automatically.
For **server-only** trackers, pass them explicitly per request:

```ts
import { createXRay } from "@hellyeah/x-ray/server";

export const createTrackerForRequest = (req: Request) =>
  createXRay(process.env.NEXT_PUBLIC_HELLYEAH_TRACKER_ID, {
    env: process.env.HELLYEAH_TRACKER_ENV,
    context: {
      gclid: extractClickId(req, "gclid"),
      fbclid: extractClickId(req, "fbclid"),
      utm_source: extractClickId(req, "utm_source"),
    },
  });
```

## Anti-patterns

`verify` rejects these shapes. The four PII classes share one fix —
lift email/phone into `identity:` and leave the rest behind — but the
matcher catches them as different syntaxes. Each is one repair class.

### Literal email/phone keys in metadata

Rejected:

```ts
tracker.trackImmediate(cv.purchase, {
  distinctId: order.userId,
  metadata: {
    email: order.email,
    phone: order.phone,
    order_id: order.id,
  },
});
```

Use:

```ts
tracker.trackImmediate(cv.purchase, {
  distinctId: order.userId,
  identity: {
    email: order.email,
    phone: order.phone,
  },
  metadata: {
    order_id: order.id,
  },
});
```

What triggers it: literal `email:` or `phone:` keys inside a `metadata:`
block adjacent to a `cv.*` call.

### Aliased PII keys

Rejected:

```ts
tracker.trackImmediate(cv.leadSubmit, {
  distinctId: session.customer_email,
  metadata: {
    contact: session.customer_email,
  },
});
```

Use:

```ts
tracker.trackImmediate(cv.leadSubmit, {
  distinctId: session.customer_email,
  identity: {
    email: session.customer_email,
  },
  metadata: {
    form_id: "demo-request",
  },
});
```

What triggers it: alias keys (`contact:`, `customer:`, `billingDetails:`,
`profile:`) inside a `metadata:` block.

### Object spreads

Rejected:

```ts
tracker.trackImmediate(cv.subscribe, {
  distinctId: customer.id,
  metadata: {
    ...customer,
  },
});
```

Use:

```ts
tracker.trackImmediate(cv.subscribe, {
  distinctId: customer.id,
  identity: {
    email: customer.email,
    phone: customer.phone,
  },
  metadata: {
    plan_tier: customer.planTier,
  },
});
```

What triggers it: any spread (`...x`) inside a `metadata:` block.

### Nested object literals

Rejected:

```ts
tracker.trackImmediate(cv.purchase, {
  distinctId: user.id,
  metadata: {
    user: {
      id: user.id,
      email: user.email,
    },
    shipping: {
      city,
      phone,
    },
  },
});
```

Use:

```ts
tracker.trackImmediate(cv.purchase, {
  distinctId: user.id,
  identity: {
    email: user.email,
    phone,
  },
  metadata: {
    user_id: user.id,
    shipping_city: city,
  },
});
```

What triggers it: any `{` opening a nested literal inside `metadata:`.

### Other rejected shapes

Hardcoded tracker IDs can drift from verify-time provisioning:

```ts
createXRay("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
  env: process.env.HELLYEAH_TRACKER_ENV,
});
```

A missing `env` tag leaves events unsegmentable by environment:

```ts
createXRay(process.env.HELLYEAH_TRACKER_ID, {});
```

Per-call gating silently drops events X-Ray would otherwise segment by `env`:

```ts
if (process.env.NODE_ENV === "production") {
  await tracker.trackImmediate(cv.purchase, payload);
}
```

Click IDs belong on `XRayOptions.context`, not event metadata:

```ts
tracker.trackImmediate(cv.purchase, {
  distinctId: order.userId,
  metadata: {
    gclid: req.query.gclid,
  },
});
```

Server `identify()` races across concurrent requests:

```ts
tracker.identify(userId);
await tracker.trackImmediate(cv.purchase, payload);
```

Raw request artifacts must not go in metadata:

```ts
tracker.trackImmediate(cv.purchase, {
  distinctId: order.userId,
  metadata: {
    ip: req.headers["x-forwarded-for"],
    user_agent: req.headers["user-agent"],
  },
});
```
