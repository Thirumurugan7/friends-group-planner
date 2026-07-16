// Real end-to-end check: writes to Neon, then runs the real Groq planner.
// Run: npx tsx scripts/verify-backend.ts
import { prisma } from "../src/lib/db";
import { makeInviteCode } from "../src/lib/auth";
import { generatePlan, type AiMemberInput } from "../src/lib/groq";

async function main() {
  console.log("1) Creating a real user in Neon…");
  const phone = "919" + Math.floor(100000000 + Math.random() * 899999999);
  const creator = await prisma.user.create({
    data: {
      phone,
      name: "Aisha Khan",
      age: 27,
      homeLabel: "Indiranagar",
      workLabel: "Koramangala",
      transport: "public",
      interests: ["coffee", "board games", "live music"],
      openness: 5,
    },
  });
  console.log("   ✓ user", creator.id, creator.phone);

  console.log("2) Creating a group + adding members…");
  const group = await prisma.group.create({
    data: {
      name: "Verify Crew",
      inviteCode: makeInviteCode(),
      createdById: creator.id,
      memberships: { create: { userId: creator.id } },
    },
  });

  const others = [
    { name: "Ravi Menon", homeLabel: "Whitefield", workLabel: "Marathahalli", transport: "own" as const, interests: ["gaming", "craft beer"], openness: 3 },
    { name: "Meera Nair", homeLabel: "Jayanagar", workLabel: "MG Road", transport: "public" as const, interests: ["cafes", "brunch"], openness: 4 },
  ];
  for (const o of others) {
    const u = await prisma.user.create({
      data: { phone: "919" + Math.floor(100000000 + Math.random() * 899999999), age: 28, ...o },
    });
    await prisma.membership.create({ data: { userId: u.id, groupId: group.id } });
  }
  const full = await prisma.group.findUnique({
    where: { id: group.id },
    include: { memberships: { include: { user: true } } },
  });
  console.log("   ✓ group", group.id, "with", full!.memberships.length, "members, invite", group.inviteCode);

  console.log("3) Running the REAL Groq planner on real member data…");
  const members: AiMemberInput[] = full!.memberships.map((m) => ({
    name: m.user.name ?? "A friend",
    homeArea: m.user.homeLabel ?? "unknown",
    workArea: m.user.workLabel ?? "unknown",
    transport: m.user.transport,
    interests: m.user.interests,
    openness: m.user.openness,
  }));
  const plan = await generatePlan(members, "cafe");
  console.log("   ✓ meetingArea:", plan.meetingArea);
  plan.venues.forEach((v, i) => {
    console.log(`\n   [${i + 1}] ${v.name} — ${v.area}  (match ${v.compatibility}, fair ${v.fairness})`);
    console.log("       why:", v.why);
    console.log("       strengths:", v.swot.strengths.join(" | "));
    console.log("       weaknesses:", v.swot.weaknesses.join(" | "));
  });

  console.log("\n4) Cleaning up test rows…");
  await prisma.group.delete({ where: { id: group.id } });
  await prisma.user.deleteMany({
    where: { id: { in: full!.memberships.map((m) => m.userId) } },
  });
  console.log("   ✓ cleaned up");
  console.log("\nALL REAL: Neon write + read + Groq AI ✓");
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
