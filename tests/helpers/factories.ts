import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

let n = 0;
const uniq = () => `${Date.now()}${n++}`;

export function makeUser(overrides: Partial<Prisma.UserCreateInput> = {}) {
  const id = uniq();
  return prisma.user.create({
    data: { phone: `91${id.slice(-10).padStart(10, "9")}`, ...overrides },
  });
}

export function makeCompleteUser(overrides: Partial<Prisma.UserCreateInput> = {}) {
  const id = uniq();
  return makeUser({
    name: `User ${id.slice(-4)}`,
    email: `u${id}@example.com`,
    age: 27,
    gender: "male",
    homeLat: 12.97123,
    homeLng: 77.64123,
    homeLabel: "Indiranagar",
    workLat: 12.93456,
    workLng: 77.62456,
    workLabel: "Koramangala",
    transport: "public",
    interests: ["coffee", "board games"],
    openness: 4,
    ...overrides,
  });
}

export async function makeGroup(adminId: string, memberIds: string[] = []) {
  return prisma.group.create({
    data: {
      name: "Test Group",
      inviteCode: `TEST-${uniq().slice(-6)}`,
      createdById: adminId,
      memberships: {
        create: [
          { userId: adminId, role: "admin" },
          ...memberIds.map((userId) => ({ userId, role: "member" as const })),
        ],
      },
    },
  });
}
