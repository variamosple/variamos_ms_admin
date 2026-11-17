import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkOriginList,
  entriesOf,
  isAllowedOrigin,
  originOf,
} from "./allowedOrigins.js";
import EnvVars from "./EnvVars.js";

const original = EnvVars.CORS.AllowedOrigins;

const useList = (origins: string[]) => {
  Object.defineProperty(EnvVars.CORS, "AllowedOrigins", {
    value: origins,
    configurable: true,
  });
};

afterEach(() => {
  useList(original);
});

describe("originOf", () => {
  it.each([
    ["https://app.variamos.com", "https://app.variamos.com"],
    ["https://app.variamos.com/", "https://app.variamos.com"],
    ["https://APP.variamos.com:443/path?q=1", "https://app.variamos.com"],
    ["http://localhost:3000", "http://localhost:3000"],
  ])("gives the origin of %j", (value, expected) => {
    expect(originOf(value)).toBe(expected);
  });

  it.each(["null", "", "app.variamos.com", "javascript:alert(1)", "ftp://x.y"])(
    "gives null for %j",
    (value) => {
      expect(originOf(value)).toBeNull();
    },
  );
});

describe("entriesOf", () => {
  it("trims the entries and drops the blank ones", () => {
    expect(entriesOf(" https://a.example , ,https://b.example,")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
    expect(entriesOf(undefined)).toEqual([]);
  });
});

describe("isAllowedOrigin with the exact list", () => {
  it("allows a listed origin only, compared exactly", () => {
    useList(["https://app.variamos.com"]);

    expect(isAllowedOrigin("https://app.variamos.com")).toBe(true);
    expect(isAllowedOrigin("https://app.variamos.com:443")).toBe(true);
    expect(isAllowedOrigin("http://app.variamos.com")).toBe(false);
    expect(isAllowedOrigin("https://app.variamos.com.evil.example")).toBe(
      false,
    );
    expect(isAllowedOrigin("https://evilapp.variamos.com")).toBe(false);
    expect(isAllowedOrigin("http://localhost:3000")).toBe(false);
  });

  it("never allows the origin null", () => {
    useList(["https://app.variamos.com", "null"]);

    expect(isAllowedOrigin("null")).toBe(false);
  });
});

describe("isAllowedOrigin with AUTH_LOCAL_DEV_ORIGINS", () => {
  it("adds the listed local origins until their end date", () => {
    useList(["https://app.variamos.com"]);
    vi.stubEnv("AUTH_LOCAL_DEV_ORIGINS", "http://localhost:3000");
    vi.stubEnv("AUTH_LOCAL_DEV_UNTIL", "2999-12-31");

    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://localhost:3001")).toBe(false);
    expect(isAllowedOrigin("https://app.variamos.com")).toBe(true);

    vi.stubEnv("AUTH_LOCAL_DEV_UNTIL", "2026-01-31");
    expect(isAllowedOrigin("http://localhost:3000")).toBe(false);
  });
});

describe("isAllowedOrigin without a list", () => {
  it("allows no origin", () => {
    useList([]);

    expect(isAllowedOrigin("https://app.variamos.com")).toBe(false);
    expect(isAllowedOrigin("http://localhost:3000")).toBe(false);
  });
});

describe("checkOriginList", () => {
  const SET = { CORS_ALLOWED_ORIGINS: "https://app.variamos.com" };

  it("accepts an exact list in every environment, without warning", () => {
    expect(checkOriginList(SET, "production")).toEqual({
      errors: [],
      warnings: [],
    });
    expect(checkOriginList(SET, "development")).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("names the position of an entry that is not an origin, never its value", () => {
    const env = {
      CORS_ALLOWED_ORIGINS:
        "https://app.variamos.com,https://x.example/path,^https?://y$",
    };

    const { errors } = checkOriginList(env, "development");

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("entry 2, 3");
    expect(errors[0]).not.toContain("x.example");
  });

  it("refuses the default port written out", () => {
    const env = { CORS_ALLOWED_ORIGINS: "https://app.variamos.com:443" };

    expect(checkOriginList(env, "production").errors).toHaveLength(1);
  });

  it("refuses to start in production without the list, even with the former patterns", () => {
    for (const env of [
      {},
      { CORS_ALLOWED_ORIGINS_PATTERNS: "^https://a\\.example$" },
    ]) {
      expect(checkOriginList(env, "production").errors).toEqual([
        expect.stringContaining("CORS_ALLOWED_ORIGINS is not set"),
      ]);
    }
  });

  it("asks to remove the former patterns when the list is set", () => {
    const env = {
      ...SET,
      CORS_ALLOWED_ORIGINS_PATTERNS: "^https://a\\.example$",
    };

    expect(checkOriginList(env, "production")).toEqual({
      errors: [],
      warnings: ["CORS_ALLOWED_ORIGINS_PATTERNS is no longer read: remove it"],
    });
  });

  it.each(["development", "test", ""])(
    "lets %j start without the list, with a warning",
    (nodeEnv) => {
      expect(checkOriginList({}, nodeEnv)).toEqual({
        errors: [],
        warnings: [
          expect.stringContaining("no browser origin may call the API"),
        ],
      });
    },
  );

  it("names the variable to set when a workstation still has the former patterns only", () => {
    const env = { CORS_ALLOWED_ORIGINS_PATTERNS: "http://localhost:3000" };

    expect(checkOriginList(env, "development").warnings).toEqual([
      "CORS_ALLOWED_ORIGINS_PATTERNS is no longer read: set the exact origins in CORS_ALLOWED_ORIGINS",
      expect.stringContaining("CORS_ALLOWED_ORIGINS is not set"),
    ]);
  });
});
