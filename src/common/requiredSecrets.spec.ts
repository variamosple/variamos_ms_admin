import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkSecrets,
  INTERNAL_TOKEN_MIN_LENGTH,
  REQUIRED_IN_PRODUCTION,
} from "./requiredSecrets.js";

const PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const ENCRYPTION_KEY = randomBytes(32).toString("base64");
const LONG_TOKEN = "t".repeat(INTERNAL_TOKEN_MIN_LENGTH);

const COMPLETE: NodeJS.ProcessEnv = {
  ...Object.fromEntries(REQUIRED_IN_PRODUCTION.map((name) => [name, "set"])),
  NOTIFICATION_INTERNAL_TOKEN: LONG_TOKEN,
};

const WITH_GITHUB_APP: NodeJS.ProcessEnv = {
  ...COMPLETE,
  GITHUB_MANAGED_REPOS: "variamosple/VariaMosAdmin",
  GITHUB_APP_ID: "123456",
  GITHUB_PRIVATE_KEY: PRIVATE_KEY,
};

const inProduction = (env: NodeJS.ProcessEnv) =>
  checkSecrets(env, "production");

describe("checkSecrets in production", () => {
  it("accepts every secret, with or without the GitHub App", () => {
    expect(inProduction(COMPLETE)).toEqual({ errors: [], warnings: [] });
    expect(inProduction(WITH_GITHUB_APP)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("accepts the encryption keys and a private key with escaped line breaks", () => {
    const env = {
      ...WITH_GITHUB_APP,
      GITHUB_PRIVATE_KEY: PRIVATE_KEY.replaceAll("\n", "\\n"),
      CONFIG_ENCRYPTION_KEY: ENCRYPTION_KEY,
      MFA_ENCRYPTION_KEY: ` ${ENCRYPTION_KEY} `,
    };

    expect(inProduction(env).errors).toEqual([]);
  });

  it("names the missing and blank secrets", () => {
    const env = {
      ...COMPLETE,
      DB_PASSWORD: undefined,
      NOTIFICATION_INTERNAL_TOKEN: "  ",
    };

    expect(inProduction(env).errors).toEqual([
      "Missing in production: DB_PASSWORD, NOTIFICATION_INTERNAL_TOKEN",
    ]);
  });

  it("refuses to start without the SMTP account", () => {
    const env = { ...COMPLETE, SMTP_USER: "", SMTP_PASSWORD: undefined };

    expect(inProduction(env).errors).toEqual([
      "Missing in production: SMTP_USER, SMTP_PASSWORD",
    ]);
  });

  it("requires the GitHub App when a repository is managed", () => {
    const env = {
      ...COMPLETE,
      GITHUB_MANAGED_REPOS: " , variamosple/VariaMosAdmin",
      GITHUB_TOKEN: "fallback",
    };

    expect(inProduction(env).errors).toEqual([
      "Missing in production: GITHUB_APP_ID, GITHUB_PRIVATE_KEY",
    ]);
  });

  it.each([
    ["no list", undefined],
    ["an empty list", ""],
    ["a list of blanks", " , "],
  ])(
    "does not require the GitHub App with %s of managed repositories",
    (_, repos) => {
      expect(
        inProduction({ ...COMPLETE, GITHUB_MANAGED_REPOS: repos }).errors,
      ).toEqual([]);
    },
  );

  it.each([
    ["GITHUB_APP_ID", "GITHUB_PRIVATE_KEY"],
    ["GITHUB_PRIVATE_KEY", "GITHUB_APP_ID"],
  ])(
    "refuses %s without %s, even with no managed repository",
    (absent, present) => {
      const env = {
        ...COMPLETE,
        GITHUB_APP_ID: "123456",
        GITHUB_PRIVATE_KEY: PRIVATE_KEY,
        [absent]: "",
      };

      expect(inProduction(env).errors).toEqual([
        `${absent} not set while ${present} is: set GITHUB_APP_ID and GITHUB_PRIVATE_KEY together`,
      ]);
    },
  );

  it.each([
    [
      "CONFIG_ENCRYPTION_KEY",
      "CONFIG_ENCRYPTION_KEY is not 32 bytes in base64: secret configurations cannot be changed",
    ],
    [
      "MFA_ENCRYPTION_KEY",
      "MFA_ENCRYPTION_KEY is not 32 bytes in base64: two-factor enrollment is unavailable",
    ],
  ])("refuses a malformed %s", (name, message) => {
    for (const value of [
      randomBytes(16).toString("base64"),
      "not base64 at all",
    ]) {
      expect(inProduction({ ...COMPLETE, [name]: value }).errors).toEqual([
        message,
      ]);
    }
  });

  it("leaves the encryption keys optional", () => {
    const env = {
      ...COMPLETE,
      CONFIG_ENCRYPTION_KEY: "",
      MFA_ENCRYPTION_KEY: " ",
    };

    expect(inProduction(env).errors).toEqual([]);
  });

  it("refuses a private key that cannot be read", () => {
    const env = { ...WITH_GITHUB_APP, GITHUB_PRIVATE_KEY: "not-a-key" };

    expect(inProduction(env).errors).toEqual([
      "GITHUB_PRIVATE_KEY is not a readable private key: the GitHub App cannot sign in",
    ]);
  });

  it("only warns about a short internal token until it is renewed", () => {
    const env = {
      ...COMPLETE,
      NOTIFICATION_INTERNAL_TOKEN: "t".repeat(INTERNAL_TOKEN_MIN_LENGTH - 1),
    };

    expect(inProduction(env)).toEqual({
      errors: [],
      warnings: [
        "NOTIFICATION_INTERNAL_TOKEN is shorter than 32 characters: it will be refused once renewed",
      ],
    });
  });

  it("ignores the variables it does not check, such as a later migration account", () => {
    const env = {
      ...COMPLETE,
      DB_MIGRATION_USER: "migrator",
      DB_MIGRATION_PASSWORD: "",
    };

    expect(inProduction(env)).toEqual({ errors: [], warnings: [] });
  });

  it("never writes a value in its messages", () => {
    const value = "do-not-print-this-value";
    const env = {
      ...COMPLETE,
      GITHUB_MANAGED_REPOS: value,
      GITHUB_APP_ID: value,
      GITHUB_PRIVATE_KEY: value,
      SMTP_USER: value,
      SMTP_PASSWORD: "",
      CONFIG_ENCRYPTION_KEY: value,
      MFA_ENCRYPTION_KEY: value,
      NOTIFICATION_INTERNAL_TOKEN: value,
    };
    const { errors, warnings } = inProduction(env);

    expect(errors.length).toBeGreaterThan(0);
    for (const message of [...errors, ...warnings]) {
      expect(message).not.toContain(value);
      expect(message).not.toContain(value.length.toString());
    }
  });
});

describe("checkSecrets outside production", () => {
  it.each(["development", "test", ""])("refuses nothing in %j", (nodeEnv) => {
    const env = {
      GITHUB_MANAGED_REPOS: "variamosple/VariaMosAdmin",
      GITHUB_APP_ID: "123456",
      SMTP_USER: "user",
      CONFIG_ENCRYPTION_KEY: "short",
      NOTIFICATION_INTERNAL_TOKEN: "short",
    };

    expect(checkSecrets(env, nodeEnv).errors).toEqual([]);
  });

  it("warns that the mails are only logged without an SMTP account", () => {
    expect(checkSecrets({}, "development").warnings).toEqual([
      "GITHUB_APP_ID and GITHUB_PRIVATE_KEY not set: issues reach GitHub only through GITHUB_TOKEN, if it is set",
      "SMTP_USER and SMTP_PASSWORD not set: mails are only logged, not sent",
    ]);
  });

  it("warns about a half set pair and a malformed key, not about a short token", () => {
    const env = {
      ...WITH_GITHUB_APP,
      SMTP_PASSWORD: "",
      MFA_ENCRYPTION_KEY: "short",
      NOTIFICATION_INTERNAL_TOKEN: "short",
    };

    expect(checkSecrets(env, "development").warnings).toEqual([
      "SMTP_PASSWORD not set while SMTP_USER is: set SMTP_USER and SMTP_PASSWORD together",
      "MFA_ENCRYPTION_KEY is not 32 bytes in base64: two-factor enrollment is unavailable",
    ]);
  });
});
