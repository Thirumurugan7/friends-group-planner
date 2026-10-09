"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type OutingView } from "@/lib/api";
import { Button } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import StatusChip from "@/components/shell/StatusChip";
import CollectSection from "./CollectSection";
import VotingSection from "./VotingSection";
import LockedSection from "./LockedSection";
import OutcomeSummary from "./OutcomeSummary";
import Expenses from "./Expenses";
import { prettyDate } from "./labels";

export type Act = (fn: () => Promise<unknown>) => Promise<boolean>;

export default function OutingScreen({ id }: { id: string }) {
  const [view, setView] = useState<OutingView | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setView(await api.outing(id));
      // The service worker may answer from cache; trust the browser's online flag.
      setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setOffline(true);
    }
  }, [id]);

  // Initial fetch: state is set after the awaited request, not synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const generating = view?.options.some((o) => o.status === "generating") ?? false;
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [generating, load]);

  const act: Act = async (fn) => {
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  };

  if (missing) return <p className="mt-10 text-center text-cream-dim">Outing not found.</p>;
  if (!view) return <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface" />;

  const { outing, me } = view;
  const finished = ["completed", "failed", "cancelled"].includes(outing.status);

  return (
    <>
      <header className="mb-5">
        <Link href={`/groups/${outing.groupId}`} className="text-sm text-cream-faint">← {outing.groupName}</Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl">{outing.title}</h1>
          <StatusChip status={outing.status} />
        </div>
        <p className="text-sm text-cream-dim">
          {outing.date ? prettyDate(outing.date) : `${prettyDate(outing.rangeStart)} – ${prettyDate(outing.rangeEnd)}`}
          {outing.groupHomeBy && ` · everyone home by ${outing.groupHomeBy}`}
        </p>
        {offline && <p role="status" className="mt-2 text-xs text-amber">Offline — showing the last saved plan.</p>}
      </header>

      {error && (
        <button type="button" role="alert" onClick={() => setError(null)}
          className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[60] mx-auto max-w-md rounded-2xl border border-line-coral bg-canvas px-4 py-3 text-left text-sm text-line-coral shadow-lg">
          {error}
        </button>
      )}

      {outing.status === "collecting" && <CollectSection view={view} act={act} />}
      {outing.status === "voting" && <VotingSection view={view} act={act} />}
      {outing.status === "locked" && <LockedSection view={view} act={act} />}
      {finished && <OutcomeSummary view={view} />}
      {["locked", "completed", "failed"].includes(outing.status) && <Expenses view={view} act={act} />}

      {me.canManage && !finished && (
        <div className="mt-10">
          <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>Cancel outing</Button>
        </div>
      )}
      <BottomSheet open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this outing?">
        <label className="mb-3 block">
          <span className="mb-2 block text-sm text-cream-dim">Reason (optional)</span>
          <input aria-label="Cancel reason" className="min-h-12 w-full rounded-2xl border border-line bg-canvas px-4" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <Button className="w-full" onClick={async () => { if (await act(() => api.cancel(outing.id, reason || undefined))) setCancelOpen(false); }}>
          Cancel this outing
        </Button>
      </BottomSheet>
    </>
  );
}
