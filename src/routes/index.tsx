import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Shield,
  Mail,
  Zap,
  Ban,
  Lock,
  BellRing,
  Inbox,
  Check,
  ChevronDown,
  ArrowRight,
  Sparkles,
  Eye,
  EyeOff,
  AlertTriangle,
  Globe,
  Users,
  ScanEye,
  Fingerprint,
  Heart,
  ShoppingBag,
  MessageSquare,
} from "lucide-react";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "app.shieldme.cc" || host.startsWith("app.")) {
        window.location.replace("/login");
        return;
      }
    }
  },
  head: () => ({
    meta: [
      { title: "ShieldMail — Email Alias Privacy & Inbox Protection" },
      {
        name: "description",
        content:
          "Stop handing strangers your real email. ShieldMail creates private aliases that forward to your inbox while reducing unnecessary exposure. Start free.",
      },
      { property: "og:title", content: "ShieldMail — Private Email Aliases" },
      {
        property: "og:description",
        content:
          "Private email aliases, encrypted forwarding options, and inbox privacy controls. From $4/year.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalesPage,
});

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
      {children}
    </span>
  );
}

function CTA({
  href = "#pricing",
  children,
  variant = "primary",
  className = "",
}: {
  href?: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  const styles =
    variant === "primary"
      ? "bg-accent-grad text-primary-foreground shadow-glow hover:scale-[1.02] hover:shadow-[0_0_0_1px_oklch(0.92_0.16_170_/_0.45),0_20px_70px_-18px_oklch(0.86_0.18_165_/_0.55)]"
      : "border-2 border-accent/70 bg-surface-2/90 text-foreground shadow-[0_0_0_1px_oklch(0.92_0.16_170_/_0.18),0_1px_0_oklch(1_0_0_/_0.08)_inset] hover:border-accent hover:bg-accent/12 hover:text-accent-glow hover:shadow-[0_0_0_3px_oklch(0.92_0.16_170_/_0.16)]";
  return (
    <a href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </a>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
      <span className="h-px w-6 bg-accent/60" />
      {children}
    </div>
  );
}

function SalesPage() {
  return (
    <main className="min-h-screen text-foreground">
      <Nav />
      <Hero />
      <Problem />
      <BreachCheck />
      <UseCases />
      <Features />
      <HowItWorks />
      <Pricing />
      <Comparison />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}

function BreachCheck() {
  const exposedItems = [
    { icon: Eye, label: "Social media accounts tied to your email" },
    { icon: Lock, label: "Old passwords found in leaked databases" },
    { icon: Globe, label: "Government ID & address information" },
    { icon: AlertTriangle, label: "Dark-web marketplace listings" },
  ];
  return (
    <section className="border-t border-border bg-surface/30">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-10 md:grid-cols-[1fr_1.1fr] md:items-center">
          <div>
            <SectionLabel>Free Exposure Check</SectionLabel>
            <h2 className="text-4xl font-bold md:text-5xl">
              See what's already leaked — then lock the door.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Data breaches can expose email addresses, passwords, and other personal information.
              Check your address with an established breach-checking service, then use forwarding
              aliases to reduce exposure on future signups.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              We recommend Malwarebytes{" "}
              <a
                href="https://www.malwarebytes.com/digital-footprint-app"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent underline underline-offset-4 hover:text-accent-glow"
              >
                Digital Footprint Scan
              </a>{" "}
              — a free tool that reveals what hackers can already see about you.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
              <a
                href="https://www.malwarebytes.com/digital-footprint-app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-accent-grad px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:scale-[1.02]"
              >
                <ScanEye className="h-4 w-4" />
                Check My Exposure — Free
              </a>
              <CTA href="#pricing" variant="ghost">
                Start Shielding My Inbox
              </CTA>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Takes 60 seconds. No credit card required.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card-grad p-7 shadow-card">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent">
                <Fingerprint className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">What the scan reveals</div>
                <div className="text-xs text-muted-foreground">
                  Powered by Malwarebytes breach intelligence
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {exposedItems.map((it) => (
                <div
                  key={it.label}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 px-4 py-3"
                >
                  <it.icon className="h-4 w-4 flex-none text-accent" />
                  <span className="text-sm">{it.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-4 w-4 flex-none text-accent" />
                <div>
                  <div className="text-sm font-semibold">Knowing is only the first half.</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    After the scan, ShieldMail helps reduce future exposure by replacing your real
                    email with forwarding aliases on new signups.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  const cases = [
    {
      site: "Social Media",
      icon: Globe,
      example: "Signing up on Instagram, Twitter, or TikTok",
      real: [
        "Your real email is linked to your public profile",
        "Targeted ads follow you across platforms",
        "Data breach exposes your social + email identity",
      ],
      alias: [
        "Alias forwards DMs and notifications — your identity stays hidden",
        "Block alias anytime if spam or harassment starts",
        "Breach? The exposed address is an alias you can disable",
      ],
    },
    {
      site: "Online Shopping",
      icon: ShoppingBag,
      example: "Creating an account on Amazon, eBay, or niche stores",
      real: [
        "Retailer sells your email to 3rd-party marketers",
        "Order updates mixed with endless promo spam",
        "Breach leaks purchase history tied to your real identity",
      ],
      alias: [
        "One alias per store — know exactly who leaked your data",
        "Promo spam? Kill the alias, never see another coupon",
        "Purchase history stays unlinked from your real identity",
      ],
    },
    {
      site: "Dating Apps",
      icon: Heart,
      example: "Registering on Tinder, Bumble, or Hinge",
      real: [
        "Real email tied to dating profile = easy doxxing",
        "App breach exposes intimate preferences & location",
        "Stalkers can reverse-search your email to find your workplace",
      ],
      alias: [
        "Chat and match notifications forward through a dedicated alias",
        "If things go south, disable the alias. They can't reach you again",
        "Dating data breaches expose the alias instead of your primary inbox",
      ],
    },
    {
      site: "Forums & Communities",
      icon: MessageSquare,
      example: "Joining Reddit, Discord, or niche hobby groups",
      real: [
        "Forum data breach ties your username to real email & identity",
        "Trolls and scammers scrape member emails for phishing",
        "Political or sensitive discussions linked to your real name",
      ],
      alias: [
        "Participate with an alias instead of putting your primary address on file",
        "One alias per community. If one forum leaks, the others stay safe",
        "Scammers get a dead-end address instead of your inbox",
      ],
    },
    {
      site: "Newsletters & Blogs",
      icon: Mail,
      example: "Subscribing to tech blogs, deals, or creators",
      real: [
        "One signup = your email sold to 10+ marketing networks",
        'Inbox flooded with "partner offers" you never agreed to',
        "Unsubscribe links intentionally broken or ignored",
      ],
      alias: [
        "Subscribe to everything. One click blocks the alias if it gets spammy",
        "No unsubscribe loops — just disable and move on",
        "Your real inbox stays clean. Only wanted mail gets through",
      ],
    },
    {
      site: "Job Boards",
      icon: Lock,
      example: "Uploading resume on LinkedIn, Indeed, or niche boards",
      real: [
        "Recruitment firms scrape and resell your contact info",
        "Fake job offers turn into phishing attacks on your real email",
        "Employment history tied to a single address = easy social engineering",
      ],
      alias: [
        "One alias per job search. Close it once you're hired",
        "Recruiters can't follow you after the search ends",
        "Phishing emails hit a disposable address — your real inbox stays safe",
      ],
    },
  ];
  return (
    <section className="border-t border-border bg-surface/30">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>Real-World Protection</SectionLabel>
          <h2 className="text-4xl font-bold md:text-5xl">What you're risking on everyday sites.</h2>
          <p className="mt-4 text-muted-foreground">
            Every account you create is a potential leak. Here's how ShieldMail reduces unnecessary
            exposure on the sites you use daily.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <div
              key={c.site}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card-grad p-6 shadow-card transition-all hover:-translate-y-1 hover:border-accent/40"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent">
                  <c.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">{c.site}</h3>
                  <p className="text-xs font-medium leading-5 text-foreground/85">{c.example}</p>
                </div>
              </div>
              <div className="rounded-xl border border-red-400/40 bg-red-950/25 p-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-200">
                  <EyeOff className="h-3.5 w-3.5" /> With Real Email
                </div>
                <ul className="space-y-1.5">
                  {c.real.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs leading-5 text-foreground/90"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 flex-none text-red-200" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-3 rounded-xl border border-emerald-300/40 bg-emerald-950/25 p-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-200">
                  <Shield className="h-3.5 w-3.5" /> With ShieldMail
                </div>
                <ul className="space-y-1.5">
                  {c.alias.map((a, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs leading-5 text-foreground/90"
                    >
                      <Check className="mt-0.5 h-3 w-3 flex-none text-emerald-200" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-grad text-primary-foreground">
            <Shield className="h-4 w-4" strokeWidth={2.5} />
          </span>
          ShieldMail
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <a href="#how" className="hover:text-foreground">
            How it works
          </a>
          <a href="#pricing" className="hover:text-foreground">
            Pricing
          </a>
          <a href="#faq" className="hover:text-foreground">
            FAQ
          </a>
        </nav>
        <a
          href="https://app.shieldme.cc/login"
          className="hidden text-sm font-medium text-muted-foreground hover:text-foreground md:inline-flex"
        >
          Sign In
        </a>
        <CTA href="https://app.shieldme.cc/register" className="!px-5 !py-2 text-xs">
          Get Protected
        </CTA>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-hero">
      <div className="absolute inset-0 grid-bg" />
      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 md:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <Badge>
            <Sparkles className="h-3 w-3 text-accent" />
            Privacy-first email aliasing
          </Badge>

          <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
            Your inbox is being{" "}
            <span className="relative whitespace-nowrap">
              <span className="bg-gradient-to-r from-accent to-accent-glow bg-clip-text text-transparent">
                harvested
              </span>
              <svg
                className="absolute -bottom-2 left-0 w-full"
                height="10"
                viewBox="0 0 200 10"
                fill="none"
              >
                <path
                  d="M2 7 Q 50 1, 100 5 T 198 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-accent/60"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </span>{" "}
            right now.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Every signup hands strangers your real email — forever. ShieldMail gives you{" "}
            <span className="text-foreground font-medium">private aliases</span> so your inbox
            receives forwarded mail without being shared at every signup.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CTA href="#pricing">
              Protect My Inbox <ArrowRight className="h-4 w-4" />
            </CTA>
            <CTA href="#features" variant="ghost">
              See How It Works
            </CTA>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card required to start · Cancel anytime
          </p>
        </div>

        {/* Visual */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="rounded-2xl border border-border bg-card-grad p-6 shadow-card md:p-8">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-destructive">
                  <EyeOff className="h-4 w-4" /> Without ShieldMail
                </div>
                <div className="font-mono text-sm text-foreground">you@gmail.com</div>
                <ul className="mt-4 space-y-2 text-sm font-medium leading-6 text-foreground">
                  <li className="flex gap-2">
                    <span className="text-destructive">↳</span> Newsletter sells it
                  </li>
                  <li className="flex gap-2">
                    <span className="text-destructive">↳</span> App gets breached
                  </li>
                  <li className="flex gap-2">
                    <span className="text-destructive">↳</span> Spammers add you to 40 lists
                  </li>
                  <li className="flex gap-2 font-semibold text-red-200">
                    <span>↳</span> Real inbox: ruined forever
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-accent/40 bg-accent/5 p-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                  <Shield className="h-4 w-4" /> With ShieldMail
                </div>
                <div className="font-mono text-sm text-foreground">k7q2x@shieldmail.vip</div>
                <ul className="mt-4 space-y-2 text-sm font-medium leading-6 text-foreground">
                  <li className="flex gap-2">
                    <span className="text-accent">↳</span> Forwards to your real inbox
                  </li>
                  <li className="flex gap-2">
                    <span className="text-accent">↳</span> Spam? One click to kill it
                  </li>
                  <li className="flex gap-2">
                    <span className="text-accent">↳</span> Breach? Instant alert
                  </li>
                  <li className="flex gap-2 font-semibold text-accent-glow">
                    <span>↳</span> Real inbox: invisible & clean
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Problem() {
  const items = [
    {
      icon: Eye,
      title: "Every signup exposes you",
      body: "The moment you enter your real email, it can be sold, leaked, or breached. You lose control — permanently.",
    },
    {
      icon: AlertTriangle,
      title: "Spam & phishing never stop",
      body: "Once spammers have your address, inbox flooding and targeted phishing follow you for years with no way to cut them off.",
    },
    {
      icon: Globe,
      title: "Breaches link your identity",
      body: "When the same email appears across dozens of breach databases, anyone can map your accounts, habits, and location.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <SectionLabel>The Problem</SectionLabel>
        <h2 className="text-4xl font-bold md:text-5xl">
          Your real email is a liability you hand out daily.
        </h2>
        <p className="mt-4 text-muted-foreground">
          The average person enters their email into 130+ services over a lifetime. Each one is a
          door left unlocked.
        </p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.title}
            className="rounded-2xl border border-border bg-card-grad p-6 shadow-card"
          >
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-destructive/15 text-destructive">
              <it.icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold">{it.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{it.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card-grad p-8 md:p-10">
        <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
          <div className="text-center md:text-left">
            <div className="font-display text-5xl font-bold text-accent">One alias</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              per signup
            </div>
          </div>
          <p className="text-lg text-muted-foreground md:border-l md:border-border md:pl-8">
            of email users have had their address exposed in at least one data breach — and most
            don't find out until the damage is already done.{" "}
            <span className="text-foreground">
              You can stop being one of them in the next 60 seconds.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: Mail,
      title: "Unlimited Aliases",
      tag: "Real email → Hidden → Alias forwards",
      body: "Create a unique alias for every site, app, or newsletter. Your real address never leaves ShieldMail. One click to generate, one click to kill.",
    },
    {
      icon: Zap,
      title: "One-Click Creation",
      tag: "Right-click → New alias → Done",
      body: "Browser extension or web dashboard — generate a fresh alias in under 3 seconds. Works anywhere you'd type an email.",
    },
    {
      icon: Ban,
      title: "Instant Alias Blocking",
      tag: "Spam detected → Block → Silence",
      body: "If an alias starts getting abused, disable it instantly. No unsubscribe loops. No begging. Just silence.",
    },
    {
      icon: Lock,
      title: "Encrypted Forwarding",
      tag: "Inbound → Encrypted → Your inbox",
      body: "Forwarded mail uses TLS in transit, with optional recipient OpenPGP encryption when configured. Alias replies are designed to keep your primary address out of normal sender-facing flows.",
    },
    {
      icon: BellRing,
      title: "Pair With Free Breach Monitors",
      tag: "Firefox Monitor · Google Password Checkup",
      body: "We recommend layering ShieldMail with free tools like Mozilla's Firefox Monitor (monitor.firefox.com) and Google Password Checkup so you're alerted the moment any address or password appears in a public breach.",
    },

    {
      icon: Inbox,
      title: "Works With Any Inbox",
      tag: "Gmail · Outlook · Apple Mail",
      body: "ShieldMail sits silently in front of your existing inbox. Keep your workflow — just stop handing out your real address.",
    },
  ];
  return (
    <section id="features" className="border-t border-border bg-surface/30">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>The Solution</SectionLabel>
          <h2 className="text-4xl font-bold md:text-5xl">One alias. Less unnecessary exposure.</h2>
          <p className="mt-4 text-muted-foreground">
            Six layers of protection working silently behind every email you send.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card-grad p-6 shadow-card transition-all hover:-translate-y-1 hover:border-accent/40"
            >
              <div className="absolute right-4 top-4 font-mono text-xs text-muted-foreground/60">
                0{i + 1}
              </div>
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-accent/15 text-accent">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 font-mono text-xs text-accent/80">{f.tag}</p>
              <p className="mt-3 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <CTA>
            Start Protecting My Inbox <ArrowRight className="h-4 w-4" />
          </CTA>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Install in 30 seconds",
      body: "Add the browser extension or open the dashboard. No account migration. No email rerouting.",
    },
    {
      n: "02",
      title: "Generate aliases on demand",
      body: "Anywhere a signup form asks for email, click once. A unique alias is created and pre-filled.",
    },
    {
      n: "03",
      title: "Mail forwards to you",
      body: "Every message forwards to your real inbox, with the alias visible so you know which signup it came from.",
    },
    {
      n: "04",
      title: "Kill abused aliases instantly",
      body: "Spotted spam? Disable the alias with one click. The spam stops the same second.",
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <SectionLabel>How It Works</SectionLabel>
        <h2 className="text-4xl font-bold md:text-5xl">From exposed to invisible in 60 seconds.</h2>
      </div>
      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.n} className="relative">
            <div className="rounded-2xl border border-border bg-card-grad p-6 shadow-card">
              <div className="font-display text-3xl font-bold text-accent">{s.n}</div>
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="absolute -right-3 top-1/2 hidden h-5 w-5 text-accent/60 lg:block" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    {
      name: "Free",
      price: "$0",
      year: "Free forever — no credit card",
      note: "Try it risk-free",
      features: [
        "10 active aliases",
        "1 custom domain",
        "1 recipient",
        "OpenPGP encrypted forwarding",
        "Instant alias blocking",
        "Works with any inbox",
      ],
      cta: "Start Free",
    },
    {
      name: "Basic",
      price: "$4",
      year: "Billed once — full year of protection",
      note: "About a cent a day",
      features: ["Everything in Free", "50 active aliases", "3 custom domains", "5 recipients"],
      cta: "Get Basic",
    },
    {
      name: "Shield",
      price: "$10",
      year: "Billed once — full year of protection",
      note: "Under $1/month",
      features: [
        "Unlimited aliases",
        "5 custom domains",
        "Priority support",
        "15 recipients",
        "Chat customer support",
      ],
      cta: "Protect My Inbox",
      featured: true,
    },
  ];
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <SectionLabel>Pricing</SectionLabel>
        <h2 className="text-4xl font-bold md:text-5xl">Simple, transparent pricing.</h2>
        <p className="mt-4 text-muted-foreground">
          Start free with 10 aliases. Upgrade any time. No hidden fees, no data harvesting, no
          compromises.
        </p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`relative flex flex-col rounded-2xl border bg-card-grad p-7 shadow-card ${
              p.featured ? "border-accent shadow-glow md:-translate-y-3" : "border-border"
            }`}
          >
            {p.featured && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-grad px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground">
                Most Popular
              </div>
            )}
            <div className="text-sm font-semibold uppercase tracking-wider text-foreground/75">
              {p.name}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-display text-5xl font-bold">{p.price}</span>
              <span className="text-foreground/75">/year</span>
            </div>
            <div className="text-xs text-foreground/75">{p.year}</div>
            <div className="mt-1 text-xs font-medium text-accent">{p.note}</div>
            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-accent" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <CTA
              href="https://app.shieldme.cc/register"
              variant={p.featured ? "primary" : "ghost"}
              className="mt-7 w-full"
            >
              {p.cta}
            </CTA>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card-grad p-6 text-center md:flex-row md:text-left">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent/15 text-accent">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold">Simple yearly plans</div>
          <div className="text-sm text-muted-foreground">
            Start free, then upgrade to Basic or Shield when you need more domains, recipients, or
            alias capacity.
          </div>
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  const rows = [
    ["Unlimited aliases", true, false],
    ["Instant alias blocking", true, false],
    ["Encrypted forwarding", true, "Partial"],
    ["Breach alerts on aliases", true, false],
    ["Custom domains", true, false],
    ["Forwarding-first privacy controls", true, false],
    ["Works with Gmail / Outlook / Apple Mail", true, true],
  ];
  return (
    <section className="border-t border-border bg-surface/30">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>Comparison</SectionLabel>
          <h2 className="text-4xl font-bold md:text-5xl">Why people switch to ShieldMail.</h2>
        </div>
        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card-grad shadow-card">
          <div className="grid grid-cols-[1.5fr_1fr_1fr] border-b border-border bg-surface-2 px-5 py-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <div>Feature</div>
            <div className="text-center text-accent">ShieldMail</div>
            <div className="text-center">Free forwarders</div>
          </div>
          {rows.map(([label, a, b], i) => (
            <div
              key={i}
              className="grid grid-cols-[1.5fr_1fr_1fr] items-center border-b border-border px-5 py-4 text-sm last:border-0"
            >
              <div className="font-medium">{label as string}</div>
              <div className="text-center">{renderCell(a)}</div>
              <div className="text-center">{renderCell(b)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function renderCell(v: unknown) {
  if (v === true) return <Check className="mx-auto h-5 w-5 text-accent" />;
  if (v === false) return <span className="text-muted-foreground/60">—</span>;
  return <span className="text-xs text-muted-foreground">{String(v)}</span>;
}

function FAQ() {
  const faqs = [
    {
      q: "Will senders see a weird address when I reply?",
      a: "Not yet. Current ShieldMail forwarding protects your real inbox for incoming mail. Reply-from-alias is not advertised until that workflow is built end-to-end.",
    },
    {
      q: "Does ShieldMail store my emails?",
      a: "Absolutely not. We operate a strict zero-store policy. Emails are forwarded in real time and never retained on our servers. We can't read your mail, and we have nothing to hand over if ever asked — because nothing is stored.",
    },
    {
      q: "Can I use my own custom domain for aliases?",
      a: "Yes. Free includes 1 custom domain, Basic includes 3 custom domains, and Shield includes 3 custom domains with higher alias and recipient capacity.",
    },
    {
      q: "Is there a free plan?",
      a: "Yes. Free is available with core alias protection. Basic and Shield are yearly upgrades for more capacity.",
    },
    {
      q: "Does it work with Gmail, Outlook, and Apple Mail?",
      a: "Yes — ShieldMail works with every email client and provider. It sits in front of your existing inbox. There's nothing to install in Gmail or Outlook. Your workflow stays exactly the same.",
    },
    {
      q: "What happens to existing aliases if I cancel?",
      a: "They keep forwarding for 30 days after cancellation so nothing breaks immediately. You can re-enable any time, or export the alias list before they go inactive.",
    },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
      <div className="text-center">
        <SectionLabel>FAQ</SectionLabel>
        <h2 className="text-4xl font-bold md:text-5xl">Got questions.</h2>
      </div>
      <div className="mt-10 space-y-3">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div
              key={f.q}
              className="overflow-hidden rounded-2xl border border-border bg-card-grad"
            >
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium"
              >
                <span>{f.q}</span>
                <ChevronDown
                  className={`h-5 w-5 flex-none text-accent transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen && <div className="px-5 pb-5 text-sm text-muted-foreground">{f.a}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="relative overflow-hidden border-t border-border bg-hero">
      <div className="absolute inset-0 grid-bg" />
      <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
        <SectionLabel>Get Started</SectionLabel>
        <h2 className="text-4xl font-bold md:text-6xl">
          Stop handing strangers your real email address.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Take back control of your inbox. Your first alias is ready in under 30 seconds.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <CTA href="https://app.shieldme.cc/register">
            Protect My Inbox <ArrowRight className="h-4 w-4" />
          </CTA>
          <CTA href="#pricing" variant="ghost">
            Compare plans
          </CTA>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-accent" /> 30-day refund
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-accent" /> No credit card to start
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-accent" /> Cancel anytime
          </span>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2 font-display font-bold text-foreground">
          <Shield className="h-4 w-4 text-accent" /> ShieldMail
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> © {new Date().getFullYear()} ShieldMail
          </span>
          <a href="/security" className="hover:text-accent">
            Security
          </a>
          <a href="/privacy" className="hover:text-accent">
            Privacy
          </a>
          <a href="/mail-security" className="hover:text-accent">
            Mail security
          </a>
        </div>
      </div>
    </footer>
  );
}
