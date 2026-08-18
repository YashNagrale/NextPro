"use client";

import { ReactNode, useEffect } from "react";
import { ConvexReactClient } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { identify } from "@hellyeah/x-ray";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      <AuthenticatedIdentity />
      {children}
    </ConvexBetterAuthProvider>
  );
}

function AuthenticatedIdentity() {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (!session?.user) return;

    identify(session.user.id, { email: session.user.email });
  }, [session?.user.email, session?.user.id]);

  return null;
}
