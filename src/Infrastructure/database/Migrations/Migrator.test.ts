import type { Sequelize } from "sequelize";
import { describe, expect, it, vi } from "vitest";
import {
  SECURITY_ALERT_KEYS,
  SecurityAlertPolicy,
} from "#src/Domain/Activity/SecurityAlertPolicy.js";
import {
  BUG_SYNC_INTERVAL_KEY,
  bugSyncIntervalMsOf,
  isAcceptedBugSyncInterval,
  isAcceptedRejectedBugRetention,
  REJECTED_BUG_RETENTION_KEY,
  rejectedBugRetentionDaysOf,
} from "#src/Domain/Bug/Entity/BugSchedule.js";
import { AccountLockoutPolicy } from "#src/Domain/User/Entity/AccountLockoutPolicy.js";
import { ACCOUNT_LOCKOUT_KEYS } from "#src/Domain/User/Service/AccountLockoutService.js";
import { BASELINE_TABLES, baseline } from "./0001-baseline.js";
import {
  ACCOUNT_LOCKOUT_ROWS,
  accountLockoutKeys,
} from "./0002-account-lockout-keys.js";
import {
  SECURITY_ALERT_ROWS,
  securityAlertKeys,
} from "./0010-security-alert-keys.js";
import {
  BUG_SCHEDULE_ROWS,
  bugScheduleKeys,
} from "./0011-bug-schedule-keys.js";
import {
  ADMIN_MIGRATIONS,
  createMigrator,
  waitForDatabase,
} from "./Migrator.js";

// Records every statement; tables listed in `existing` are reported present
function fakeSequelize(existing: string[]) {
  const statements: string[] = [];
  const query = vi.fn(
    async (sql: string, options?: { replacements?: { name?: string } }) => {
      if (sql.includes("to_regclass")) {
        const name = options?.replacements?.name ?? "";
        return [{ exists: existing.some((t) => name === `"custom"."${t}"`) }];
      }
      statements.push(sql);
      return [];
    },
  );
  const sequelize = {
    query,
    transaction: async (work: (t: object) => Promise<void>) => work({}),
  } as unknown as Sequelize;
  return { sequelize, statements };
}

const runBaseline = (sequelize: Sequelize) =>
  baseline.up({
    name: baseline.name,
    context: { sequelize, schema: "custom" },
  });

describe("baseline migration", () => {
  it("covers the nine module tables, shared tables excluded", () => {
    expect(BASELINE_TABLES.map((t) => t.name)).toEqual([
      "bugs",
      "bug_attachments",
      "bug_status_logs",
      "bug_notes",
      "configurations",
      "password_reset_tokens",
      "microservice_health_logs",
      "microservice_daily_stats",
      "microservice_audit_logs",
    ]);
  });

  it("sends no statement when every table already exists", async () => {
    const { sequelize, statements } = fakeSequelize(
      BASELINE_TABLES.map((t) => t.name),
    );

    await runBaseline(sequelize);

    expect(statements).toEqual([]);
  });

  it("creates only the missing tables, in the configured schema", async () => {
    const { sequelize, statements } = fakeSequelize(["bugs", "configurations"]);

    await runBaseline(sequelize);

    const created = statements
      .map((sql) => /CREATE TABLE "custom"\."(\w+)"/.exec(sql)?.[1])
      .filter(Boolean);
    expect(created).toEqual([
      "bug_attachments",
      "bug_status_logs",
      "bug_notes",
      "password_reset_tokens",
      "microservice_health_logs",
      "microservice_daily_stats",
      "microservice_audit_logs",
    ]);
    expect(statements.join("\n")).not.toContain('"variamos"');
    expect(statements.join("\n")).not.toContain("enum_bugs_priority");
  });

  it("refuses to be reverted", async () => {
    const { sequelize } = fakeSequelize([]);

    await expect(
      baseline.down?.({
        name: baseline.name,
        context: { sequelize, schema: "custom" },
      }),
    ).rejects.toThrow("The baseline migration cannot be reverted.");
  });
});

describe("account lockout keys migration", () => {
  it("adds the keys the code reads, with its defaults", () => {
    const { maxAttempts, durationMinutes } = AccountLockoutPolicy.DEFAULT;

    expect(
      ACCOUNT_LOCKOUT_ROWS.map(({ key, value }) => ({ key, value })),
    ).toEqual([
      { key: ACCOUNT_LOCKOUT_KEYS.maxAttempts, value: maxAttempts },
      { key: ACCOUNT_LOCKOUT_KEYS.durationMinutes, value: durationMinutes },
    ]);
  });

  it("never overwrites a key, in the configured schema", async () => {
    const { sequelize, statements } = fakeSequelize([]);

    await accountLockoutKeys.up({
      name: accountLockoutKeys.name,
      context: { sequelize, schema: "custom" },
    });

    expect(statements).toHaveLength(2);
    for (const sql of statements) {
      expect(sql).toContain('INSERT INTO "custom"."configurations"');
      expect(sql).toContain('ON CONFLICT ("key") DO NOTHING');
    }
  });

  it("refuses to be reverted", async () => {
    const { sequelize } = fakeSequelize([]);

    await expect(
      accountLockoutKeys.down?.({
        name: accountLockoutKeys.name,
        context: { sequelize, schema: "custom" },
      }),
    ).rejects.toThrow("cannot be reverted");
  });
});

describe("security alert keys migration", () => {
  it("adds every key the code reads, with its defaults", () => {
    const policy = SecurityAlertPolicy.fromConfiguration(
      Object.fromEntries(
        Object.entries(SECURITY_ALERT_KEYS).map(([name, key]) => [
          name,
          SECURITY_ALERT_ROWS.find((row) => row.key === key)?.value,
        ]),
      ),
    );

    expect(SECURITY_ALERT_ROWS.map(({ key }) => key).sort()).toEqual(
      Object.values(SECURITY_ALERT_KEYS).sort(),
    );
    expect(policy).toEqual(SecurityAlertPolicy.DEFAULT);
  });

  it("never overwrites a key, in the configured schema", async () => {
    const { sequelize, statements } = fakeSequelize([]);

    await securityAlertKeys.up({
      name: securityAlertKeys.name,
      context: { sequelize, schema: "custom" },
    });

    expect(statements).toHaveLength(SECURITY_ALERT_ROWS.length);
    for (const sql of statements) {
      expect(sql).toContain('INSERT INTO "custom"."configurations"');
      expect(sql).toContain('ON CONFLICT ("key") DO NOTHING');
    }
  });

  it("refuses to be reverted", async () => {
    const { sequelize } = fakeSequelize([]);

    await expect(
      securityAlertKeys.down?.({
        name: securityAlertKeys.name,
        context: { sequelize, schema: "custom" },
      }),
    ).rejects.toThrow("cannot be reverted");
  });
});

describe("bug schedule keys migration", () => {
  it("adds both keys the code reads, with their defaults", () => {
    const seededValue = (key: string) =>
      BUG_SCHEDULE_ROWS.find((row) => row.key === key)?.value;

    expect(BUG_SCHEDULE_ROWS.map(({ key }) => key).sort()).toEqual(
      [BUG_SYNC_INTERVAL_KEY, REJECTED_BUG_RETENTION_KEY].sort(),
    );
    expect(bugSyncIntervalMsOf(seededValue(BUG_SYNC_INTERVAL_KEY))).toBe(
      bugSyncIntervalMsOf(undefined),
    );
    expect(isAcceptedBugSyncInterval(seededValue(BUG_SYNC_INTERVAL_KEY))).toBe(
      true,
    );
    expect(
      rejectedBugRetentionDaysOf(seededValue(REJECTED_BUG_RETENTION_KEY)),
    ).toBe(rejectedBugRetentionDaysOf(undefined));
    expect(
      isAcceptedRejectedBugRetention(seededValue(REJECTED_BUG_RETENTION_KEY)),
    ).toBe(true);
  });

  it("never overwrites a key, in the configured schema", async () => {
    const { sequelize, statements } = fakeSequelize([]);

    await bugScheduleKeys.up({
      name: bugScheduleKeys.name,
      context: { sequelize, schema: "custom" },
    });

    expect(statements).toHaveLength(BUG_SCHEDULE_ROWS.length);
    for (const sql of statements) {
      expect(sql).toContain('INSERT INTO "custom"."configurations"');
      expect(sql).toContain('ON CONFLICT ("key") DO NOTHING');
    }
  });

  it("refuses to be reverted", async () => {
    const { sequelize } = fakeSequelize([]);

    await expect(
      bugScheduleKeys.down?.({
        name: bugScheduleKeys.name,
        context: { sequelize, schema: "custom" },
      }),
    ).rejects.toThrow("cannot be reverted");
  });
});

describe("createMigrator", () => {
  it.each(["", "  "])("refuses an empty schema (%j)", (schema) => {
    const { sequelize } = fakeSequelize([]);

    expect(() => createMigrator(sequelize, schema)).toThrow(
      "DB_SCHEMA is empty",
    );
  });

  it("lists the migrations in order, the baseline first", () => {
    expect(ADMIN_MIGRATIONS.map((m) => m.name)).toEqual([
      "0001-baseline",
      "0002-account-lockout-keys",
      "0003-user-mfa",
      "0004-mfa-trusted-devices",
      "0005-admin-activity-logs",
      "0006-admin-access-logs",
      "0007-bug-assignees",
      "0008-bug-severity-component",
      "0009-health-log-indexes",
      "0010-security-alert-keys",
      "0011-bug-schedule-keys",
    ]);
  });
});

describe("waitForDatabase", () => {
  it("retries until the database answers", async () => {
    const authenticate = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(undefined);

    await waitForDatabase({ authenticate } as unknown as Sequelize, 3, 0);

    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last attempt", async () => {
    const authenticate = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      waitForDatabase({ authenticate } as unknown as Sequelize, 3, 0),
    ).rejects.toThrow("ECONNREFUSED");
    expect(authenticate).toHaveBeenCalledTimes(3);
  });
});
