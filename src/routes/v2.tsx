import { createFileRoute, redirect } from "@tanstack/react-router";
import { tokenStore } from "../lib/api";
import { V2RelayDashboard } from "../components/v2-relay-dashboard";

export const Route = createFileRoute("/v2")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;

    // Auth tokens are intentionally scoped to the app origin. Never mount the
    // dashboard on the marketing origin, where it would issue unauthorized API calls.
    if (
      window.location.hostname === "shieldme.cc" ||
      window.location.hostname === "www.shieldme.cc"
    ) {
      window.location.replace("https://app.shieldme.cc/v2" + window.location.search);
      return;
    }
    if (!tokenStore.getAccess()) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "ShieldMail Dashboard" },
      {
        name: "description",
        content:
          "ShieldMail dashboard for aliases, domains, recipients, delivery controls, and account settings.",
      },
    ],
  }),
  component: V2RelayDashboard,
});
