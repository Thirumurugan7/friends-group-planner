// Thin client-side fetch helpers. Each throws with the server's message on error.

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export function requestOtp(phone: string) {
  return fetch("/api/auth/request-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  }).then(jsonOrThrow);
}

export function verifyOtp(phone: string, code: string) {
  return fetch("/api/auth/verify-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, code }),
  }).then(jsonOrThrow) as Promise<{ ok: true; isNew: boolean }>;
}

export function saveProfile(profile: unknown) {
  return fetch("/api/profile", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profile),
  }).then(jsonOrThrow);
}

export function createGroup(name: string) {
  return fetch("/api/groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  }).then(jsonOrThrow) as Promise<{ ok: true; group: { id: string } }>;
}

export function joinGroup(code: string) {
  return fetch(`/api/join/${code}`, { method: "POST" }).then(jsonOrThrow) as Promise<{
    ok: true;
    groupId: string;
  }>;
}
