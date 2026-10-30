import { readFileSync } from "node:fs";
import { type Model, type ModelStatic, QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BugModel } from "#src/DataProviders/Bug/Bug.js";
import { BugAttachmentModel } from "#src/DataProviders/Bug/BugAttachment.js";
import { BugLogModel } from "#src/DataProviders/Bug/BugLog.js";
import { BugNoteModel } from "#src/DataProviders/Bug/BugNote.js";
import { ConfigurationModel } from "#src/DataProviders/Configuration/Configuration.js";
import { MicroServiceAuditLogModel } from "#src/DataProviders/MicroService/MicroServiceAuditLogModel.js";
import { MicroServiceDailyStatsModel } from "#src/DataProviders/MicroService/MicroServiceDailyStatsModel.js";
import { MicroServiceHealthLogModel } from "#src/DataProviders/MicroService/MicroServiceHealthLogModel.js";
import { BUG_COMPONENTS } from "#src/Domain/Bug/Entity/BugComponent.js";
import { BUG_PRIORITIES } from "#src/Domain/Bug/Entity/BugPriority.js";
import { BASELINE_TABLES, baseline } from "./0001-baseline.js";
import { ACCOUNT_LOCKOUT_ROWS } from "./0002-account-lockout-keys.js";
import { USER_MFA_TABLES } from "./0003-user-mfa.js";
import {
  TRUSTED_DEVICE_DAYS_ROW,
  TRUSTED_DEVICE_TABLE,
} from "./0004-mfa-trusted-devices.js";
import { ACTIVITY_LOG_TABLE } from "./0005-admin-activity-logs.js";
import { ACCESS_LOG_TABLE } from "./0006-admin-access-logs.js";
import { BUG_ASSIGNEES_TABLE } from "./0007-bug-assignees.js";
import {
  DAILY_STATS_KEY,
  HEALTH_LOG_INDEX,
} from "./0009-health-log-indexes.js";
import type { SchemaMigration } from "./MigrationContext.js";
import {
  ADMIN_MIGRATIONS,
  ADMIN_MIGRATIONS_TABLE,
  runMigrations,
} from "./Migrator.js";

const ALL_MIGRATIONS = ADMIN_MIGRATIONS.map((m) => m.name);

// Needs a disposable PostgreSQL (production runs 14), for example:
//   docker run -d --rm -p 55432:5432 -e POSTGRES_PASSWORD=pg postgres:14-alpine
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;

const productionSchema = (schema: string) =>
  readFileSync(
    new URL("./fixtures/production-schema-2026-10-18.sql", import.meta.url),
    "utf8",
  ).replaceAll("variamos.", `"${schema}".`);

describe.skipIf(!url)("Schema migrations on PostgreSQL", () => {
  let sequelize: Sequelize;

  const columnsOf = async (schema: string, table: string) =>
    (
      await sequelize.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = :schema AND table_name = :table ORDER BY column_name`,
        { replacements: { schema, table }, type: QueryTypes.SELECT },
      )
    ).map((row) => row.column_name);

  // pg_tables: Sequelize rewrites the rows of an information_schema.tables query
  const tablesOf = async (schema: string) =>
    (
      await sequelize.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = :schema ORDER BY tablename",
        { replacements: { schema }, type: QueryTypes.SELECT },
      )
    ).map((row) => row.tablename);

  // One connection per run, as in production: umzug keeps its storage model
  // on the connection, bound to the first schema it was given
  const migrate = async (schema: string, migrations?: SchemaMigration[]) => {
    const connection = new Sequelize(url as string, { logging: false });
    try {
      return await runMigrations(connection, schema, migrations);
    } finally {
      await connection.close();
    }
  };

  // Columns, constraints and indexes, with the schema name left out
  const structureOf = async (schema: string, leftOut: string[] = []) => {
    const select = (sql: string) =>
      sequelize.query(sql, {
        replacements: { schema, ignored: [ADMIN_MIGRATIONS_TABLE, ...leftOut] },
        type: QueryTypes.SELECT,
      });
    const structure = {
      columns: await select(
        `SELECT table_name, column_name, data_type, udt_name, character_maximum_length,
                numeric_precision, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = :schema AND table_name NOT IN (:ignored)
          ORDER BY table_name, column_name`,
      ),
      constraints: await select(
        `SELECT c.relname AS on_table, k.conname, pg_get_constraintdef(k.oid) AS def
           FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
          WHERE k.connamespace = :schema::regnamespace AND c.relname NOT IN (:ignored)
          ORDER BY k.conname`,
      ),
      indexes: await select(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = :schema AND tablename NOT IN (:ignored) ORDER BY indexname`,
      ),
    };
    return JSON.parse(JSON.stringify(structure).replaceAll(`${schema}.`, ""));
  };

  // The shared "user" table belongs to another service; only its key matters here
  const createSchema = async (schema: string) => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    await sequelize.query(
      `CREATE TABLE "${schema}"."user" ("id" text PRIMARY KEY)`,
    );
  };

  beforeAll(async () => {
    sequelize = new Sequelize(url as string, { logging: false });
    await sequelize.authenticate();
  });

  afterAll(async () => {
    await sequelize?.close();
  });

  it("creates the module tables of an empty schema, then applies nothing", async () => {
    await createSchema("t07_fresh");

    expect(await migrate("t07_fresh")).toEqual(ALL_MIGRATIONS);
    expect(await migrate("t07_fresh")).toEqual([]);
    expect(await tablesOf("t07_fresh")).toEqual(
      [
        ADMIN_MIGRATIONS_TABLE,
        "user",
        ...BASELINE_TABLES.map((t) => t.name),
        ...USER_MFA_TABLES,
        TRUSTED_DEVICE_TABLE,
        ACTIVITY_LOG_TABLE,
        ACCESS_LOG_TABLE,
        BUG_ASSIGNEES_TABLE,
      ].sort(),
    );
  });

  it("gives every column the models read and write", async () => {
    const modelColumns = <M extends Model>(model: ModelStatic<M>) => ({
      table: model.tableName,
      fields: Object.values(model.getAttributes()).map(
        (attribute) => attribute.field ?? "",
      ),
    });
    const models = [
      modelColumns(BugModel),
      modelColumns(BugAttachmentModel),
      modelColumns(BugLogModel),
      modelColumns(BugNoteModel),
      modelColumns(ConfigurationModel),
      modelColumns(MicroServiceHealthLogModel),
      modelColumns(MicroServiceDailyStatsModel),
      modelColumns(MicroServiceAuditLogModel),
    ];
    for (const { table, fields } of models) {
      const columns = await columnsOf("t07_fresh", table);
      expect({
        table,
        missing: fields.filter((f) => !columns.includes(f)),
      }).toEqual({ table, missing: [] });
    }
  });

  it("stores every priority and component of the domain, and no other component", async () => {
    const insert = (priority: string, component: string | null) =>
      sequelize.query(
        `INSERT INTO "t07_fresh"."bugs" ("title", "description", "priority", "component")
         VALUES ('t', 'd', :priority, :component)`,
        { replacements: { priority, component } },
      );

    for (const priority of BUG_PRIORITIES) await insert(priority, null);
    for (const component of BUG_COMPONENTS) await insert("medium", component);
    await expect(insert("medium", "kernel")).rejects.toThrow(
      "bugs_component_check",
    );
  });

  it("leaves an existing table and its rows untouched", async () => {
    await createSchema("t07_legacy");
    await sequelize.query(
      `CREATE TABLE "t07_legacy"."configurations" ("id" serial PRIMARY KEY, "key" text)`,
    );
    await sequelize.query(
      `INSERT INTO "t07_legacy"."configurations" ("key") VALUES ('security.password.min_length')`,
    );

    await migrate("t07_legacy", [baseline]);

    expect(await columnsOf("t07_legacy", "configurations")).toEqual([
      "id",
      "key",
    ]);
    expect(
      await sequelize.query(`SELECT "key" FROM "t07_legacy"."configurations"`, {
        type: QueryTypes.SELECT,
      }),
    ).toEqual([{ key: "security.password.min_length" }]);
    expect(await tablesOf("t07_legacy")).toContain("bugs");
  });

  it("leaves the production tables, their structure and rows untouched", async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "t07_prod" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "t07_prod"`);
    await sequelize.query(productionSchema("t07_prod"));
    await sequelize.query(
      `INSERT INTO "t07_prod"."configurations" ("key", "value", "type", "category", "target_services", "created_at", "updated_at")
       VALUES ('security.password.min_length', '12', 'number', 'security', '{admin}', now(), now())`,
    );
    await sequelize.query(
      `INSERT INTO "t07_prod"."bugs" ("title", "description", "priority")
       VALUES ('Crash', 'On save', 'high')`,
    );
    // 0009 adds an index and a key to the health tables, tested on their own
    const healthTables = [
      "microservice_health_logs",
      "microservice_daily_stats",
    ];
    const before = await structureOf("t07_prod", ["bugs", ...healthTables]);
    const bugColumns = await columnsOf("t07_prod", "bugs");

    expect(await migrate("t07_prod")).toEqual(ALL_MIGRATIONS);

    // The tables added after the baseline are new; bugs only gains its
    // component (0008); the others are unchanged
    expect(
      await structureOf("t07_prod", [
        "bugs",
        ...healthTables,
        ...USER_MFA_TABLES,
        TRUSTED_DEVICE_TABLE,
        ACTIVITY_LOG_TABLE,
        ACCESS_LOG_TABLE,
        BUG_ASSIGNEES_TABLE,
      ]),
    ).toEqual(before);
    expect(await columnsOf("t07_prod", "bugs")).toEqual(
      [...bugColumns, "component"].sort(),
    );
    expect(
      await sequelize.query(
        `SELECT "title", "priority", "component" FROM "t07_prod"."bugs"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([{ title: "Crash", priority: "high", component: null }]);
    expect(
      await sequelize.query(
        `SELECT "key", "value" FROM "t07_prod"."configurations" ORDER BY "key"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([
      { key: "bugs.rejected_retention_days", value: 7 },
      { key: "bugs.sync_interval_minutes", value: 15 },
      { key: "security.alerts.cooldown_minutes", value: 60 },
      { key: "security.alerts.failed_sign_ins.max_attempts", value: 10 },
      { key: "security.alerts.failed_sign_ins.window_minutes", value: 15 },
      { key: "security.alerts.mass_operations.max_operations", value: 20 },
      { key: "security.alerts.mass_operations.window_minutes", value: 10 },
      { key: "security.alerts.off_hours", value: "" },
      { key: "security.alerts.timezone", value: "UTC" },
      { key: "security.lockout.duration_minutes", value: 15 },
      { key: "security.lockout.max_attempts", value: 10 },
      { key: "security.mfa.trusted_device_days", value: 14 },
      { key: "security.password.min_length", value: 12 },
    ]);
  });

  it("adds the lockout keys without overwriting one an administrator set", async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "t07_keys" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "t07_keys"`);
    await sequelize.query(productionSchema("t07_keys"));
    await sequelize.query(
      `INSERT INTO "t07_keys"."configurations" ("key", "value", "type", "category", "target_services", "updated_by", "created_at", "updated_at")
       VALUES ('security.lockout.max_attempts', '5', 'number', 'security', '{variamos_ms_admin}', 'admin-1', now(), now())`,
    );

    await migrate("t07_keys");
    await migrate("t07_keys");

    const rows = await sequelize.query<{
      key: string;
      value: number;
      updated_by: string;
      target_services: string[];
    }>(
      `SELECT "key", "value", "updated_by", "target_services", "type", "category"
         FROM "t07_keys"."configurations"
        WHERE "key" LIKE 'security.lockout.%' ORDER BY "key"`,
      { type: QueryTypes.SELECT },
    );
    expect(rows).toEqual([
      {
        key: "security.lockout.duration_minutes",
        value: 15,
        updated_by: "system_migration",
        target_services: ["variamos_ms_admin"],
        type: "number",
        category: "security",
      },
      {
        key: "security.lockout.max_attempts",
        value: 5,
        updated_by: "admin-1",
        target_services: ["variamos_ms_admin"],
        type: "number",
        category: "security",
      },
    ]);
    expect(rows).toHaveLength(ACCOUNT_LOCKOUT_ROWS.length);
  });

  it("adds the trusted device days without overwriting an administrator's value", async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "t07_trusted" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "t07_trusted"`);
    await sequelize.query(productionSchema("t07_trusted"));
    await migrate("t07_trusted");
    const trustedDaysOf = async () =>
      sequelize.query<{ value: number; updated_by: string }>(
        `SELECT "value", "updated_by" FROM "t07_trusted"."configurations"
          WHERE "key" = :key`,
        {
          replacements: { key: TRUSTED_DEVICE_DAYS_ROW.key },
          type: QueryTypes.SELECT,
        },
      );
    expect(await trustedDaysOf()).toEqual([
      { value: 14, updated_by: "system_migration" },
    ]);

    await sequelize.query(`DROP SCHEMA IF EXISTS "t07_trusted2" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "t07_trusted2"`);
    await sequelize.query(productionSchema("t07_trusted2"));
    await sequelize.query(
      `INSERT INTO "t07_trusted2"."configurations" ("key", "value", "type", "category", "target_services", "updated_by", "created_at", "updated_at")
       VALUES (:key, '3', 'number', 'security', '{variamos_ms_admin}', 'admin-1', now(), now())`,
      { replacements: { key: TRUSTED_DEVICE_DAYS_ROW.key } },
    );
    await migrate("t07_trusted2");
    expect(
      await sequelize.query(
        `SELECT "value", "updated_by" FROM "t07_trusted2"."configurations"
          WHERE "key" = :key`,
        {
          replacements: { key: TRUSTED_DEVICE_DAYS_ROW.key },
          type: QueryTypes.SELECT,
        },
      ),
    ).toEqual([{ value: 3, updated_by: "admin-1" }]);
  });

  it("keeps one daily row per service and day, the one counting the most checks", async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "t09_stats" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "t09_stats"`);
    await sequelize.query(productionSchema("t09_stats"));
    const insert = (service: string, day: string, checks: number) =>
      sequelize.query(
        `INSERT INTO "t09_stats"."microservice_daily_stats"
           ("service_name", "stat_date", "uptime_percentage", "avg_latency_ms",
            "total_checks", "successful_checks", "degraded_checks", "failed_checks")
         VALUES (:service, :day, 100, 10, :checks, :checks, 0, 0)
         RETURNING "id"`,
        { replacements: { service, day, checks }, type: QueryTypes.SELECT },
      );
    // The day saved complete, then again after a partial purge, then
    // complete once more
    const [complete] = await insert("ms_a", "2026-10-01", 2880);
    await insert("ms_a", "2026-10-01", 1500);
    await insert("ms_a", "2026-10-01", 2880);
    const [other] = await insert("ms_b", "2026-10-01", 2000);
    const [nextDay] = await insert("ms_a", "2026-10-02", 2880);

    await migrate("t09_stats");

    expect(
      await sequelize.query(
        `SELECT "id" FROM "t09_stats"."microservice_daily_stats" ORDER BY "id"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([complete, other, nextDay]);
    await expect(insert("ms_a", "2026-10-02", 10)).rejects.toMatchObject({
      parent: { constraint: DAILY_STATS_KEY },
    });
    expect(
      await sequelize.query(
        `SELECT "indexdef" FROM pg_indexes
          WHERE "schemaname" = 't09_stats' AND "indexname" = :name`,
        { replacements: { name: HEALTH_LOG_INDEX }, type: QueryTypes.SELECT },
      ),
    ).toEqual([
      {
        indexdef: expect.stringContaining("(service_name, checked_at)"),
      },
    ]);
  });

  it("gives a new database the same structure as production", async () => {
    expect(await structureOf("t07_fresh")).toEqual(
      await structureOf("t07_prod"),
    );
  });

  it("rolls the baseline back as a whole when a statement fails", async () => {
    // Without the shared "user" table, the foreign keys cannot be created
    await sequelize.query(`DROP SCHEMA IF EXISTS "t07_broken" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "t07_broken"`);

    await expect(migrate("t07_broken")).rejects.toThrow();
    expect(await tablesOf("t07_broken")).toEqual([ADMIN_MIGRATIONS_TABLE]);
    expect(
      await sequelize.query(
        `SELECT count(*)::int AS n FROM "t07_broken"."${ADMIN_MIGRATIONS_TABLE}"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([{ n: 0 }]);
  });

  it("does not run against a missing schema", async () => {
    await expect(migrate("t07_absent")).rejects.toThrow();
    expect(await tablesOf("public")).not.toContain(ADMIN_MIGRATIONS_TABLE);
  });

  it("keeps one second factor per user, dropped with the user", async () => {
    await sequelize.query(
      `INSERT INTO "t07_fresh"."user" ("id") VALUES ('u-1'), ('u-2')`,
    );
    await sequelize.query(
      `INSERT INTO "t07_fresh"."user_mfa" ("user_id", "secret_encrypted") VALUES ('u-1', 'v1:x')`,
    );
    await sequelize.query(
      `INSERT INTO "t07_fresh"."user_mfa_recovery_code" ("user_id", "code_hash") VALUES ('u-1', 'h1'), ('u-1', 'h2'), ('u-2', 'h1')`,
    );

    await expect(
      sequelize.query(
        `INSERT INTO "t07_fresh"."user_mfa" ("user_id", "secret_encrypted") VALUES ('u-1', 'v1:y')`,
      ),
    ).rejects.toThrow();
    await expect(
      sequelize.query(
        `INSERT INTO "t07_fresh"."user_mfa_recovery_code" ("user_id", "code_hash") VALUES ('u-1', 'h1')`,
      ),
    ).rejects.toThrow();

    await sequelize.query(`DELETE FROM "t07_fresh"."user" WHERE "id" = 'u-1'`);

    expect(
      await sequelize.query(
        `SELECT
           (SELECT count(*)::int FROM "t07_fresh"."user_mfa") AS factors,
           (SELECT count(*)::int FROM "t07_fresh"."user_mfa_recovery_code") AS codes`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([{ factors: 0, codes: 1 }]);
  });
});
