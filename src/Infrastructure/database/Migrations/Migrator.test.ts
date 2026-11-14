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
import {
  HEALTH_CHECK_INTERVAL_BOUNDS,
  HEALTH_CHECK_INTERVAL_KEY,
  healthCheckIntervalMsOf,
} from "#src/Domain/MicroService/Entity/HealthCheckInterval.js";
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
  BUG_ISSUE_INDEX,
  bugIssueUniqueIndex,
} from "./0013-bug-issue-unique-index.js";
import {
  HEALTH_CHECK_INTERVAL_ROWS,
  healthCheckIntervalKey,
} from "./0022-health-check-interval-key.js";
import {
  HEALTH_CHECK_INTERVAL_CATEGORY_KEY,
  healthCheckIntervalCategory,
} from "./0023-health-check-interval-category.js";
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

    expect(
      SECURITY_ALERT_ROWS.map(({ key }) => key).sort((a, b) =>
        a.localeCompare(b),
      ),
    ).toEqual(
      Object.values(SECURITY_ALERT_KEYS).sort((a, b) => a.localeCompare(b)),
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

    expect(
      BUG_SCHEDULE_ROWS.map(({ key }) => key).sort((a, b) =>
        a.localeCompare(b),
      ),
    ).toEqual(
      [BUG_SYNC_INTERVAL_KEY, REJECTED_BUG_RETENTION_KEY].sort((a, b) =>
        a.localeCompare(b),
      ),
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

// Checked on PostgreSQL by Migrator.integration.test.ts
describe("bug issue unique index migration", () => {
  it("adds the index in the configured schema, and removes it when reverted", async () => {
    const { sequelize, statements } = fakeSequelize([]);
    const params = {
      name: bugIssueUniqueIndex.name,
      context: { sequelize, schema: "custom" },
    };

    await bugIssueUniqueIndex.up(params);
    await bugIssueUniqueIndex.down?.(params);

    expect(statements[0]).toContain(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${BUG_ISSUE_INDEX}"`,
    );
    expect(statements[0]).toContain('ON "custom"."bugs"');
    expect(statements[1]).toBe(
      `DROP INDEX IF EXISTS "custom"."${BUG_ISSUE_INDEX}"`,
    );
  });
});

describe("health check interval key migration", () => {
  it("adds the key the collector follows, with its 30 s default", () => {
    expect(HEALTH_CHECK_INTERVAL_ROWS.map(({ key }) => key)).toEqual([
      HEALTH_CHECK_INTERVAL_KEY,
    ]);
    const value = HEALTH_CHECK_INTERVAL_ROWS[0]?.value ?? 0;
    expect(healthCheckIntervalMsOf(value)).toBe(30_000);
    expect(value).toBeGreaterThanOrEqual(HEALTH_CHECK_INTERVAL_BOUNDS.min);
    expect(value).toBeLessThanOrEqual(HEALTH_CHECK_INTERVAL_BOUNDS.max);
  });

  it("never overwrites the key, in the configured schema", async () => {
    const { sequelize, statements } = fakeSequelize([]);

    await healthCheckIntervalKey.up({
      name: healthCheckIntervalKey.name,
      context: { sequelize, schema: "custom" },
    });

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('INSERT INTO "custom"."configurations"');
    expect(statements[0]).toContain('ON CONFLICT ("key") DO NOTHING');
  });

  it("refuses to be reverted", async () => {
    const { sequelize } = fakeSequelize([]);

    await expect(
      healthCheckIntervalKey.down?.({
        name: healthCheckIntervalKey.name,
        context: { sequelize, schema: "custom" },
      }),
    ).rejects.toThrow("cannot be reverted");
  });
});

describe("health check interval category migration", () => {
  // Records each statement with its replacements; reports one moved row
  function recordingSequelize() {
    const calls: { sql: string; replacements: unknown }[] = [];
    const query = vi.fn(
      async (sql: string, options?: { replacements?: unknown }) => {
        calls.push({ sql, replacements: options?.replacements });
        return [undefined, 1];
      },
    );
    return { sequelize: { query } as unknown as Sequelize, calls };
  }

  it("moves the interval key, still under general, to monitoring", async () => {
    const { sequelize, calls } = recordingSequelize();

    await healthCheckIntervalCategory.up({
      name: healthCheckIntervalCategory.name,
      context: { sequelize, schema: "custom" },
    });

    expect(HEALTH_CHECK_INTERVAL_CATEGORY_KEY).toBe(HEALTH_CHECK_INTERVAL_KEY);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('UPDATE "custom"."configurations"');
    expect(calls[0]?.sql).toContain('"category" = :from');
    expect(calls[0]?.sql).not.toContain('"value"');
    expect(calls[0]?.replacements).toEqual({
      key: HEALTH_CHECK_INTERVAL_KEY,
      from: "general",
      to: "monitoring",
    });
  });

  it("moves it back to general when reverted", async () => {
    const { sequelize, calls } = recordingSequelize();

    await healthCheckIntervalCategory.down?.({
      name: healthCheckIntervalCategory.name,
      context: { sequelize, schema: "custom" },
    });

    expect(calls[0]?.replacements).toEqual({
      key: HEALTH_CHECK_INTERVAL_KEY,
      from: "monitoring",
      to: "general",
    });
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
      "0012-laboratory-access-permission",
      "0013-bug-issue-unique-index",
      "0014-permission-name-format",
      "0015-versioned-functions",
      "0016-absolute-instants",
      "0017-google-identity",
      "0018-usage-metrics",
      "0019-scheduled-configuration-changes",
      "0020-user-preferences",
      "0021-user-display-preferences",
      "0022-health-check-interval-key",
      "0023-health-check-interval-category",
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
