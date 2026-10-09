import { addMinutes, atLocal } from "@/lib/time";

export const CHECKIN_GRACE_DAYS = 3;

export function checkInOpensAt(date: string): Date {
  return atLocal(date, "05:00");
}

export function decisionOpensAt(date: string): Date {
  return addMinutes(atLocal(date, "05:00"), 24 * 60);
}

export function evaluateOutcome(input: {
  date: string;
  goingIds: string[];
  checkIns: { userId: string; attended: boolean }[];
  now: Date;
}): "completed" | "failed" | null {
  const opens = decisionOpensAt(input.date);
  if (input.now < opens) return null;
  const going = new Set(input.goingIds);
  if (going.size === 0) return "failed";
  const answered = input.checkIns.filter((c) => going.has(c.userId));
  const attended = answered.filter((c) => c.attended).length;
  if (attended * 2 >= going.size) return "completed";
  if (answered.length === going.size) return "failed";
  if (input.now >= addMinutes(opens, CHECKIN_GRACE_DAYS * 24 * 60)) return "failed";
  return null;
}
