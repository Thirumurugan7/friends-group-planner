import { route, ok, requireUser } from "@/lib/http";
import { selfProfile } from "@/lib/serialize";

export const GET = route(async () => {
  const user = await requireUser();
  return ok({ profile: selfProfile(user) });
});
