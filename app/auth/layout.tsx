import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex justify-between items-center">
      <div className="absolute top-5 left-5">
        <Link
          href={"/"}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "bg-background",
          )}
        >
          <ArrowLeft className="size-4" /> Go back
        </Link>
      </div>
      <div className="w-full max-w-md mx-auto flex justify-center items-center">
        {children}
      </div>
    </div>
  );
}
