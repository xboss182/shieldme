import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  AtSign,
  Globe,
  Inbox,
  Settings,
  CreditCard,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

const primary = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/aliases", label: "Aliases", icon: AtSign },
  { to: "/domains", label: "Domains", icon: Globe },
  { to: "/recipients", label: "Recipients", icon: Inbox },
] as const;

const secondary = [
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/subscription", label: "Subscription", icon: CreditCard },
  { to: "/failed-deliveries", label: "Failed Deliveries", icon: AlertTriangle },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <aside className="w-64 shrink-0 border-r border-neutral-200 bg-neutral-50/50 flex flex-col">
      <div className="p-6">
        <div className="flex items-center gap-2 px-2">
          <div className="size-6 rounded-md bg-brand flex items-center justify-center">
            <div className="size-2 bg-neutral-50 rounded-full" />
          </div>
          <span className="font-semibold tracking-tight text-neutral-900">ShieldMail</span>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {primary.map((item) => (
          <NavLink key={item.to} {...item} active={isActive(item.to)} />
        ))}

        <div className="my-4 h-px bg-neutral-200/60 mx-3" />

        {secondary.map((item) => (
          <NavLink key={item.to} {...item} active={isActive(item.to)} />
        ))}
      </nav>

      <div className="p-3 border-t border-neutral-200/60">
        <Link
          to="/admin"
          className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            isActive("/admin")
              ? "bg-neutral-200/50 text-neutral-900"
              : "text-neutral-500 hover:bg-neutral-200/30"
          }`}
        >
          <ShieldCheck className="size-4 shrink-0 text-neutral-500" />
          <span className="flex-1">Admin Console</span>
          <span className="text-[9px] font-mono uppercase tracking-widest bg-neutral-900/5 text-neutral-500 px-1.5 py-0.5 rounded ring-1 ring-neutral-400/20">
            Root
          </span>
        </Link>
      </div>
    </aside>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
        active
          ? "bg-neutral-200/50 text-neutral-900"
          : "text-neutral-500 hover:bg-neutral-200/30 hover:text-neutral-900"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  );
}
