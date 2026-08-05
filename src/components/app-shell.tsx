import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { AppSidebar } from "./app-sidebar";

export function AppShell({
  eyebrow = "Main Console",
  action,
  children,
}: {
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {

  return (
    <div className="flex min-h-screen bg-neutral-50 font-sans text-neutral-900">
      <AppSidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-neutral-200 bg-neutral-50/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="h-full px-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-neutral-400 uppercase tracking-widest">
                {eyebrow}
              </span>
              <div className="h-4 w-px bg-neutral-200" />
              <div className="flex items-center gap-2 bg-emerald-50 ring-1 ring-emerald-500/10 px-2.5 py-1 rounded-full">
                <div className="size-1.5 rounded-full bg-emerald-500 status-pulse" />
                <span className="text-[11px] font-medium text-emerald-700 leading-none">
                  Operational
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-neutral-200 outline outline-1 -outline-offset-1 outline-black/5" />
              {action ?? (
                <a
                  href="/aliases"
                  className="bg-brand hover:bg-brand-hover text-white text-sm font-medium py-2 pl-2 pr-3 rounded-md flex items-center gap-1.5 ring-1 ring-brand transition-transform active:translate-y-px cursor-pointer"
                >
                  <span className="size-4 shrink-0 bg-white/20 rounded-sm flex items-center justify-center">
                    <Plus className="size-3" />
                  </span>
                  New alias
                </a>
              )}

            </div>
          </div>
        </header>

        <div className="flex-1">{children}</div>
      </main>
    </div>
  );
}
