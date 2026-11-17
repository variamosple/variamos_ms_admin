import { describe, expect, it, vi } from "vitest";
import {
  checkLocalDevOrigins,
  isLocalDevOrigin,
  localDevEndOf,
  localOriginOf,
} from "./localDevOrigins.js";

const END = Date.parse("2027-01-31T23:59:59.999Z");

describe("localOriginOf", () => {
  it.each([
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://localhost:3000/", "http://localhost:3000"],
    ["http://127.0.0.1:3010", "http://127.0.0.1:3010"],
    ["http://LOCALHOST:3002", "http://localhost:3002"],
  ])("accepts %j", (entry, expected) => {
    expect(localOriginOf(entry)).toBe(expected);
  });

  it.each([
    "https://localhost:3000",
    "http://localhost",
    "http://localhost:3000/path",
    "http://localhost.evil.example:3000",
    "http://app.variamos.com:3000",
    "http://192.168.1.10:3000",
    "http://[::1]:3000",
    "null",
    "",
  ])("refuses %j", (entry) => {
    expect(localOriginOf(entry)).toBeNull();
  });
});

describe("localDevEndOf", () => {
  it("ends at the last moment of the day, in UTC", () => {
    expect(localDevEndOf("2027-01-31")).toBe(END);
  });

  it.each(["", "31/01/2027", "2027-01-31T10:00", "2027-02-30x", "tomorrow"])(
    "refuses %j",
    (until) => {
      expect(localDevEndOf(until)).toBeNull();
    },
  );
});

describe("isLocalDevOrigin", () => {
  const set = (origins: string, until: string) => {
    vi.stubEnv("AUTH_LOCAL_DEV_ORIGINS", origins);
    vi.stubEnv("AUTH_LOCAL_DEV_UNTIL", until);
  };

  it("allows a listed local origin until the end of the last day", () => {
    set("http://localhost:3000, http://127.0.0.1:3000", "2027-01-31");

    expect(isLocalDevOrigin("http://localhost:3000", END)).toBe(true);
    expect(isLocalDevOrigin("http://127.0.0.1:3000/", END)).toBe(true);
    expect(isLocalDevOrigin("http://localhost:3000", END + 1)).toBe(false);
  });

  it("refuses an origin that is not listed or not local", () => {
    set("http://localhost:3000,https://app.variamos.com", "2999-12-31");

    expect(isLocalDevOrigin("http://localhost:3001")).toBe(false);
    expect(isLocalDevOrigin("https://app.variamos.com")).toBe(false);
  });

  it("allows nothing without the two variables", () => {
    set("http://localhost:3000", "");
    expect(isLocalDevOrigin("http://localhost:3000")).toBe(false);

    set("", "2999-12-31");
    expect(isLocalDevOrigin("http://localhost:3000")).toBe(false);
  });
});

describe("checkLocalDevOrigins", () => {
  const NOW = Date.parse("2026-11-17T12:00:00Z");

  it("says nothing when the switch is not set", () => {
    expect(checkLocalDevOrigins({}, NOW)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("warns, with the end date, while it is on", () => {
    const env = {
      AUTH_LOCAL_DEV_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
      AUTH_LOCAL_DEV_UNTIL: "2027-01-31",
    };

    const { errors, warnings } = checkLocalDevOrigins(env, NOW);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining("until 2027-01-31")]);
  });

  it("names the position of an entry that is not local, never its value", () => {
    const env = {
      AUTH_LOCAL_DEV_ORIGINS: "http://localhost:3000,https://x.example",
      AUTH_LOCAL_DEV_UNTIL: "2027-01-31",
    };

    const { errors } = checkLocalDevOrigins(env, NOW);

    expect(errors).toEqual([expect.stringContaining("entry 2")]);
    expect(errors[0]).not.toContain("x.example");
  });

  it("refuses the origins without an end date", () => {
    const env = { AUTH_LOCAL_DEV_ORIGINS: "http://localhost:3000" };

    expect(checkLocalDevOrigins(env, NOW).errors).toEqual([
      expect.stringContaining("AUTH_LOCAL_DEV_UNTIL"),
    ]);
  });

  it("asks to remove the variables once the date is past", () => {
    const env = {
      AUTH_LOCAL_DEV_ORIGINS: "http://localhost:3000",
      AUTH_LOCAL_DEV_UNTIL: "2026-11-01",
    };

    const { errors, warnings } = checkLocalDevOrigins(env, NOW);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining("remove")]);
  });
});
