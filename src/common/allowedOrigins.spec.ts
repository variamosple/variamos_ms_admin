import { afterEach, describe, expect, it } from "vitest";
import {
  checkOriginList,
  entriesOf,
  isAllowedOrigin,
  originOf,
} from "./allowedOrigins.js";
import EnvVars from "./EnvVars.js";

const original = {
  origins: EnvVars.CORS.AllowedOrigins,
  patterns: EnvVars.CORS.AllowedOriginsPatterns,
};

const useLists = (origins: string[], patterns: RegExp[]) => {
  Object.defineProperty(EnvVars.CORS, "AllowedOrigins", {
    value: origins,
    configurable: true,
  });
  Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
    value: patterns,
    configurable: true,
  });
};

afterEach(() => {
  useLists(original.origins, original.patterns);
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
    useLists(["https://app.variamos.com"], [/.*/]);

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
    useLists(["https://app.variamos.com"], []);

    expect(isAllowedOrigin("null")).toBe(false);
  });
});

describe("isAllowedOrigin with the former patterns", () => {
  it("reads the patterns while the exact list is empty", () => {
    useLists([], [/^https?:\/\/app\.variamos\.com$/]);

    expect(isAllowedOrigin("https://app.variamos.com")).toBe(true);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
  });

  it("refuses the origin null even when a pattern would accept it", () => {
    useLists([], [/.*/]);

    expect(isAllowedOrigin("null")).toBe(false);
    expect(isAllowedOrigin("https://any.example")).toBe(true);
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

  it("warns in production when only the former patterns are set", () => {
    const env = { CORS_ALLOWED_ORIGINS_PATTERNS: "^https://a\\.example$" };

    expect(checkOriginList(env, "production")).toEqual({
      errors: [],
      warnings: [expect.stringContaining("CORS_ALLOWED_ORIGINS is not set")],
    });
  });

  it.each([
    [{}],
    [{ CORS_ALLOWED_ORIGINS_PATTERNS: "" }],
    [{ CORS_ALLOWED_ORIGINS_PATTERNS: "^https://a\\.example$," }],
  ])(
    "refuses to start in production with a pattern that allows every origin (%j)",
    (env) => {
      expect(checkOriginList(env, "production").errors).toEqual([
        expect.stringContaining("allows every origin"),
      ]);
    },
  );

  it.each(["development", "test", ""])(
    "lets %j start without any list",
    (nodeEnv) => {
      expect(checkOriginList({}, nodeEnv)).toEqual({
        errors: [],
        warnings: [],
      });
    },
  );
});
