import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";

export type Tone = "emerald" | "amber" | "rose" | "neutral" | "brand";

const toneRing: Record<Tone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-500/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-500/15",
  rose: "bg-rose-50 text-rose-700 ring-rose-500/15",
  neutral: "bg-neutral-100 text-neutral-500 ring-neutral-400/20",
  brand: "bg-brand/10 text-brand ring-brand/20",
};

const toneDot: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  neutral: "bg-neutral-300",
  brand: "bg-brand",
};

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="text-sm text-neutral-500 mt-1 text-pretty max-w-[60ch]">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  meta,
  action,
  children,
  padded = true,
}: {
  title?: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div className="bg-neutral-50 ring-1 ring-black/5 rounded-xl overflow-hidden">
      {title ? (
        <div className="px-6 py-4 border-b border-neutral-200/60 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <div className="flex items-center gap-4">
            {meta ? (
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                {meta}
              </span>
            ) : null}
            {action}
          </div>
        </div>
      ) : null}
      <div className={padded ? "p-6" : ""}>{children}</div>
    </div>
  );
}

export function StatusPill({
  tone = "neutral",
  dot = true,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 leading-none ${toneRing[tone]}`}
    >
      {dot ? <span className={`size-1.5 rounded-full ${toneDot[tone]}`} /> : null}
      {children}
    </span>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded ring-1 ${toneRing[tone]}`}
    >
      {children}
    </span>
  );
}

export function Btn({
  children,
  variant = "ghost",
  onClick,
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger";
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-transform active:translate-y-px disabled:opacity-40 disabled:pointer-events-none cursor-pointer";
  const styles = {
    primary: "bg-brand hover:bg-brand-hover text-white ring-1 ring-brand",
    ghost: "bg-neutral-50 hover:bg-neutral-100 text-neutral-600 ring-1 ring-black/5",
    danger: "bg-rose-50 hover:bg-rose-100 text-rose-600 ring-1 ring-rose-500/15",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1.5 text-[11px] text-neutral-400 text-pretty">{hint}</p> : null}
    </label>
  );
}

const controlCls =
  "w-full bg-white ring-1 ring-black/10 rounded-md px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand/40";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlCls} ${props.className ?? ""}`} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlCls} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlCls} font-mono text-xs ${props.className ?? ""}`} />;
}

export function UsageBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number;
}) {
  const pct = Math.min(100, Math.round((used / max) * 100));
  const tone = pct > 90 ? "bg-rose-500" : pct > 70 ? "bg-amber-500" : "bg-brand";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-neutral-500">{label}</span>
        <span className="text-xs font-mono text-neutral-500">
          {used.toLocaleString()} <span className="text-neutral-300">/</span> {max.toLocaleString()}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-neutral-200/70 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm font-medium text-neutral-600">{title}</p>
      <p className="mt-1 text-sm text-neutral-400 max-w-[48ch] mx-auto text-pretty">{description}</p>
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={`Copy ${label ?? value}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
      }}
      className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-700 cursor-pointer"
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      {label ? <span>{copied ? "Copied" : label}</span> : null}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer ${
        checked ? "bg-brand" : "bg-neutral-300"
      }`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all ${
          checked ? "left-[1.125rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/20 backdrop-blur-[2px] cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md bg-white ring-1 ring-black/10 rounded-xl shadow-xl max-h-[85vh] overflow-y-auto"
      >
        <div className="px-5 py-4 border-b border-neutral-200/70 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? (
              <p className="text-xs text-neutral-500 mt-0.5 text-pretty">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          variant="danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}

export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-4 py-2.5 font-medium text-[10px] uppercase tracking-widest text-neutral-400 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-neutral-100/30">{head}</tr>
        </thead>
        <tbody className="divide-y divide-neutral-950/5">{children}</tbody>
      </table>
    </div>
  );
}
