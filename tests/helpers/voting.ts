import { prisma } from "@/lib/db";
import { asUser, call } from "./http";
import { outingFixture } from "./outings";
import { POST as generate } from "@/app/api/outings/[id]/generate/route";

export async function votingFixture() {
  const f = await outingFixture({ confirm: true });
  await asUser(f.admin.id);
  await call(generate, { method: "POST", params: { id: f.outing.id } });
  const options = await prisma.itineraryOption.findMany({ where: { outingId: f.outing.id }, orderBy: { createdAt: "asc" } });
  return { ...f, options };
}
