import { prisma } from "@/lib/db";
import { route, ok, parseBody, requireUser, HttpError } from "@/lib/http";
import { ProfileSchema } from "@/lib/profile";
import { selfProfile } from "@/lib/serialize";

export const PUT = route(async (req) => {
  const user = await requireUser();
  const p = await parseBody(req, ProfileSchema);

  const clash = await prisma.user.findUnique({ where: { email: p.email } });
  if (clash && clash.id !== user.id) throw new HttpError(409, "That email is already used by another account.");

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: p.name, email: p.email, age: p.age, gender: p.gender, homeBy: p.homeBy,
      homeLat: p.home.lat, homeLng: p.home.lng, homeLabel: p.home.label,
      workLat: p.work.lat, workLng: p.work.lng, workLabel: p.work.label,
      transport: p.transport, interests: p.interests, openness: p.openness,
    },
  });
  return ok({ ok: true, profile: selfProfile(updated) });
});
