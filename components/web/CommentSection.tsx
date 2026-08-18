"use client";

import { ArrowUp, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { commentSchema } from "@/app/schemas/comment";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { useParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import z from "zod";
import { toast } from "sonner";
import { useTransition } from "react";
import { Spinner } from "./Spinner";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Separator } from "../ui/separator";
import { track } from "@hellyeah/x-ray";

export function CommentSection(props: {
  preloadedComments: Preloaded<typeof api.comments.getCommentsByPostsId>;
}) {
  const { postId } = useParams<{ postId: Id<"posts"> }>();
  const data = usePreloadedQuery(props.preloadedComments);

  const [isPending, startTransition] = useTransition();
  const createComment = useMutation(api.comments.createComment);
  const form = useForm({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      body: "",
      postId: postId,
    },
  });

  function onSubmit(data: z.infer<typeof commentSchema>) {
    startTransition(async () => {
      try {
        await createComment(data);
        track("comment_created", { postId: data.postId });
        form.reset();
        toast.success("Comment posted");
      } catch {
        toast.error("Failed to create post");
      }
    });
  }

  if (data === undefined) {
    return <p>loading...</p>;
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3 border-b-2">
        <MessageSquare className="size-5" />
        <h3 className="text-lg font-semibold">{data.length} comments</h3>
      </CardHeader>
      <CardContent className="space-y-8">
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Controller
            name="body"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Comment</FieldLabel>

                <div className="relative">
                  <Textarea
                    aria-invalid={fieldState.invalid}
                    placeholder="Share your thoughts"
                    {...field}
                    className="pb-11 resize-none"
                  />

                  <div className="absolute bottom-2 right-2">
                    <Button className="cursor-pointer" disabled={isPending}>
                      {isPending ? (
                        <>
                          <Spinner />
                        </>
                      ) : (
                        <>
                          <ArrowUp />
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </form>

        {/* {data.length > 0 && } */}
        <Separator />

        <section className="space-y-6">
          {data?.length === 0 ? (
            <p className="text-lg font-semibold text-muted-foreground text-center">
              Be the first to comment
            </p>
          ) : (
            data?.map((comment) => (
              <div key={comment._id} className="flex gap-4">
                <Avatar className="size-10 shrink-10">
                  <AvatarImage
                    src={`https://avatar.vercel.sh/${comment.authorName}`}
                    alt={comment.authorName}
                  />
                  <AvatarFallback>
                    {comment.authorName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{comment.authorName}</p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(comment._creationTime).toLocaleDateString("IN")}
                    </p>
                  </div>

                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {comment.body}
                  </p>
                </div>
              </div>
            ))
          )}
        </section>
      </CardContent>
    </Card>
  );
}
