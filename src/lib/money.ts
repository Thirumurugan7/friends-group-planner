const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatRupees(paise: number): string {
  return fmt.format(Math.round(paise / 100));
}

/** "450" or "450.50" → paise; null when not a positive amount. */
export function parseRupees(input: string): number | null {
  const n = Number(input.replace(/[,₹\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
