// Fakes give a fixed OTP and canned map/AI data for tests and E2E runs.
// In production this would be a login backdoor, so it is refused outright.
export function fakesEnabled(): boolean {
  if (process.env.WAYPOINT_FAKES !== "1") return false;
  if (process.env.NODE_ENV === "production") {
    throw new Error("WAYPOINT_FAKES cannot be enabled in production");
  }
  return true;
}
