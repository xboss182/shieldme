import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { tokenStore } from "../lib/api";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/_auth")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "shieldme.cc" || host === "www.shieldme.cc") {
        window.location.replace(
          "https://app.shieldme.cc" + window.location.pathname + window.location.search,
        );
        return;
      }
      if (tokenStore.getAccess()) {
        throw redirect({ to: "/dashboard" });
      }
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex items-center gap-2 font-display text-xl font-bold text-foreground">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-grad text-primary-foreground">
          <Shield className="h-5 w-5" strokeWidth={2.5} />
        </span>
        ShieldMail
      </div>
      <Outlet />
    </div>
  );
}
