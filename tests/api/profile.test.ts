import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeUser, makeCompleteUser } from "../helpers/factories";
import { PUT as putProfile } from "@/app/api/profile/route";
import { GET as getMe } from "@/app/api/me/route";

const body = {
  name: "Aisha", email: "Aisha@Example.com", age: 27, gender: "female",
  home: { lat: 12.97111, lng: 77.64111, label: "Indiranagar" },
  work: { lat: 12.93222, lng: 77.62222, label: "Koramangala" },
  transport: "public", interests: ["coffee"], openness: 4, homeBy: null,
};

describe("profile API", () => {
  beforeEach(resetDb);

  it("saves a complete profile and lowercases email", async () => {
    const u = await makeUser();
    await asUser(u.id);
    const res = await call(putProfile, { method: "PUT", body });
    expect(res.status).toBe(200);
    expect(res.json.profile.email).toBe("aisha@example.com");
    expect(res.json.profile.profileComplete).toBe(true);
    const me = await call(getMe);
    expect(me.json.profile.home.lat).toBe(12.97111);
  });

  it("requires gender and email", async () => {
    const u = await makeUser();
    await asUser(u.id);
    expect((await call(putProfile, { method: "PUT", body: { ...body, gender: undefined } })).status).toBe(400);
    expect((await call(putProfile, { method: "PUT", body: { ...body, email: "" } })).status).toBe(400);
  });

  it("409 when the email belongs to someone else", async () => {
    await makeCompleteUser({ email: "taken@example.com" });
    const u = await makeUser();
    await asUser(u.id);
    const res = await call(putProfile, { method: "PUT", body: { ...body, email: "taken@example.com" } });
    expect(res.status).toBe(409);
  });

  it("401 signed out", async () => {
    await asUser(null);
    expect((await call(getMe)).status).toBe(401);
  });
});
