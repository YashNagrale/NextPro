import { cacheLife, cacheTag } from "next/cache";
import { Card, CardContent, CardFooter } from "../ui/card";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Doc } from "@/convex/_generated/dataModel";
import { connection } from "next/server";

type PostWithImageUrl = Doc<"posts"> & { imageUrl: string | null };

export default async function BlogList({
  posts,
}: {
  posts: PostWithImageUrl[];
}) {
  // "use cache";
  // cacheLife("hours");
  // cacheTag("blog");

  await connection();

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {posts?.map((post) => (
        <Card key={post._id} className="pt-0">
          <div className="relative w-full h-48 overflow-hidden">
            <Image
              src={
                post.imageUrl ??
                "https://images.unsplash.com/photo-1771957585146-e76c62faf663?q=80&w=688&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
              }
              alt="image"
              className="object-cover"
              fill
            />
          </div>

          <CardContent>
            <Link href={`/blog/${post._id}`}>
              <h1 className="text-2xl font-bold hover:text-muted-foreground">
                {post.title}
              </h1>
            </Link>
            <p className="line-clamp-3 text-muted-foreground">{post.body}</p>
          </CardContent>

          <CardFooter>
            <Link
              className={buttonVariants({
                className: "w-full",
              })}
              href={`/blog/${post._id}`}
            >
              Read more
            </Link>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

export function SkeletonLoadingUi() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex flex-col space-y-3">
          <Skeleton className="h-48 w-full rounded-xl" />
          <div className="space-y-2 flex flex-col">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
