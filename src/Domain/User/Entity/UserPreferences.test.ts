import { knownTimeZone, TIME_ZONE_MAX } from "./UserPreferences.js";

describe("knownTimeZone (EV-115 lot C)", () => {
  it.each([
    ["America/Bogota", "America/Bogota"],
    ["Europe/Paris", "Europe/Paris"],
    ["UTC", "UTC"],
    // The name as the runtime writes it
    ["europe/paris", "Europe/Paris"],
  ])("knows %s as %s", (zone, expected) => {
    expect(knownTimeZone(zone)).toBe(expected);
  });

  it.each([
    "",
    "Mars/Olympus_Mons",
    "Europe/Paris; DROP TABLE",
    "A".repeat(TIME_ZONE_MAX + 1),
  ])("does not know %j", (zone) => {
    expect(knownTimeZone(zone)).toBeNull();
  });
});
