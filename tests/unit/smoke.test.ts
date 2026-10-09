import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/db";
import { makeCompleteUser, makeGroup } from "../helpers/factories";

describe("test infrastructure", () => {
  beforeEach(resetDb);

  it("creates a group with an admin membership in the test DB", async () => {
    const u = await makeCompleteUser();
    const g = await makeGroup(u.id);
    const m = await prisma.membership.findFirstOrThrow({ where: { groupId: g.id } });
    expect(m.role).toBe("admin");
    expect(process.env.DATABASE_URL).toContain("waypoint_test");
  });
});
