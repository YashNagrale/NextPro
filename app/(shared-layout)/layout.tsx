import { Navbar } from "@/components/web/navbar";
import { ReactNode } from "react";
export const dynamic = "force-dynamic";

export default function SharedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
