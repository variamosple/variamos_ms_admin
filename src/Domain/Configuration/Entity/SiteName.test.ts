import {
  DEFAULT_SITE_NAME,
  isAcceptedSiteName,
  SITE_NAME_MAX_LENGTH,
  siteNameOf,
} from "./SiteName.js";

describe("isAcceptedSiteName", () => {
  it.each([
    "VariaMos",
    "V",
    "VariaMos — Laboratory",
    "x".repeat(SITE_NAME_MAX_LENGTH),
  ])("accepts %j", (name) => {
    expect(isAcceptedSiteName(name)).toBe(true);
  });

  it.each([
    ["an empty text", ""],
    ["a blank text", "   "],
    ["a text over 60 characters", "x".repeat(SITE_NAME_MAX_LENGTH + 1)],
    ["a line break", "Varia\nMos"],
    ["a tab", "Varia\tMos"],
    ["a number", 42],
    ["nothing", undefined],
  ])("refuses %s", (_label, value) => {
    expect(isAcceptedSiteName(value)).toBe(false);
  });
});

describe("siteNameOf", () => {
  it("gives the configured name without its outer spaces", () => {
    expect(siteNameOf("  VariaMos Lab ")).toBe("VariaMos Lab");
  });

  it.each(["", "Varia\nMos", null, 42])("gives VariaMos for %j", (value) => {
    expect(siteNameOf(value)).toBe(DEFAULT_SITE_NAME);
  });

  it("names the site VariaMos by default", () => {
    expect(DEFAULT_SITE_NAME).toBe("VariaMos");
  });
});
