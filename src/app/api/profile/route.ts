import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function PUT(req: Request) {
  const id = await getUserId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const b = await req.json().catch(() => ({}));

  const name = typeof b.name === "string" ? b.name.trim() : undefined;
  if (name !== undefined && name.length === 0) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      name,
      age: typeof b.age === "number" ? b.age : undefined,
      homeLat: b.home?.lat,
      homeLng: b.home?.lng,
      homeLabel: b.home?.label,
      workLat: b.work?.lat,
      workLng: b.work?.lng,
      workLabel: b.work?.label,
      transport: b.transport === "own" ? "own" : "public",
      interests: Array.isArray(b.interests) ? b.interests : undefined,
      openness:
        typeof b.openness === "number"
          ? Math.max(1, Math.min(5, b.openness))
          : undefined,
    },
  });

  return NextResponse.json({ ok: true, user });
}
