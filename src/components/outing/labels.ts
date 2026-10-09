import type { SlotKind } from "@/lib/engine/types";

export const THEME_LABEL: Record<string, string> = {
  relaxed: "Easy-going day",
  adventurous: "Adventure day",
  foodie: "Food crawl",
};

export const PROGRESS_LABEL: Record<string, string> = {
  sketching: "Sketching the day…",
  finding_venues: "Finding real places…",
  routing: "Working out everyone's routes…",
  checking_home: "Checking everyone gets home in time…",
  costing: "Adding up costs…",
  writing: "Writing it up…",
};

export const KIND_ICON: Record<SlotKind, string> = {
  cafe: "☕", restaurant: "🍽", gaming: "🎮", cinema: "🎬", beach: "🏖",
  park: "🌳", museum: "🏛", mall: "🛍", viewpoint: "🌇", street_food: "🌮",
};

const fmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export function prettyDate(iso: string): string {
  return fmt.format(new Date(`${iso}T00:00:00Z`));
}
