import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CommentSection } from "@/components/web/CommentSection";
import PostPresence from "@/components/web/PostPresence";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { ArrowLeft } from "lucide-react";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getToken } from "@/lib/auth-server";
import { notFound, redirect } from "next/navigation";
import { ReactNode } from "react";

interface postIdRouteParams {
  params: Promise<{
    postId: Id<"posts">;
  }>;
}

export async function generateMetadata({
  params,
}: postIdRouteParams): Promise<Metadata> {
  const { postId } = await params;
  const post = await fetchQuery(api.posts.getPostById, { postId });

  if (!post) {
    return {
      title: "Post not found",
    };
  }

  return {
    title: post.title,
    description: post.body,
  };
}

export default async function PostIdRoute({
  params,
}: postIdRouteParams): Promise<ReactNode> {
  const { postId } = await params;
  const token = await getToken();

  const [post, preloadedComments, userId] = await Promise.all([
    await fetchQuery(api.posts.getPostById, { postId }),

    await preloadQuery(api.comments.getCommentsByPostsId, {
      postId,
    }),
    await fetchQuery(api.presence.getUserId, {}, { token }),
  ]);

  if (!userId) {
    return redirect("/auth/login");
  }

  if (!post) {
    return notFound();
  }

  return (
    <div className="max-w-3xl w-full mx-auto py-8 px-4 animate-in fade-in duration-500 relative">
      <Link
        href={"/blog"}
        className={cn(
          buttonVariants({ variant: "outline", className: "mb-4" }),
          "bg-background",
        )}
      >
        <ArrowLeft className="size-4" /> Go back
      </Link>

      <div className="relative w-full h-100 mb-8 rounded-xl overflow-hidden shadow-sm">
        <Image
          src={
            post.imageUrl ??
            "https://images.unsplash.com/photo-1771957585146-e76c62faf663?q=80&w=688&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          }
          alt={post.title}
          fill
          className="object-cover hover:scale-105 transition-transform duration-500"
        />
      </div>

      <div className="space-y-3 flex flex-col">
        <h1 className="text-4xl tracking-tight font-bold text-foreground">
          {post.title}
        </h1>

        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            Posted on: {new Date(post._creationTime).toLocaleDateString("IN")}
          </p>
          <Separator orientation="vertical" />

          {userId && <PostPresence roomId={post._id} userId={userId} />}
        </div>
      </div>

      <Separator className="my-5 " />

      <p className="text-lg leading-relaxed text-foreground/90 whitespace-pre-wrap">
        {post.body}
      </p>
      <Separator className="my-5 " />

      <CommentSection preloadedComments={preloadedComments} />
    </div>
  );
}
