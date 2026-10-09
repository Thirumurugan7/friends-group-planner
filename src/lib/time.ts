// City-local time helpers. Waypoint plans within one city (Asia/Kolkata).
// "HH:MM" strings are city wall-clock; anything before 05:00 belongs to the
// night of the previous calendar day (e.g. home-by "00:30").

export const CITY_OFFSET_MIN = 330; // UTC+05:30
export const DAY_START_MIN = 5 * 60;
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function dayOrderMinutes(hhmm: string): number {
  const m = toMinutes(hhmm);
  return m >= DAY_START_MIN ? m - DAY_START_MIN : m + 24 * 60 - DAY_START_MIN;
}

export function atLocal(date: string, hhmm: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  let mins = toMinutes(hhmm);
  if (mins < DAY_START_MIN) mins += 24 * 60;
  return new Date(Date.UTC(y, mo - 1, d, 0, mins - CITY_OFFSET_MIN));
}

function shifted(d: Date): Date {
  return new Date(d.getTime() + CITY_OFFSET_MIN * 60_000);
}

export function localDate(d: Date): string {
  return shifted(d).toISOString().slice(0, 10);
}

export function localHHMM(d: Date): string {
  return shifted(d).toISOString().slice(11, 16);
}

export function addMinutes(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
