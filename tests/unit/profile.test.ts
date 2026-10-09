import { describe, it, expect } from "vitest";
import { isProfileComplete, ProfileSchema } from "@/lib/profile";

const full = {
  name: "Aisha", email: "a@x.com", age: 27, gender: "female" as const,
  homeLat: 12.9, homeLng: 77.6, homeLabel: "Indiranagar",
  workLat: 12.93, workLng: 77.62, workLabel: "Koramangala",
};

describe("profile", () => {
  it("is complete only with every required field", () => {
    expect(isProfileComplete(full)).toBe(true);
    expect(isProfileComplete({ ...full, email: null })).toBe(false);
    expect(isProfileComplete({ ...full, gender: null })).toBe(false);
    expect(isProfileComplete({ ...full, workLat: null })).toBe(false);
  });

  it("validates the profile body", () => {
    const body = {
      name: "Aisha", email: "a@x.com", age: 27, gender: "female",
      home: { lat: 12.9, lng: 77.6, label: "Indiranagar" },
      work: { lat: 12.93, lng: 77.62, label: "Koramangala" },
      transport: "public", interests: ["coffee"], openness: 4, homeBy: "23:30",
    };
    expect(ProfileSchema.parse(body).homeBy).toBe("23:30");
    expect(() => ProfileSchema.parse({ ...body, email: "nope" })).toThrow();
    expect(() => ProfileSchema.parse({ ...body, gender: undefined })).toThrow();
    expect(() => ProfileSchema.parse({ ...body, homeBy: "25:00" })).toThrow();
    expect(ProfileSchema.parse({ ...body, homeBy: null }).homeBy).toBeNull();
  });
});
