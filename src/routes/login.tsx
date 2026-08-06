import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useLogin } from "@/lib/api";
import { Btn, Field, TextInput } from "@/components/ui-kit";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 size-10 rounded-md bg-brand flex items-center justify-center">
            <div className="size-3 bg-neutral-50 rounded-full" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in to your ShieldMail account.</p>
        </div>

        <form
          className="space-y-4 bg-white ring-1 ring-black/10 rounded-xl p-6 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate(
              { email, password },
              {
                onSuccess: () => void router.navigate({ to: "/" }),
              },
            );
          }}
        >
          <Field label="Email">
            <TextInput
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          {login.isError ? (
            <p className="text-xs text-rose-600">
              {login.error instanceof Error ? login.error.message : "Sign in failed"}
            </p>
          ) : null}
          <Btn
            type="submit"
            variant="primary"
            disabled={!email.trim() || !password || login.isPending}
            className="w-full justify-center py-2"
          >
            {login.isPending ? "Signing in…" : "Sign in"}
          </Btn>
        </form>
      </div>
    </div>
  );
}
