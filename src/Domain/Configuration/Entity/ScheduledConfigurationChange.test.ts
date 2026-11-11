import {
  ALREADY_SET,
  CHANGED_BY_HAND,
  canScheduleConfiguration,
  decisionAtDueDate,
  refusalOfDueDate,
  SCHEDULE_HORIZON_MS,
} from "./ScheduledConfigurationChange.js";

const NOW = new Date("2026-11-11T12:00:00Z");
const BASE = new Date("2026-11-01T08:00:00Z");

describe("ScheduledConfigurationChange (EV-115 lot B)", () => {
  it("plans only the settings users notice", () => {
    expect(canScheduleConfiguration("security.password.min_length")).toBe(true);
    expect(canScheduleConfiguration("general.site_name")).toBe(false);
  });

  it("takes a date in the future, within a year", () => {
    expect(refusalOfDueDate(new Date(NOW.getTime() + 60_000), NOW)).toBeNull();
    expect(
      refusalOfDueDate(new Date(NOW.getTime() + SCHEDULE_HORIZON_MS), NOW),
    ).toBeNull();
    expect(refusalOfDueDate(NOW, NOW)).toBe(
      "The date of the change must be in the future.",
    );
    expect(
      refusalOfDueDate(new Date(NOW.getTime() + SCHEDULE_HORIZON_MS + 1), NOW),
    ).toBe("The date of the change must be within a year.");
    expect(refusalOfDueDate(new Date("not a date"), NOW)).toBe(
      "The date of the change is invalid.",
    );
  });

  describe("at the due date", () => {
    const change = { previousValue: 8, newValue: 12, baseUpdatedAt: BASE };

    it("applies a change to a setting left as it was", () => {
      expect(decisionAtDueDate(change, { value: 8, updatedAt: BASE })).toBe(
        "apply",
      );
    });

    it("does nothing to a setting that already has the new value", () => {
      expect(
        decisionAtDueDate(change, { value: 12, updatedAt: new Date() }),
      ).toEqual({ status: "applied", reason: ALREADY_SET });
    });

    it("leaves a setting changed since, even back to the same value", () => {
      const conflict = { status: "conflict", reason: CHANGED_BY_HAND };
      expect(decisionAtDueDate(change, { value: 10, updatedAt: BASE })).toEqual(
        conflict,
      );
      expect(
        decisionAtDueDate(change, {
          value: 8,
          updatedAt: new Date("2026-11-05T08:00:00Z"),
        }),
      ).toEqual(conflict);
    });

    it("compares the values alone when a date is missing", () => {
      expect(
        decisionAtDueDate({ ...change, baseUpdatedAt: null }, { value: 8 }),
      ).toBe("apply");
      expect(decisionAtDueDate(change, { value: 8 })).toBe("apply");
    });
  });
});
