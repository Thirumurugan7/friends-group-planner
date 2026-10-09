import type { Slot, Theme } from "./types";

// Fallback days when the AI sketch fails. Times are city-local.
const TEMPLATES: Record<Theme, Slot[]> = {
  relaxed: [
    { startTime: "10:30", durationMin: 90, kind: "cafe", vibe: "Slow coffee to start" },
    { startTime: "12:30", durationMin: 90, kind: "restaurant", vibe: "Long lunch" },
    { startTime: "14:30", durationMin: 90, kind: "park", vibe: "Walk it off" },
    { startTime: "17:30", durationMin: 150, kind: "cinema", vibe: "Evening movie" },
  ],
  adventurous: [
    { startTime: "09:00", durationMin: 150, kind: "beach", vibe: "Morning by the water" },
    { startTime: "12:00", durationMin: 60, kind: "street_food", vibe: "Quick local bites" },
    { startTime: "13:30", durationMin: 120, kind: "museum", vibe: "Something new" },
    { startTime: "16:00", durationMin: 60, kind: "viewpoint", vibe: "Sunset spot" },
    { startTime: "17:30", durationMin: 90, kind: "restaurant", vibe: "Early dinner" },
  ],
  foodie: [
    { startTime: "11:00", durationMin: 60, kind: "cafe", vibe: "Brunch coffee" },
    { startTime: "12:30", durationMin: 120, kind: "restaurant", vibe: "The big lunch" },
    { startTime: "15:00", durationMin: 120, kind: "mall", vibe: "Browse and snack" },
    { startTime: "17:30", durationMin: 90, kind: "street_food", vibe: "Evening street food" },
  ],
};

export function templateDay(theme: Theme): Slot[] {
  return TEMPLATES[theme].map((s) => ({ ...s }));
}
