import { describe, expect, it } from "vitest";
import {
  type DatabaseTarget,
  decideAutomaticWrites,
  isLocalDatabaseHost,
} from "./automaticWrites.js";

describe("isLocalDatabaseHost", () => {
  it.each([
    "localhost",
    "LOCALHOST",
    "db.localhost",
    "127.0.0.1",
    "127.1.2.3",
    "::1",
    "[::1]",
    "db",
    "postgres",
    "database",
    "",
  ])(
    "takes %s for a database of this machine or of the Compose project",
    (host) => {
      expect(isLocalDatabaseHost(host)).toBe(true);
    },
  );

  it.each([
    "10.0.0.5",
    "192.168.1.20",
    "203.0.113.7",
    "2001:db8::1",
    "db.example.org",
    "my-db.rds.amazonaws.com",
  ])("takes %s for a remote database", (host) => {
    expect(isLocalDatabaseHost(host)).toBe(false);
  });
});

describe("decideAutomaticWrites", () => {
  const workstation: DatabaseTarget = {
    nodeEnv: "development",
    host: "localhost",
    databaseEnvironment: null,
    allowRemote: undefined,
  };

  it("lets a workstation write to its own database", () => {
    expect(decideAutomaticWrites(workstation)).toEqual({ allowed: true });
  });

  it("refuses the production database reached through a tunnel", () => {
    expect(
      decideAutomaticWrites({
        ...workstation,
        databaseEnvironment: "production",
      }),
    ).toEqual({
      allowed: false,
      reason: "the database says it is the production database",
    });
  });

  it("refuses a database on another machine", () => {
    expect(
      decideAutomaticWrites({ ...workstation, host: "db.example.org" }),
    ).toEqual({
      allowed: false,
      reason: "the database host is not on this machine",
    });
  });

  it.each(["test", ""])(
    "refuses the remote database when NODE_ENV is %j",
    (nodeEnv) => {
      expect(
        decideAutomaticWrites({
          ...workstation,
          nodeEnv,
          databaseEnvironment: "production",
        }).allowed,
      ).toBe(false);
    },
  );

  it.each(["false", "1", "yes", ""])(
    "keeps refusing when the variable is %j instead of true",
    (allowRemote) => {
      expect(
        decideAutomaticWrites({
          ...workstation,
          host: "db.example.org",
          allowRemote,
        }).allowed,
      ).toBe(false);
    },
  );

  it("lets the explicit variable allow it, with a warning", () => {
    const decision = decideAutomaticWrites({
      ...workstation,
      databaseEnvironment: "production",
      allowRemote: "true",
    });
    expect(decision).toMatchObject({ allowed: true });
    expect(decision).toHaveProperty(
      "warning",
      expect.stringContaining("ALLOW_AUTOMATIC_WRITES_ON_REMOTE_DATABASE"),
    );
  });

  it("always lets production write to its database", () => {
    expect(
      decideAutomaticWrites({
        nodeEnv: "production",
        host: "db.example.org",
        databaseEnvironment: "production",
        allowRemote: undefined,
      }),
    ).toEqual({ allowed: true });
  });

  it("lets a local database marked for another environment be written", () => {
    expect(
      decideAutomaticWrites({ ...workstation, databaseEnvironment: "kit" }),
    ).toEqual({ allowed: true });
  });
});
