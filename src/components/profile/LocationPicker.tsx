"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api, type GeoResult } from "@/lib/api";

const LeafletPicker = dynamic(() => import("./LeafletPicker"), {
  ssr: false,
  loading: () => <div className="h-44 w-full animate-pulse rounded-2xl bg-surface" />,
});

export interface Place { lat: number; lng: number; label: string }

export default function LocationPicker({
  which, value, onChange,
}: { which: "Home" | "Work"; value: Place | null; onChange: (p: Place) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);

  useEffect(() => {
    if (q.trim().length < 3) return;
    let stale = false;
    const t = setTimeout(() => {
      api.geocode(q).then((r) => !stale && setResults(r.results)).catch(() => !stale && setResults([]));
    }, 300);
    return () => { stale = true; clearTimeout(t); };
  }, [q]);
  const shown = q.trim().length < 3 ? [] : results;

  return (
    <div className="space-y-2">
      <input
        aria-label={`${which} search`}
        className="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 outline-none placeholder:text-cream-faint focus:border-amber"
        placeholder={which === "Home" ? "Search your neighbourhood" : "Search your office area"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        enterKeyHint="search"
      />
      {shown.length > 0 && (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
          {shown.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                className="min-h-11 w-full px-4 py-3 text-left text-sm hover:bg-surface-2"
                onClick={() => { onChange(r); setQ(""); setResults([]); }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && (
        <>
          <p className="text-sm text-cream-dim">{which}: {value.label}</p>
          <LeafletPicker
            lat={value.lat}
            lng={value.lng}
            onPick={(lat, lng) => onChange({ ...value, lat, lng })}
          />
          <p className="text-xs text-cream-faint">Tap or drag the pin to fine-tune. Friends only see the area name.</p>
        </>
      )}
    </div>
  );
}
