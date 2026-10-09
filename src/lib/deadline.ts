import type { Gender } from "@prisma/client";
import { dayOrderMinutes } from "@/lib/time";

export const FEMALE_DEFAULT_HOME_BY = "23:00";

export function effectiveDeadline(
  user: { homeBy: string | null; gender: Gender | null },
  groupHomeBy: string | null
): string | null {
  const candidates: string[] = [];
  if (user.homeBy) candidates.push(user.homeBy);
  else if (user.gender === "female") candidates.push(FEMALE_DEFAULT_HOME_BY);
  if (groupHomeBy) candidates.push(groupHomeBy);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (dayOrderMinutes(b) < dayOrderMinutes(a) ? b : a));
}
