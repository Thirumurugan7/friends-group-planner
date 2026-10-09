export interface RankedDate {
  date: string;
  freeUserIds: string[];
  freeCount: number;
  incompleteFreeCount: number;
}

export function pickDate(input: {
  dates: string[];
  availability: { userId: string; date: string; free: boolean }[];
  memberIds: string[];
  incompleteIds: string[];
}): RankedDate[] {
  const members = new Set(input.memberIds);
  const incomplete = new Set(input.incompleteIds);
  return input.dates
    .map((date) => {
      const freeUserIds = input.availability
        .filter((a) => a.date === date && a.free && members.has(a.userId))
        .map((a) => a.userId);
      return {
        date,
        freeUserIds,
        freeCount: freeUserIds.length,
        incompleteFreeCount: freeUserIds.filter((id) => incomplete.has(id)).length,
      };
    })
    .sort(
      (a, b) =>
        b.freeCount - a.freeCount ||
        a.incompleteFreeCount - b.incompleteFreeCount ||
        a.date.localeCompare(b.date)
    );
}
