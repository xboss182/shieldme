import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — ShieldMail" },
      {
        name: "description",
        content:
          "Real-time telemetry for ShieldMail: active aliases, forwarded volume, threats blocked, and PGP protection.",
      },
      { property: "og:title", content: "Dashboard — ShieldMail" },
      {
        property: "og:description",
        content:
          "Real-time telemetry for ShieldMail: active aliases, forwarded volume, threats blocked, and PGP protection.",
      },
    ],
  }),
  component: DashboardPage,
});

const primarySpark1 = [40, 60, 45, 90, 70, 55];
const primarySpark2 = [20, 35, 80, 65, 45, 95];
const primarySpark3 = [30, 40, 20, 50, 70, 10];

type Alias = {
  status: "active" | "warn" | "disabled";
  address: string;
  forwardTo: string;
  forwarded: number;
  blocked: number;
  spam: number;
  security: "pgp" | "admin" | "disabled";
};

const aliases: Alias[] = [
  {
    status: "active",
    address: "shopping.xk89@shield.mail",
    forwardTo: "personal.inbox@gmail.com",
    forwarded: 142,
    blocked: 0,
    spam: 12,
    security: "pgp",
  },
  {
    status: "active",
    address: "news.v8s2@shield.mail",
    forwardTo: "personal.inbox@gmail.com",
    forwarded: 84,
    blocked: 3,
    spam: 0,
    security: "admin",
  },
  {
    status: "active",
    address: "signup.p04q@shield.mail",
    forwardTo: "vault@fastmail.net",
    forwarded: 39,
    blocked: 1,
    spam: 4,
    security: "pgp",
  },
  {
    status: "disabled",
    address: "old.service.q12@shield.mail",
    forwardTo: "work.backup@co.uk",
    forwarded: 0,
    blocked: 0,
    spam: 0,
    security: "disabled",
  },
];

function DashboardPage() {
  return (
    <AppShell>
      <div className="p-8 max-w-7xl w-full mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">System Overview</h1>
          <p className="text-sm text-neutral-500 mt-1 text-pretty max-w-[56ch]">
            Real-time telemetry for your email shield and active aliases.
          </p>
        </div>

        {/* Primary KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <KpiCard
            label="Active Aliases"
            badge="96% UTIL"
            value="482"
            suffix="/ 500"
            spark={primarySpark1}
            sparkTone="emerald"
          />
          <KpiCard
            label="Forwarded"
            badge="30D VOLUME"
            value="12,492"
            trend="+12%"
            spark={primarySpark2}
            sparkTone="neutral"
          />
          <KpiCard
            label="Threats Blocked"
            signalDot
            value="1,102"
            suffix="QUARANTINED"
            subline="742 policy · 360 spam"
            spark={primarySpark3}
            sparkTone="neutral"
          />
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <MiniTile label="Verified Domains" value="04" />
          <MiniTile label="Recipients" value="02" />
          <MiniTile label="PGP Protected" value="124" tag="SECURE" tagTone="emerald" />
          <SpamTile />
        </div>

        {/* Recent Aliases */}
        <div className="bg-neutral-50 ring-1 ring-black/5 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200/60 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent Aliases</h2>
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                {aliases.length} of 482 shown
              </span>
              <a
                href="/aliases"
                className="text-xs font-medium text-brand hover:underline underline-offset-4"
              >
                View all aliases
              </a>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-neutral-100/30 text-[10px] uppercase tracking-widest text-neutral-400">
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Address / Forward-To</th>
                  <th className="px-6 py-3 font-medium text-right">Forwarded</th>
                  <th className="px-6 py-3 font-medium text-right">Blocked</th>
                  <th className="px-6 py-3 font-medium text-right">Spam</th>
                  <th className="px-6 py-3 font-medium">Security</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-950/5">
                {aliases.map((a) => (
                  <AliasRow key={a.address} alias={a} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function KpiCard({
  label,
  badge,
  signalDot,
  value,
  suffix,
  trend,
  subline,
  spark,
  sparkTone,
}: {
  label: string;
  badge?: string;
  signalDot?: boolean;
  value: string;
  suffix?: string;
  trend?: string;
  subline?: string;
  spark: number[];
  sparkTone: "emerald" | "neutral";
}) {
  return (
    <div className="bg-neutral-50 ring-1 ring-black/5 rounded-xl p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
          {label}
        </span>
        {badge ? (
          <span className="text-[10px] font-mono bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-400">
            {badge}
          </span>
        ) : null}
        {signalDot ? (
          <div className="size-2 rounded-full bg-amber-500/20 ring-1 ring-amber-500/40" />
        ) : null}
      </div>

      <div className="flex items-baseline gap-2 font-mono">
        <span className="text-3xl tracking-tight font-medium">{value}</span>
        {suffix ? <span className="text-xs text-neutral-400 font-medium">{suffix}</span> : null}
        {trend ? <span className="text-[11px] font-medium text-emerald-600">{trend}</span> : null}
      </div>
      {subline ? (
        <p className="mt-1 text-[11px] font-mono text-neutral-400 tracking-tight">{subline}</p>
      ) : null}

      <div className="mt-4 flex gap-1 items-end h-8">
        {spark.map((h, i) => {
          const peak = Math.max(...spark) === h;
          const cls =
            sparkTone === "emerald"
              ? peak
                ? "bg-emerald-500"
                : "bg-emerald-100"
              : peak
                ? "bg-neutral-900/20"
                : "bg-neutral-200/60";
          return (
            <div
              key={i}
              className={`w-full rounded-t-[1px] ${cls}`}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function MiniTile({
  label,
  value,
  tag,
  tagTone,
}: {
  label: string;
  value: string;
  tag?: string;
  tagTone?: "emerald";
}) {
  return (
    <div className="bg-neutral-50 ring-1 ring-black/5 rounded-xl p-4">
      <p className="text-[11px] font-medium text-neutral-400 uppercase">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-xl font-mono">{value}</p>
        {tag ? (
          <span
            className={`text-[10px] font-medium ${
              tagTone === "emerald" ? "text-emerald-600" : "text-neutral-400"
            }`}
          >
            {tag}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SpamTile() {
  const legend = [
    { label: "Rej", value: "660", cls: "bg-neutral-800" },
    { label: "Quar", value: "276", cls: "bg-neutral-400" },
    { label: "Tag", value: "166", cls: "bg-neutral-200" },
  ];
  return (
    <div className="bg-neutral-50 ring-1 ring-black/5 rounded-xl p-4">
      <p className="text-[11px] font-medium text-neutral-400 uppercase">Spam (Rej/Quar/Tag)</p>
      <div className="mt-2 h-2 w-full flex rounded-full overflow-hidden">
        <div className="h-full bg-neutral-800" style={{ width: "60%" }} />
        <div className="h-full bg-neutral-400" style={{ width: "25%" }} />
        <div className="h-full bg-neutral-200" style={{ width: "15%" }} />
      </div>
      <div className="mt-2 flex items-center gap-3">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`size-1.5 rounded-full ${l.cls}`} />
            <span className="text-[10px] font-mono text-neutral-500">
              {l.label} <span className="text-neutral-400">{l.value}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AliasRow({ alias }: { alias: Alias }) {
  const statusDot =
    alias.status === "active"
      ? "bg-emerald-500"
      : alias.status === "warn"
        ? "bg-amber-500"
        : "bg-neutral-300";
  const muted = alias.status === "disabled";

  return (
    <tr>
      <td className="px-6 py-4">
        <div className={`size-2 rounded-full ${statusDot}`} />
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span
            className={`text-sm font-medium font-mono ${muted ? "text-neutral-400" : "text-neutral-900"}`}
          >
            {alias.address}
          </span>
          <span className="text-xs text-neutral-400">{alias.forwardTo}</span>
        </div>
      </td>
      <td
        className={`px-6 py-4 text-right font-mono text-xs ${muted ? "text-neutral-400" : ""}`}
      >
        {alias.forwarded}
      </td>
      <td
        className={`px-6 py-4 text-right font-mono text-xs ${
          muted ? "text-neutral-400" : alias.blocked > 0 ? "text-amber-600" : ""
        }`}
      >
        {alias.blocked}
      </td>
      <td
        className={`px-6 py-4 text-right font-mono text-xs ${muted ? "text-neutral-400" : ""}`}
      >
        {alias.spam}
      </td>
      <td className="px-6 py-4">
        {alias.security === "pgp" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-medium tracking-wide">
            PGP
          </span>
        )}
        {alias.security === "admin" && (
          <div className="flex items-center gap-1">
            <div className="size-1 rounded-full bg-amber-500" />
            <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-tight">
              Admin Only Access
            </span>
          </div>
        )}
        {alias.security === "disabled" && (
          <span className="text-[10px] text-neutral-300 uppercase font-medium">Disabled</span>
        )}
      </td>
    </tr>
  );
}
