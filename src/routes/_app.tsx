import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { tokenStore } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  Shield,
  LayoutDashboard,
  Globe,
  Users,
  Mail,
  Settings,
  ShieldAlert,
  LogOut,
  Menu,
  CreditCard,
  MailX,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    // Only redirect on client — localStorage is unavailable during SSR
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "shieldme.cc" || host === "www.shieldme.cc") {
        window.location.replace(
          "https://app.shieldme.cc" + window.location.pathname + window.location.search,
        );
        return;
      }
      if (!tokenStore.getAccess()) {
        throw redirect({ to: "/login" });
      }
    }
  },
  component: AppLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { to: "/aliases", label: "Aliases", icon: Mail, adminOnly: false },
  { to: "/domains", label: "Domains", icon: Globe, adminOnly: false },
  { to: "/recipients", label: "Recipients", icon: Users, adminOnly: false },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: false },
  { to: "/subscription", label: "Subscription", icon: CreditCard, adminOnly: false },
  { to: "/failed-deliveries", label: "Failed Deliveries", icon: MailX, adminOnly: false },
  { to: "/admin", label: "Admin", icon: ShieldAlert, adminOnly: true },
];

function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {open && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
      )}
      <aside
        id="app-navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-surface transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 px-5 font-display text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-grad text-primary-foreground">
            <Shield className="h-4 w-4" strokeWidth={2.5} />
          </span>
          ShieldMail
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {NAV.filter((item) => !item.adminOnly || user?.role === "admin").map(
            ({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  location.pathname === to
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            ),
          )}
        </nav>
        <div className="border-t border-border px-3 py-3">
          <div className="mb-2 truncate px-3 text-xs text-muted-foreground">{user?.email}</div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col lg:pl-60">
        <header className="flex h-14 items-center gap-3 border-b border-border px-4 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="app-navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display font-bold">ShieldMail</span>
        </header>
        <main className="flex-1 px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
