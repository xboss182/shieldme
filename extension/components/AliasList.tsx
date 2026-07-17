import React, { useCallback, useEffect, useState } from "react";
import { listAliases, enableAlias, disableAlias, Alias } from "../lib/api";

interface Props {
  token: string;
  refreshTrigger: number;
}

export default function AliasList({ token, refreshTrigger }: Props) {
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listAliases(token);
      setAliases(list.slice(0, 10));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load aliases");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [refreshTrigger, load]);

  async function toggle(alias: Alias) {
    setToggling(alias.id);
    try {
      const updated = alias.enabled
        ? await disableAlias(token, alias.id)
        : await enableAlias(token, alias.id);
      setAliases((prev) => prev.map((a) => (a.id === alias.id ? updated : a)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setToggling(null);
    }
  }

  async function copyAddress(address: string) {
    await navigator.clipboard.writeText(address);
    setCopied(address);
    setTimeout(() => setCopied(null), 1500);
  }

  if (loading)
    return <div className="px-4 py-6 text-center text-sm text-gray-400">Loading aliases…</div>;

  if (error)
    return <div className="px-4 py-3 text-xs text-red-600 bg-red-50 rounded mx-4">{error}</div>;

  if (aliases.length === 0)
    return (
      <div className="px-4 py-6 text-center text-sm text-gray-400">
        No aliases yet. Create one above.
      </div>
    );

  return (
    <div className="flex flex-col divide-y divide-gray-100">
      {aliases.map((alias) => {
        const address = alias.address ?? `${alias.localPart}@${alias.domain}`;
        return (
          <div key={alias.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50">
            <div className="flex-1 min-w-0">
              <button
                onClick={() => copyAddress(address)}
                className="text-xs text-gray-700 font-mono truncate block w-full text-left hover:text-shield-600"
                title="Click to copy"
              >
                {copied === address ? "✓ Copied!" : address}
              </button>
              {alias.label && <span className="text-xs text-gray-400">{alias.label}</span>}
            </div>
            <button
              onClick={() => toggle(alias)}
              disabled={toggling === alias.id}
              title={alias.enabled ? "Disable alias" : "Enable alias"}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
                alias.enabled ? "bg-shield-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  alias.enabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
