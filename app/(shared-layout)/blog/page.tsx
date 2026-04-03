import BlogList, { SkeletonLoadingUi } from "@/components/web/BlogSection";
import { api } from "@/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { Metadata } from "next";
import { Suspense } from "react";

// export const dynamic = "force-static";
// export const revalidate = 30;

export const metadata: Metadata = {
  title: "Blog | Explore blogs",
  description: "Find the rarest blogs here",
};

export default async function BlogPage() {
  const posts = await fetchQuery(api.posts.getPosts);
  return (
    <div className="py-12">
      <div className="pb-12 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Our Blogs
        </h1>
        <p className="pt-4 max-w-2xl mx-auto text-xl text-muted-foreground">
          Insights, thoughts, and trends from our team.
        </p>
      </div>
      <Suspense fallback={<SkeletonLoadingUi />}>
        <BlogList posts={posts} />
      </Suspense>
    </div>
  );
}
