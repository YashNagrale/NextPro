"use client";

import Link from "next/link";
import { Button, buttonVariants } from "../ui/button";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";
import { useConvexAuth } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "./Spinner";
import { Skeleton } from "../ui/skeleton";
import { SearchInput } from "./SearchInput";

export function Navbar() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);

  return (
    <nav className="w-full py-5 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <Link href={"/"}>
          <h1 className="text-3xl font-bold ">
            Next<span className="text-muted-foreground">Pro</span>
          </h1>
        </Link>

        <div className="flex items-center gap-2">
          <Link className={buttonVariants({ variant: "ghost" })} href={"/"}>
            Home
          </Link>
          <Link className={buttonVariants({ variant: "ghost" })} href={"/blog"}>
            Blog
          </Link>
          <Link
            className={buttonVariants({ variant: "ghost" })}
            href={"/create"}
          >
            Create
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden md:block md:mr-2">
          <SearchInput />
        </div>
        {isLoading ? (
          <Skeleton className="w-18 h-8" />
        ) : isAuthenticated ? (
          <Button
            disabled={isLogoutLoading}
            onClick={() => {
              setIsLogoutLoading(true);
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    toast.success("logged out successfully");
                    window.location.href = "/";
                  },
                  onError: (error) => {
                    toast.error(error.error.message);
                    setIsLogoutLoading(false);
                  },
                },
              });
            }}
          >
            {isLogoutLoading ? (
              <>
                <Spinner />
                <span>Log out</span>
              </>
            ) : (
              <>
                <span>Log out</span>
              </>
            )}
          </Button>
        ) : (
          <>
            <Link className={buttonVariants()} href={"/auth/sign-up"}>
              Sign up
            </Link>
            <Link
              className={cn(
                buttonVariants({ variant: "outline" }),
                "bg-background",
              )}
              href={"/auth/login"}
            >
              Login
            </Link>
          </>
        )}

        <ThemeToggle />
      </div>
    </nav>
  );
}
