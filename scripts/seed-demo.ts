// Seeds a real user + group + members, plus a known OTP challenge, so the
// wired UI can be signed in through the REAL verify endpoint (no mock).
// Run: npx tsx scripts/seed-demo.ts
import { prisma } from "../src/lib/db";
import { makeInviteCode } from "../src/lib/auth";
import { hashOtp } from "../src/lib/otp";

async function main() {
  const phone = "919000000001";
  const code = "1234";

  // Clean any prior demo rows for a repeatable run.
  const prior = await prisma.user.findUnique({ where: { phone } });
  if (prior) {
    await prisma.group.deleteMany({ where: { createdById: prior.id } });
    await prisma.user.deleteMany({
      where: { phone: { in: [phone, "919000000002", "919000000003"] } },
    });
  }

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

  const friends = await Promise.all([
    prisma.user.create({
      data: { phone: "919000000002", name: "Ravi Menon", age: 30, homeLabel: "Whitefield", workLabel: "Marathahalli", transport: "own", interests: ["gaming", "craft beer"], openness: 3 },
    }),
    prisma.user.create({
      data: { phone: "919000000003", name: "Meera Nair", age: 26, homeLabel: "Jayanagar", workLabel: "MG Road", transport: "public", interests: ["cafes", "brunch"], openness: 4 },
    }),
  ]);

  const group = await prisma.group.create({
    data: {
      name: "The Usual Suspects",
      inviteCode: makeInviteCode(),
      createdById: creator.id,
      memberships: {
        create: [
          { userId: creator.id },
          { userId: friends[0].id },
          { userId: friends[1].id },
        ],
      },
    },
  });

  await prisma.otpChallenge.deleteMany({ where: { phone } });
  await prisma.otpChallenge.create({
    data: {
      phone,
      codeHash: hashOtp(phone, code),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  console.log(JSON.stringify({ phone, code, groupId: group.id, invite: group.inviteCode }, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
