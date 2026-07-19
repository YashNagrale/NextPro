"use client";

import { createBlogAction } from "@/app/actions";
import { postSchema } from "@/app/schemas/blog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/web/Spinner";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, Upload } from "lucide-react";
import { useEffect, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import { cv, track } from "@hellyeah/x-ray";

export default function CreateRoute() {
  // useEffect(() => {
  //   track(cv.leadSubmit, {
  //     source: "blog_view",
  //   });
  // }, []);
  useEffect(() => {
    // Page journey
    track("landing_viewed", {
      source: "direct",
    });

    track("pricing_viewed", {
      plan: "pro",
    });

    track("docs_viewed", {
      section: "installation",
    });

    track("component_previewed", {
      component: "button",
    });

    track("template_opened", {
      template: "dashboard",
    });

    // Conversions
    track(cv.leadSubmit, {
      plan: "starter",
      source: "blog",
      campaign: "nextpro_launch",
    });

    track(cv.leadSubmit, {
      plan: "pro",
      source: "pricing_page",
      campaign: "nextpro_launch",
    });

    track(cv.purchase, {
      revenue: 19.99,
      currency: "USD",
      plan: "starter",
      billing_cycle: "monthly",
    });

    track(cv.purchase, {
      revenue: 49.99,
      currency: "USD",
      plan: "pro",
      billing_cycle: "monthly",
    });

    track(cv.purchase, {
      revenue: 99.99,
      currency: "USD",
      plan: "pro",
      billing_cycle: "yearly",
    });
  }, []);
  const [isPending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(postSchema),
    defaultValues: {
      title: "",
      content: "",
      image: undefined,
    },
  });

  function onSubmit(values: z.infer<typeof postSchema>) {
    startTransition(async () => {
      console.log("server action from client side");
      await createBlogAction(values);
      toast.success("Post created successfully");
    });
  }

  return (
    <div className="py-12">
      <div className="text-center mb-9">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Create post
        </h1>
        <p className="text-lg text-muted-foreground pt-2">
          Share your thoughts with big world
        </p>
      </div>

      <Card className="w-full max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>Create Blog Article</CardTitle>
          <CardDescription>Create a new blog article</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup className="gap-y-4">
              <Controller
                name="image"
                control={form.control}
                render={({ field, fieldState }) => (
                  <div className="space-y-2">
                    <FieldLabel>Image</FieldLabel>

                    <div className="flex flex-col items-center justify-center w-full h-48 bg-secondary border border-dashed border-muted-foreground rounded-xl">
                      <div className="flex flex-col items-center justify-center text-body pt-5 pb-6 text-center">
                        <Upload className="w-8 h-8 mb-4 text-muted-foreground" />

                        <p className="mb-2 text-sm">
                          Click the button below to upload
                        </p>
                        <p className="text-xs mb-4 text-muted-foreground">
                          Max. File Size:{" "}
                          <span className="font-semibold">30MB</span>
                        </p>

                        <input
                          id="image-upload"
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => field.onChange(e.target.files?.[0])}
                        />

                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={() =>
                            document.getElementById("image-upload")?.click()
                          }
                          className="gap-2"
                        >
                          <Search className="w-4 h-4" />
                          Browse file
                        </Button>

                        {field.value && (
                          <p className="mt-4 text-xs font-medium text-primary truncate max-w-62.5">
                            Selected: {field.value.name}
                          </p>
                        )}
                      </div>
                    </div>

                    {fieldState.error && (
                      <p className="text-sm font-medium text-destructive">
                        {fieldState.error.message}
                      </p>
                    )}
                  </div>
                )}
              />
              <Controller
                name="title"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>Title</FieldLabel>
                    <Input
                      aria-invalid={fieldState.invalid}
                      placeholder="Write your blog title"
                      {...field}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="content"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>Content</FieldLabel>
                    <Textarea
                      aria-invalid={fieldState.invalid}
                      placeholder="Write your blog content"
                      {...field}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              {/* <Controller
                name="image"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>Image</FieldLabel>
                    <Input
                      aria-invalid={fieldState.invalid}
                      placeholder="Write your blog content"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        field.onChange(file);
                      }}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              /> */}

              <Button disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner />
                    <span>Create Blog</span>
                  </>
                ) : (
                  <>
                    <span>Create Blog</span>
                  </>
                )}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
