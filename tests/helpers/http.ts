import { createSession } from "@/lib/session";

const jar = () => (globalThis as unknown as { __jar: Map<string, string> }).__jar;

export async function asUser(userId: string | null) {
  jar().clear();
  if (userId) await createSession(userId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response>;

export async function call(
  handler: Handler,
  opts: { method?: string; body?: unknown; params?: Record<string, string>; url?: string } = {}
) {
  const req = new Request(opts.url ?? "http://test.local/api", {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "content-type": "application/json" } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}
