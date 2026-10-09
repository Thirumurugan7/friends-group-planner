import { route, ok } from "@/lib/http";
import { clearSession } from "@/lib/session";

export const POST = route(async () => {
  await clearSession();
  return ok({ ok: true });
});
