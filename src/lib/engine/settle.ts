export interface Transfer { from: string; to: string; amount: number }
type Expense = { paidById: string; amount: number; splitAmong: string[] };

export function balances(expenses: Expense[]): Map<string, number> {
  const bal = new Map<string, number>();
  const add = (id: string, v: number) => bal.set(id, (bal.get(id) ?? 0) + v);
  for (const e of expenses) {
    const people = [...e.splitAmong].sort();
    const share = Math.floor(e.amount / people.length);
    let leftover = e.amount - share * people.length;
    add(e.paidById, e.amount);
    for (const p of people) {
      add(p, -(share + (leftover > 0 ? 1 : 0)));
      if (leftover > 0) leftover--;
    }
  }
  return bal;
}

export function settle(expenses: Expense[]): Transfer[] {
  const bal = balances(expenses);
  const creditors = [...bal].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = [...bal].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const order = (a: { id: string; v: number }, b: { id: string; v: number }) => b.v - a.v || a.id.localeCompare(b.id);
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(order);
    debtors.sort(order);
    const c = creditors[0], d = debtors[0];
    const amount = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amount });
    c.v -= amount;
    d.v -= amount;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }
  return out;
}
