import { describe, it, expect } from "vitest";
import { haversineM, estimateMinutes, decodePolyline } from "@/lib/engine/geo";

const indiranagar = { lat: 12.9719, lng: 77.6412 };
const koramangala = { lat: 12.9352, lng: 77.6245 };

describe("geo", () => {
  it("measures distance in metres", () => {
    const d = haversineM(indiranagar, koramangala);
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(5000);
  });
  it("estimates public transport slower than own vehicle", () => {
    expect(estimateMinutes(indiranagar, koramangala, "public")).toBeGreaterThan(
      estimateMinutes(indiranagar, koramangala, "own")
    );
    expect(estimateMinutes(indiranagar, indiranagar, "own")).toBe(5);
  });
  it("decodes Google encoded polylines", () => {
    // Example from Google's polyline algorithm docs.
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [38.5, -120.2], [40.7, -120.95], [43.252, -126.453],
    ]);
  });
});
