import { route, ok, requireUser } from "@/lib/http";
import { fakesEnabled } from "@/lib/fakes";

const FAKE = [
  { label: "Indiranagar, Bengaluru", lat: 12.9719, lng: 77.6412 },
  { label: "Koramangala, Bengaluru", lat: 12.9352, lng: 77.6245 },
  { label: "Whitefield, Bengaluru", lat: 12.9698, lng: 77.75 },
  { label: "Jayanagar, Bengaluru", lat: 12.925, lng: 77.5938 },
];

export const GET = route(async (req) => {
  await requireUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3) return ok({ results: [] });

  if (fakesEnabled()) {
    return ok({ results: FAKE.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())) });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", q);
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", "5");
  let rows: { display_name: string; lat: string; lon: string }[];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `Waypoint/1.0 (${process.env.NOMINATIM_CONTACT ?? "admin@example.com"})` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return ok({ results: [] });
    rows = (await res.json()) as typeof rows;
  } catch {
    return ok({ results: [] });
  }
  return ok({
    results: rows.map((r) => ({
      label: r.display_name.split(",").slice(0, 2).map((s) => s.trim()).join(", "),
      lat: Number(r.lat),
      lng: Number(r.lon),
    })),
  });
});
