import type { Sequelize } from "sequelize";
import { describe, expect, it, vi } from "vitest";
import { BASELINE_TABLES, baseline } from "./0001-baseline.js";
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

describe("createMigrator", () => {
  it.each(["", "  "])("refuses an empty schema (%j)", (schema) => {
    const { sequelize } = fakeSequelize([]);

    expect(() => createMigrator(sequelize, schema)).toThrow(
      "DB_SCHEMA is empty",
    );
  });

  it("lists the baseline first", () => {
    expect(ADMIN_MIGRATIONS[0]?.name).toBe("0001-baseline");
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
