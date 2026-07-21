import { NextResponse } from "next/server";
import { XRay, cv } from "@hellyeah/x-ray/server";

export async function GET() {
  const xray = new XRay("019f6eca-9d26-7000-92a5-3bd4646835ed");

  // await xray.trackImmediate(cv.leadSubmit, {
  //   plan: "starter",
  //   distinctId: "user-101",
  // });

  // await xray.trackImmediate(cv.leadSubmit, {
  //   plan: "pro",
  //   distinctId: "user-102",
  // });
  await xray.trackImmediate(cv.purchase, {
    revenue: 19.99,
    currency: "USD",
    distinctId: crypto.randomUUID(),
  });

  await xray.trackImmediate(cv.purchase, {
    revenue: 49.99,
    currency: "USD",
    distinctId: crypto.randomUUID(),
  });

  await xray.trackImmediate(cv.purchase, {
    revenue: 99.99,
    currency: "USD",
    distinctId: crypto.randomUUID(),
  });

  return NextResponse.json({
    success: true,
  });
}
