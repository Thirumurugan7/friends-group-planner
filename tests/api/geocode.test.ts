import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeUser } from "../helpers/factories";
import { GET as geocode } from "@/app/api/geocode/route";

describe("geocode", () => {
  beforeEach(resetDb);
  it("requires sign-in", async () => {
    await asUser(null);
    expect((await call(geocode, { url: "http://t/api/geocode?q=indira" })).status).toBe(401);
  });
  it("returns fake places matching the query", async () => {
    const u = await makeUser();
    await asUser(u.id);
    const res = await call(geocode, { url: "http://t/api/geocode?q=indira" });
    expect(res.json.results[0].label).toMatch(/^Indiranagar/);
  });
  it("needs at least 3 characters", async () => {
    const u = await makeUser();
    await asUser(u.id);
    expect((await call(geocode, { url: "http://t/api/geocode?q=in" })).json.results).toEqual([]);
  });
});
