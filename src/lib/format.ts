export function formatDuration(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function formatPrice(level: number): string {
  return "$".repeat(Math.max(1, Math.min(4, level)));
}

export function transportLabel(t: "public" | "own"): string {
  return t === "public" ? "Public transit" : "Own vehicle";
}
