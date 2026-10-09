// src/components/outing/Expenses.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import BottomSheet from "@/components/shell/BottomSheet";
import { api, type OutingView } from "@/lib/api";
import { formatRupees, parseRupees } from "@/lib/money";
import type { Act } from "./OutingScreen";

const field = "min-h-12 w-full rounded-2xl border border-line bg-canvas px-4 outline-none focus:border-amber";

export default function Expenses({ view, act }: { view: OutingView; act: Act }) {
  const { outing, me, members, expenses, transfers, rsvps } = view;
  const first = (id: string) => members.find((m) => m.id === id)?.name.split(" ")[0] ?? "Someone";
  const goingIds = rsvps.filter((r) => r.status === "going").map((r) => r.userId);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [split, setSplit] = useState<string[]>(goingIds.includes(me.id) ? goingIds : [me.id, ...goingIds]);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const paise = parseRupees(amount);
    if (!paise) return setError("Enter an amount.");
    if (await act(() => api.addExpense(outing.id, { amount: paise, note, stopIndex: null, splitAmong: split }))) {
      setOpen(false);
      setAmount("");
      setNote("");
      setError(null);
    }
  }

  return (
    <section className="mt-8 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Expenses</h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Add expense</Button>
      </div>
      {expenses.length === 0 && <p className="text-sm text-cream-dim">Nothing logged yet.</p>}
      <ul className="space-y-1.5">
        {expenses.map((e) => (
          <li key={e.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{e.note} · paid by {first(e.paidById)}</span>
            <span className="flex items-center gap-2">
              {formatRupees(e.amount)}
              {(e.paidById === me.id || me.role === "admin") && (
                <button aria-label={`Delete ${e.note}`} className="min-h-11 min-w-11 px-2 text-cream-faint" onClick={() => act(() => api.deleteExpense(outing.id, e.id))}>✕</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {transfers.length > 0 && (
        <div className="rounded-2xl bg-surface p-4">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-cream-faint">Settle up</h3>
          <ul className="space-y-1 text-sm">
            {transfers.map((t, i) => <li key={i}>{first(t.from)} pays {first(t.to)} {formatRupees(t.amount)}</li>)}
          </ul>
        </div>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add expense">
        <div className="space-y-3">
          <label className="block"><span className="mb-2 block text-sm text-cream-dim">Amount (₹)</span>
            <input aria-label="Amount (₹)" inputMode="decimal" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block"><span className="mb-2 block text-sm text-cream-dim">What for</span>
            <input aria-label="What for" className={field} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm text-cream-dim">Split between</legend>
            {members.map((m) => (
              <label key={m.id} className="flex min-h-11 items-center gap-3">
                <input type="checkbox" aria-label={`Split with ${m.name.split(" ")[0]}`} className="size-5 accent-amber"
                  checked={split.includes(m.id)}
                  onChange={(e) => setSplit(e.target.checked ? [...split, m.id] : split.filter((x) => x !== m.id))} />
                {m.name}
              </label>
            ))}
          </fieldset>
          {error && <p role="alert" className="text-sm text-line-coral">{error}</p>}
          <Button className="w-full" onClick={save} disabled={!note.trim() || split.length === 0}>Save expense</Button>
        </div>
      </BottomSheet>
    </section>
  );
}
