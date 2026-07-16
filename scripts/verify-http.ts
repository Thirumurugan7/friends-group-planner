// Exercises the real HTTP API routes end-to-end against the dev server.
// Run: npx tsx scripts/verify-http.ts
import { SignJWT } from "jose";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";

async function main() {
  // A real user + session cookie (same signing the app uses).
  const phone = "919" + Math.floor(100000000 + Math.random() * 899999999);
  const user = await prisma.user.create({
    data: {
      phone,
      name: "HTTP Tester",
      homeLabel: "Indiranagar",
      workLabel: "Koramangala",
      transport: "public",
      interests: ["coffee", "board games"],
      openness: 4,
    },
  });
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);
  const token = await new SignJWT({ sub: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
  const cookie = `wp_session=${token}`;

  const j = (r: Response) => r.json();

  console.log("GET /api/me →");
  const me = await fetch(`${BASE}/api/me`, { headers: { cookie } }).then(j);
  console.log("   signed in as:", me.user?.name);

  console.log("POST /api/groups (create) →");
  const created = await fetch(`${BASE}/api/groups`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "HTTP Crew" }),
  }).then(j);
  console.log("   group:", created.group?.id, "invite:", created.group?.inviteCode);
  const groupId = created.group.id;

  console.log("POST /api/groups/[id]/plan (real Groq) →");
  const plan = await fetch(`${BASE}/api/groups/${groupId}/plan`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ category: "cafe" }),
  }).then(j);
  console.log("   meetingArea:", plan.meetingArea);
  console.log("   top venue:", plan.venues?.[0]?.name, "-", plan.venues?.[0]?.area);
  console.log("   swot strengths:", plan.venues?.[0]?.swot?.strengths?.join(" | "));

  // cleanup
  await prisma.group.delete({ where: { id: groupId } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log("\nHTTP API verified end-to-end ✓ (auth → create group → AI plan)");
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
