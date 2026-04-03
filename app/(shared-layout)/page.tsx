import { Notebook } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Suspense } from "react";
import BlogList, { SkeletonLoadingUi } from "@/components/web/BlogList";
import { connection } from "next/server";
import { getToken } from "@/lib/auth-server";

async function HomeContent() {
  await connection();
  const token = await getToken();
  const posts = await fetchQuery(api.posts.getMyPosts, {}, { token });

  if (!posts || posts.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Notebook />
          </EmptyMedia>
          <EmptyTitle>No Blogs Yet</EmptyTitle>
          <EmptyDescription>
            You haven&apos;t created any blogs yet.
          </EmptyDescription>
        </EmptyHeader>
        <Link href={"/create"} className={cn(buttonVariants(), "gap-2")}>
          Create Blog
        </Link>
      </Empty>
    );
  }

  return <BlogList posts={posts} />;
}

export default function Home() {
  return (
    <div className="py-12">
      <div className="pb-8 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Your Blogs
        </h1>
      </div>
      <Suspense fallback={<SkeletonLoadingUi />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}
