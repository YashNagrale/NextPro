"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import * as PricingCard from "@/components/pricing-card";
import { CheckCircle2, Users, Briefcase, Building } from "lucide-react";
import { track } from "@hellyeah/x-ray";

export function PricingSection() {
  return (
    <section className="w-full">
      <div className="mx-auto mb-4 max-w-md space-y-2">
        <div className="flex justify-center">
          <div className="rounded-md border px-4 py-1 text-sm">Pricing</div>
        </div>
        <h2 className="text-center font-bold text-2xl tracking-tight md:text-3xl lg:font-extrabold lg:text-4xl">
          Plans that Scale with You
        </h2>
        <p className="text-center text-muted-foreground text-sm md:text-base">
          Whether you're just starting out or growing fast, our flexible pricing
          has you covered.
        </p>
      </div>
      <div className="mx-auto grid w-full max-w-4xl gap-4 p-6 md:grid-cols-3">
        {plans.map((plan, index) => (
          <PricingCard.Card
            className={cn("w-full max-w-full", index === 1 && "md:scale-105")}
            key={plan.name}
          >
            <PricingCard.Header isPopular={index === 1}>
              <PricingCard.Plan>
                <PricingCard.PlanName>
                  {plan.icon}
                  <span>{plan.name}</span>
                </PricingCard.PlanName>
                {plan.badge && (
                  <PricingCard.Badge>{plan.badge}</PricingCard.Badge>
                )}
              </PricingCard.Plan>
              <PricingCard.Price>
                <PricingCard.MainPrice>{plan.price}</PricingCard.MainPrice>
                <PricingCard.Period>{plan.period}</PricingCard.Period>
                {plan.original && (
                  <PricingCard.OriginalPrice className="ml-auto">
                    {plan.original}
                  </PricingCard.OriginalPrice>
                )}
              </PricingCard.Price>
              <Button
                className={cn("w-full font-semibold")}
                variant={plan.variant as "outline" | "default"}
                onClick={() => {
                  track("pricing_cta_clicked", {
                    plan: plan.name,
                    price: plan.price,
                    section: "pricing",
                  });
                }}
              >
                Get Started
              </Button>
            </PricingCard.Header>

            <PricingCard.Body>
              <PricingCard.Description>
                {plan.description}
              </PricingCard.Description>
              <PricingCard.List>
                {plan.features.map((item) => (
                  <PricingCard.ListItem className="text-xs" key={item}>
                    <CheckCircle2
                      aria-hidden="true"
                      className="size-4 text-foreground"
                    />
                    <span>{item}</span>
                  </PricingCard.ListItem>
                ))}
              </PricingCard.List>
            </PricingCard.Body>
          </PricingCard.Card>
        ))}
      </div>
    </section>
  );
}

const plans = [
  {
    icon: <Users />,
    description: "Perfect for individuals",
    name: "Basic",
    price: "Free",
    variant: "outline",
    features: [
      "Unlimited UI Components",
      "Copy & Paste Components",
      "Next.js & React Support",
      "Tailwind CSS Integration",
      "Regular Component Updates",
      "Community Access",
    ],
  },
  {
    icon: <Briefcase />,
    description: "Ideal for small teams",
    name: "Pro",
    badge: "Popular",
    price: "$29",
    original: "$39",
    period: "/month",
    variant: "default",
    features: [
      "All Basic Plan Features",
      "Premium UI Components",
      "Advanced Layout Blocks",
      "Dashboard Templates",
      "Authentication Templates",
    ],
  },
  {
    icon: <Building />,
    name: "Enterprise",
    description: "Perfect for large scale companies",
    price: "$99",
    original: "$129",
    period: "/month",
    variant: "outline",
    features: [
      "All Pro Plan Features",
      "Unlimited Team Members",
      "Dedicated Support",
      "Private Component Library",
      "Enterprise Licensing",
      "Advanced Team Management",
    ],
  },
];
