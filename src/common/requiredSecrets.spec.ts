import { describe, expect, it } from "vitest";
import {
  missingRequiredSecrets,
  REQUIRED_IN_PRODUCTION,
} from "./requiredSecrets.js";

const COMPLETE = Object.fromEntries(
  REQUIRED_IN_PRODUCTION.map((name) => [name, "set"]),
);

describe("missingRequiredSecrets", () => {
  it("accepts a production environment with every secret", () => {
    expect(missingRequiredSecrets(COMPLETE, "production")).toEqual([]);
  });

  it("names the missing and blank secrets in production", () => {
    const env = {
      ...COMPLETE,
      DB_PASSWORD: undefined,
      NOTIFICATION_INTERNAL_TOKEN: "  ",
    };

    expect(missingRequiredSecrets(env, "production")).toEqual([
      "DB_PASSWORD",
      "NOTIFICATION_INTERNAL_TOKEN",
    ]);
  });

  it.each(["development", "test", ""])("requires nothing in %j", (nodeEnv) => {
    expect(missingRequiredSecrets({}, nodeEnv)).toEqual([]);
  });
});
