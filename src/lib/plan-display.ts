export type DisplayPlan = "free" | "basic" | "pro";

export interface PlanDisplay {
  name: string;
  eyebrow: string;
  price: string;
  period: string;
  note: string;
  description: string;
  cta: string;
  featured?: boolean;
  features: string[];
}

export const PLAN_DISPLAY: Record<DisplayPlan, PlanDisplay> = {
  free: {
    name: "Free",
    eyebrow: "Starter privacy",
    price: "$0",
    period: "Free forever",
    note: "Try it risk-free",
    description: "Start shielding your real inbox with core alias protection.",
    cta: "Start Free",
    features: [
      "10 active aliases",
      "1 custom domain",
      "1 recipient",
      "OpenPGP encrypted forwarding",
      "Instant alias blocking",
      "Works with any inbox",
    ],
  },
  basic: {
    name: "Basic",
    eyebrow: "Personal",
    price: "$4",
    period: "/year",
    note: "About a cent a day",
    description: "A full year of protection with 3 custom domains and 5 recipients.",
    cta: "Get Basic",
    features: ["Everything in Free", "50 active aliases", "3 custom domains", "5 recipients"],
  },
  pro: {
    name: "Shield",
    eyebrow: "Best value",
    price: "$10",
    period: "/year",
    note: "Under $1/month",
    description: "Apex plan with 3 custom domains, 5 recipients, and priority controls.",
    cta: "Protect My Inbox",
    featured: true,
    features: [
      "Unlimited active aliases",
      "3 custom domains",
      "5 recipients",
      "Priority support",
      "Chat customer support",
    ],
  },
};
