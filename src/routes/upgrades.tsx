import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/upgrades")({
  beforeLoad: () => {
    throw redirect({ to: "/v2", replace: true });
  },
});
