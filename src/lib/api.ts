// Typed client-side fetch helpers. Each throws ApiError with the server's message.
import type { selfProfile } from "@/lib/serialize";
import type { PublicMember } from "@/lib/serialize";
import type { ProfileInput } from "@/lib/profile";
import type { OutingView } from "@/lib/outings/view";

export type SelfProfile = ReturnType<typeof selfProfile>;
export type GeoResult = { label: string; lat: number; lng: number };
export type OutingListItem = {
  id: string; title: string; status: string; date: string | null;
  rangeStart: string; rangeEnd: string; groupId: string; groupName: string;
};
export type GroupDetail = {
  group: { id: string; name: string; inviteCode: string; myRole: "admin" | "member"; members: PublicMember[] };
  outings: { id: string; title: string; status: string; date: string | null; rangeStart: string; rangeEnd: string; goingCount: number; createdAt: string }[];
};
export type { OutingView };

export class ApiError extends Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, public status: number, public data: any) {
    super(message);
  }
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong.", res.status, data);
  return data as T;
}

type Ok = { ok: true };
const o = (id: string) => `/api/outings/${id}`;

export const api = {
  requestOtp: (phone: string) => send<Ok>("POST", "/api/auth/request-otp", { phone }),
  verifyOtp: (phone: string, code: string) =>
    send<{ ok: true; needsProfile: boolean }>("POST", "/api/auth/verify-otp", { phone, code }),
  me: () => send<{ profile: SelfProfile }>("GET", "/api/me"),
  saveProfile: (p: ProfileInput) => send<{ profile: SelfProfile }>("PUT", "/api/profile", p),
  signOut: () => send<Ok>("POST", "/api/auth/signout"),
  geocode: (q: string) => send<{ results: GeoResult[] }>("GET", `/api/geocode?q=${encodeURIComponent(q)}`),

  groups: () => send<{ groups: { id: string; name: string; memberCount: number; role: "admin" | "member" }[] }>("GET", "/api/groups"),
  createGroup: (name: string) => send<{ ok: true; group: { id: string } }>("POST", "/api/groups", { name }),
  group: (id: string) => send<GroupDetail>("GET", `/api/groups/${id}`),
  rotateInvite: (id: string) => send<{ inviteCode: string }>("POST", `/api/groups/${id}/invite`),
  removeMember: (id: string, userId: string) => send<Ok>("DELETE", `/api/groups/${id}/members/${userId}`),
  previewJoin: (code: string) => send<{ group: { id: string; name: string; memberCount: number } }>("GET", `/api/join/${code}`),
  join: (code: string) => send<{ ok: true; groupId: string }>("POST", `/api/join/${code}`),

  outings: () => send<{ outings: OutingListItem[] }>("GET", "/api/outings"),
  createOuting: (groupId: string, body: { title: string; rangeStart: string; rangeEnd: string; groupHomeBy: string | null }) =>
    send<{ outing: { id: string } }>("POST", `/api/groups/${groupId}/outings`, body),
  outing: (id: string) => send<OutingView>("GET", o(id)),
  setAvailability: (id: string, free: string[]) => send<Ok>("PUT", `${o(id)}/availability`, { free }),
  confirmDate: (id: string, date: string) => send<Ok>("POST", `${o(id)}/confirm-date`, { date }),
  generate: (id: string) => send<{ optionIds: string[] }>("POST", `${o(id)}/generate`),
  vote: (id: string, optionId: string) => send<Ok>("PUT", `${o(id)}/vote`, { optionId }),
  rsvp: (id: string, status: "going" | "maybe" | "no" | "cancelled", reason?: string) =>
    send<Ok>("PUT", `${o(id)}/rsvp`, { status, reason }),
  lock: (id: string, optionId?: string) => send<{ ok: true; optionId: string }>("POST", `${o(id)}/lock`, { optionId }),
  cancel: (id: string, reason?: string) => send<Ok>("POST", `${o(id)}/cancel`, { reason }),
  showtime: (id: string, stopIndex: number, time: string) => send<Ok>("POST", `${o(id)}/showtime`, { stopIndex, time }),
  checkin: (id: string, attended: boolean) => send<{ ok: true; status: string }>("POST", `${o(id)}/checkin`, { attended }),
  addExpense: (id: string, body: { amount: number; note: string; stopIndex: number | null; splitAmong: string[] }) =>
    send<{ expense: { id: string } }>("POST", `${o(id)}/expenses`, body),
  deleteExpense: (id: string, expenseId: string) => send<Ok>("DELETE", `${o(id)}/expenses/${expenseId}`),

  subscribePush: (sub: PushSubscriptionJSON) => send<Ok>("POST", "/api/push/subscribe", sub),
  unsubscribePush: (endpoint: string) => send<Ok>("DELETE", "/api/push/subscribe", { endpoint }),
};
