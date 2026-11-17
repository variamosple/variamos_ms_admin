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
import { BUG_ISSUE_INDEX } from "./0013-bug-issue-unique-index.js";
import { PERMISSION_NAME_CHECK } from "./0014-permission-name-format.js";
import {
  METRICS_FUNCTIONS,
  SIGN_UP_DEFAULT_ROLE_IDS,
} from "./0015-versioned-functions.js";
import { ABSOLUTE_INSTANT_COLUMNS } from "./0016-absolute-instants.js";
import { GOOGLE_IDENTITY_TABLE } from "./0017-google-identity.js";
import { USAGE_METRICS_FUNCTIONS } from "./0018-usage-metrics.js";
import { SCHEDULED_CHANGES_TABLE } from "./0019-scheduled-configuration-changes.js";
import { retiredUserPreferences } from "./0020-user-preferences.js";
import { USER_DISPLAY_PREFERENCES_TABLE } from "./0021-user-display-preferences.js";
import { VISIT_HISTORY_FUNCTIONS } from "./0025-visit-history.js";
import { USAGE_OVERVIEW_FUNCTIONS } from "./0026-usage-overview.js";
import { SIGN_INS_BY_HOUR_FUNCTIONS } from "./0028-sign-ins-by-hour.js";
import {
  VISIT_INSTANT_STEP_SECONDS,
  VISITS_BY_HOUR_FUNCTIONS,
} from "./0030-visits-by-hour.js";
import { VISIT_DAY_INDEX } from "./0031-visit-day-index.js";
import { KNOWN_DEVICES_TABLE } from "./0033-known-devices.js";
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
    const withoutSchema: unknown = JSON.parse(
      JSON.stringify(structure).replaceAll(`${schema}.`, ""),
    );
    return withoutSchema;
  };

  // The shared "user" table belongs to another service; only its key matters here
  const createSchema = async (schema: string) => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${schema}"`);
    await sequelize.query(
      `CREATE TABLE "${schema}"."user" ("id" text PRIMARY KEY)`,
    );
  };
  // The columns of the shared user table that the statistics read
  const addAccountColumns = (schema: string) =>
    sequelize.query(`ALTER TABLE "${schema}"."user"
      ADD COLUMN IF NOT EXISTS "created_at" date NOT NULL DEFAULT current_date,
      ADD COLUMN IF NOT EXISTS "is_deleted" boolean NOT NULL DEFAULT false`);

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
        GOOGLE_IDENTITY_TABLE,
        SCHEDULED_CHANGES_TABLE,
        USER_DISPLAY_PREFERENCES_TABLE,
        KNOWN_DEVICES_TABLE,
      ].sort((a, b) => a.localeCompare(b)),
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
    // 0016 gives the reset tokens absolute instants, tested on their own
    const before = await structureOf("t07_prod", [
      "bugs",
      "password_reset_tokens",
      ...healthTables,
    ]);
    const bugColumns = await columnsOf("t07_prod", "bugs");

    expect(await migrate("t07_prod")).toEqual(ALL_MIGRATIONS);

    // The tables added after the baseline are new; bugs only gains its
    // component (0008); the others are unchanged
    expect(
      await structureOf("t07_prod", [
        "bugs",
        "password_reset_tokens",
        ...healthTables,
        ...USER_MFA_TABLES,
        TRUSTED_DEVICE_TABLE,
        ACTIVITY_LOG_TABLE,
        ACCESS_LOG_TABLE,
        BUG_ASSIGNEES_TABLE,
        GOOGLE_IDENTITY_TABLE,
        SCHEDULED_CHANGES_TABLE,
        USER_DISPLAY_PREFERENCES_TABLE,
        KNOWN_DEVICES_TABLE,
      ]),
    ).toEqual(before);
    expect(await columnsOf("t07_prod", "bugs")).toEqual(
      [...bugColumns, "component"].sort((a, b) => a.localeCompare(b)),
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
      { key: "monitoring.alerts.failures_before_alert", value: 3 },
      { key: "monitoring.alerts.recipients", value: "" },
      { key: "monitoring.health_check_interval_seconds", value: 30 },
      { key: "security.alerts.cooldown_minutes", value: 60 },
      { key: "security.alerts.failed_sign_ins.max_attempts", value: 10 },
      { key: "security.alerts.failed_sign_ins.window_minutes", value: 15 },
      { key: "security.alerts.mass_operations.max_operations", value: 20 },
      { key: "security.alerts.mass_operations.window_minutes", value: 10 },
      { key: "security.alerts.new_device.scope", value: "administrators" },
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

  it("files the interval key under monitoring, keeping an administrator's value", async () => {
    const intervalOf = async (schema: string) =>
      sequelize.query<{ value: number; category: string }>(
        `SELECT "value", "category" FROM "${schema}"."configurations"
          WHERE "key" = 'monitoring.health_check_interval_seconds'`,
        { type: QueryTypes.SELECT },
      );
    await sequelize.query(`DROP SCHEMA IF EXISTS "t07_interval" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "t07_interval"`);
    await sequelize.query(productionSchema("t07_interval"));
    await sequelize.query(
      `INSERT INTO "t07_interval"."configurations" ("key", "value", "type", "category", "target_services", "updated_by", "created_at", "updated_at")
       VALUES ('monitoring.health_check_interval_seconds', '45', 'number', 'general', '{variamos_ms_admin}', 'admin-1', now(), now())`,
    );

    await migrate("t07_interval");
    await migrate("t07_interval");

    expect(await intervalOf("t07_interval")).toEqual([
      { value: 45, category: "monitoring" },
    ]);

    // A database without the key gets it from 0022, then 0023 files it
    await sequelize.query(`DROP SCHEMA IF EXISTS "t07_interval_new" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "t07_interval_new"`);
    await sequelize.query(productionSchema("t07_interval_new"));
    await migrate("t07_interval_new");
    expect(await intervalOf("t07_interval_new")).toEqual([
      { value: 30, category: "monitoring" },
    ]);
    expect(
      await sequelize.query(
        `SELECT "key", "category" FROM "t07_interval_new"."configurations"
          WHERE "key" LIKE 'monitoring.alerts.%' ORDER BY "key"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([
      {
        key: "monitoring.alerts.failures_before_alert",
        category: "monitoring",
      },
      { key: "monitoring.alerts.recipients", category: "monitoring" },
    ]);
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

  it("keeps one bug per GitHub issue, bugs without an issue aside (EV-101)", async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "t13_bugs" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "t13_bugs"`);
    await sequelize.query(productionSchema("t13_bugs"));
    await migrate("t13_bugs");
    const insert = (repo: string, issue: number | null) =>
      sequelize.query(
        `INSERT INTO "t13_bugs"."bugs"
           ("title", "description", "github_repo", "git_issue_number")
         VALUES ('A bug', 'Steps', :repo, :issue)`,
        { replacements: { repo, issue } },
      );

    await insert("variamosple/VariaMosPLE", 7);
    await insert("variamosple/VariaMosAdmin", 7);
    await insert("variamosple/VariaMosPLE", null);
    await insert("variamosple/VariaMosPLE", null);

    await expect(insert("variamosple/VariaMosPLE", 7)).rejects.toMatchObject({
      parent: { constraint: BUG_ISSUE_INDEX },
    });
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
  // The permission tables belong to the shared schema: created here by hand
  const createPermissionTables = async (schema: string, names: string[]) => {
    await sequelize.query(
      `CREATE TABLE "${schema}"."role" ("id" serial PRIMARY KEY, "name" text NOT NULL)`,
    );
    await sequelize.query(
      `CREATE TABLE "${schema}"."permission" ("id" serial PRIMARY KEY, "name" text NOT NULL)`,
    );
    await sequelize.query(
      `CREATE TABLE "${schema}"."role_permission" ("role_id" int, "permission_id" int)`,
    );
    await sequelize.query(
      `CREATE TABLE "${schema}"."user_role" ("user_id" text, "role_id" int)`,
    );
    for (const name of names) {
      await sequelize.query(
        `INSERT INTO "${schema}"."permission" ("name") VALUES (:name)`,
        { replacements: { name } },
      );
    }
  };

  const insertPermission = (schema: string, name: string) =>
    sequelize.query(
      `INSERT INTO "${schema}"."permission" ("name") VALUES (:name)`,
      { replacements: { name } },
    );

  const checkOf = async (schema: string) =>
    sequelize.query<{ validated: boolean }>(
      `SELECT convalidated AS validated FROM pg_constraint
        WHERE conname = :check AND connamespace = :schema::regnamespace`,
      {
        replacements: { schema, check: PERMISSION_NAME_CHECK },
        type: QueryTypes.SELECT,
      },
    );

  it("refuses a permission name out of format (EV-70 lot 4)", async () => {
    await createSchema("t14_perm");
    await createPermissionTables("t14_perm", ["bugs::query"]);

    await migrate("t14_perm");

    expect(await checkOf("t14_perm")).toEqual([{ validated: true }]);
    await insertPermission("t14_perm", "admin::notifications::dispatch");
    await expect(insertPermission("t14_perm", "Bugs:update")).rejects.toThrow(
      PERMISSION_NAME_CHECK,
    );
  });

  it("keeps the names already out of format, and checks the new ones", async () => {
    await createSchema("t14_legacy");
    await createPermissionTables("t14_legacy", ["bugs::query", "Old Name"]);

    await migrate("t14_legacy");

    expect(await checkOf("t14_legacy")).toEqual([{ validated: false }]);
    expect(
      await sequelize.query(
        `SELECT "name" FROM "t14_legacy"."permission" ORDER BY "id"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([
      { name: "bugs::query" },
      { name: "Old Name" },
      // Added by 0012 and 0029, which find the permission tables here
      { name: "laboratory::access" },
      { name: "configurations::create" },
    ]);
    await expect(insertPermission("t14_legacy", "new name")).rejects.toThrow(
      PERMISSION_NAME_CHECK,
    );
  });

  it("gives the create permission to every role that may update a setting (0029)", async () => {
    await createSchema("t29_create");
    await createPermissionTables("t29_create", [
      "configurations::update",
      "configurations::query",
    ]);
    // Role 1 updates, role 2 only reads, role 3 already has both
    await sequelize.query(
      `INSERT INTO "t29_create"."role" ("name")
       VALUES ('Administrator'), ('Reader'), ('Operator')`,
    );
    await sequelize.query(
      `INSERT INTO "t29_create"."permission" ("name") VALUES ('configurations::create')`,
    );
    await sequelize.query(
      `INSERT INTO "t29_create"."role_permission" ("role_id", "permission_id")
       VALUES (1, 1), (2, 2), (3, 1), (3, 3)`,
    );

    await migrate("t29_create");
    // A second run grants nothing more
    await migrate("t29_create");

    expect(
      await sequelize.query(
        `SELECT rp."role_id", count(*)::int AS "count"
           FROM "t29_create"."role_permission" rp
           JOIN "t29_create"."permission" p ON p."id" = rp."permission_id"
          WHERE p."name" = 'configurations::create'
          GROUP BY rp."role_id" ORDER BY rp."role_id"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([
      { role_id: 1, count: 1 },
      { role_id: 3, count: 1 },
    ]);
    // The one created by hand is kept, not doubled
    expect(
      await sequelize.query(
        `SELECT count(*)::int AS "count" FROM "t29_create"."permission"
          WHERE "name" = 'configurations::create'`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([{ count: 1 }]);
  });

  it("gives a new account its default roles, and every statistics function (EV-90)", async () => {
    await createSchema("t15_signup");
    await createPermissionTables("t15_signup", []);

    await migrate("t15_signup");
    await sequelize.query(
      `INSERT INTO "t15_signup"."user" ("id") VALUES ('new-user')`,
    );

    expect(
      await sequelize.query(
        `SELECT "role_id" FROM "t15_signup"."user_role" WHERE "user_id" = 'new-user' ORDER BY "role_id"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual(SIGN_UP_DEFAULT_ROLE_IDS.map((role_id) => ({ role_id })));
    expect(
      await sequelize.query(
        `SELECT p.proname FROM pg_proc p
          WHERE p.pronamespace = 't15_signup'::regnamespace
            AND p.proname NOT LIKE '%_append_only' ORDER BY p.proname`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual(
      [
        ...METRICS_FUNCTIONS,
        ...USAGE_METRICS_FUNCTIONS,
        ...VISIT_HISTORY_FUNCTIONS,
        ...USAGE_OVERVIEW_FUNCTIONS,
        ...SIGN_INS_BY_HOUR_FUNCTIONS,
        ...VISITS_BY_HOUR_FUNCTIONS,
        // A second one, with a period (0018, 0026)
        "get_top_visited_pages_metrics",
        "get_metrics",
        // A third one, with the reader's time zone (0028)
        "get_metrics",
        "insert_user_role",
      ]
        .sort((a, b) => a.localeCompare(b))
        .map((proname) => ({ proname })),
    );
  });

  it("adds no sign-up trigger without the shared user_role table", async () => {
    expect(
      await sequelize.query(
        `SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relnamespace = 't07_fresh'::regnamespace AND t.tgname = 'after_insert_user'`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([]);
  });

  it("keeps each stored instant when the columns gain a time zone (EV-116)", async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "t16_dates" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "t16_dates"`);
    await sequelize.query(productionSchema("t16_dates"));
    await sequelize.query(
      `INSERT INTO "t16_dates"."user" ("id") VALUES ('u-1')`,
    );
    await sequelize.query(
      `INSERT INTO "t16_dates"."password_reset_tokens"
         ("user_id", "token_hash", "expires_at", "used_at", "created_at")
       VALUES ('u-1', 'h', '2026-11-10 23:30:00', '2026-11-10 23:00:00', '2026-11-10 22:30:00')`,
    );

    await migrate("t16_dates");

    const types = await sequelize.query<{
      table_name: string;
      column_name: string;
      udt_name: string;
    }>(
      `SELECT table_name, column_name, udt_name FROM information_schema.columns
        WHERE table_schema = 't16_dates' AND udt_name LIKE 'timestamp%'`,
      { type: QueryTypes.SELECT },
    );
    expect(types.filter((c) => c.udt_name !== "timestamptz")).toEqual([]);
    for (const { table, column } of ABSOLUTE_INSTANT_COLUMNS) {
      expect(types).toContainEqual({
        table_name: table,
        column_name: column,
        udt_name: "timestamptz",
      });
    }
    expect(
      await sequelize.query(
        `SELECT to_char("expires_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS expires,
                to_char("used_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS used,
                to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS created
           FROM "t16_dates"."password_reset_tokens"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([
      {
        expires: "2026-11-10 23:30",
        used: "2026-11-10 23:00",
        created: "2026-11-10 22:30",
      },
    ]);
  });
  it("links one Google account per account, dropped with the account (EV-70 lot 5)", async () => {
    await sequelize.query(
      `INSERT INTO "t07_fresh"."user" ("id") VALUES ('g-1'), ('g-2')`,
    );
    const link = (sub: string, user: string) =>
      sequelize.query(
        `INSERT INTO "t07_fresh"."${GOOGLE_IDENTITY_TABLE}" ("google_sub", "user_id") VALUES (:sub, :user)`,
        { replacements: { sub, user } },
      );

    await link("sub-1", "g-1");
    await expect(link("sub-1", "g-2")).rejects.toThrow();
    await expect(link("sub-2", "g-1")).rejects.toThrow();
    await link("sub-2", "g-2");
    await sequelize.query(`DELETE FROM "t07_fresh"."user" WHERE "id" = 'g-1'`);

    expect(
      await sequelize.query(
        `SELECT "google_sub", "user_id" FROM "t07_fresh"."${GOOGLE_IDENTITY_TABLE}"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([{ google_sub: "sub-2", user_id: "g-2" }]);
  });
  it("keeps one planned change per setting, dropped with the setting (EV-115 lot B)", async () => {
    const table = `"t07_fresh"."${SCHEDULED_CHANGES_TABLE}"`;
    await sequelize.query(
      `INSERT INTO "t07_fresh"."configurations"
         ("key", "value", "type", "category", "target_services", "created_at", "updated_at")
       VALUES ('test.planned', '1', 'number', 'general', '{all}', now(), now())`,
    );
    const plan = (status = "scheduled") =>
      sequelize.query(
        `INSERT INTO ${table} ("config_key", "previous_value", "new_value", "due_at", "status", "created_by")
         VALUES ('test.planned', '1', '2', now() + interval '1 day', :status, 'admin')`,
        { replacements: { status } },
      );

    await plan();
    await expect(plan()).rejects.toThrow();
    await plan("applied");
    await plan("cancelled");
    await expect(plan("pending")).rejects.toThrow();
    await sequelize.query(`UPDATE ${table} SET "status" = 'conflict'`);
    await plan();
    expect(
      await sequelize.query(
        `SELECT "status", "new_value" FROM ${table} ORDER BY "id"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([
      { status: "conflict", new_value: 2 },
      { status: "conflict", new_value: 2 },
      { status: "conflict", new_value: 2 },
      { status: "scheduled", new_value: 2 },
    ]);

    await sequelize.query(
      `DELETE FROM "t07_fresh"."configurations" WHERE "key" = 'test.planned'`,
    );
    expect(
      await sequelize.query(`SELECT 1 FROM ${table}`, {
        type: QueryTypes.SELECT,
      }),
    ).toEqual([]);
  });
  it("keeps one row of preferences per account, dropped with the account (EV-115 lot C)", async () => {
    const table = `"t07_fresh"."${USER_DISPLAY_PREFERENCES_TABLE}"`;
    await sequelize.query(
      `INSERT INTO "t07_fresh"."user" ("id") VALUES ('p-1'), ('p-2')`,
    );
    const save = (user: string, zone: string | null) =>
      sequelize.query(
        `INSERT INTO ${table} ("user_id", "time_zone") VALUES (:user, :zone)`,
        { replacements: { user, zone } },
      );

    await save("p-1", "America/Bogota");
    await expect(save("p-1", "Europe/Paris")).rejects.toThrow();
    await expect(save("nobody", null)).rejects.toThrow();
    await save("p-2", null);
    await sequelize.query(`DELETE FROM "t07_fresh"."user" WHERE "id" = 'p-1'`);

    expect(
      await sequelize.query(`SELECT "user_id", "time_zone" FROM ${table}`, {
        type: QueryTypes.SELECT,
      }),
    ).toEqual([{ user_id: "p-2", time_zone: null }]);
  });
  it("leaves the user_preferences table of the notifications untouched, even going back (0020)", async () => {
    const S = "t20_notifications";
    await createSchema(S);
    // As the notifications service made it in production
    await sequelize.query(`
      CREATE TABLE "${S}".user_preferences (
        user_id character varying(100) NOT NULL PRIMARY KEY,
        email_enabled boolean DEFAULT true NOT NULL,
        in_app_enabled boolean DEFAULT true NOT NULL,
        muted_event_types text[] DEFAULT '{}'::text[] NOT NULL);
      INSERT INTO "${S}".user_preferences (user_id, email_enabled) VALUES ('n-1', false);`);
    const notificationTable = () =>
      sequelize.query(
        `SELECT column_name, data_type, column_default FROM information_schema.columns
          WHERE table_schema = :S AND table_name = 'user_preferences'
         UNION ALL
         SELECT k.conname, pg_get_constraintdef(k.oid), NULL FROM pg_constraint k
          WHERE k.conrelid = :table::regclass
         ORDER BY 1`,
        {
          replacements: { S, table: `"${S}".user_preferences` },
          type: QueryTypes.SELECT,
        },
      );
    const before = await notificationTable();
    expect(before).toHaveLength(5);

    expect(await migrate(S)).toEqual(ALL_MIGRATIONS);
    await retiredUserPreferences.down?.({
      name: retiredUserPreferences.name,
      context: { sequelize, schema: S },
    });

    expect(await notificationTable()).toEqual(before);
    expect(
      await sequelize.query(
        `SELECT user_id, email_enabled FROM "${S}".user_preferences`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([{ user_id: "n-1", email_enabled: false }]);
    expect(await columnsOf(S, USER_DISPLAY_PREFERENCES_TABLE)).toEqual([
      "time_zone",
      "updated_at",
      "user_id",
    ]);
  });
  describe("usage statistics (EV-90 lots A.2 and A.3)", () => {
    const S = "t18_usage";
    const chartOf = async (call: string) => {
      const [row] = await sequelize.query<{ char_data: { data: unknown } }>(
        `SELECT char_data FROM "${S}".${call}`,
        { type: QueryTypes.SELECT },
      );
      return row?.char_data.data;
    };
    const period = "('2026-09-01', '2026-10-31')";

    beforeAll(async () => {
      await createSchema(S);
      // Tables of the other services, reduced to what the statistics read
      await sequelize.query(`
        CREATE TABLE "${S}".country ("code" varchar(2), "name" text);
        CREATE TABLE "${S}".page_visit ("page_id" varchar(48), "user_id" text NOT NULL,
          "visit_date" date NOT NULL, "country_code" varchar(2));
        CREATE TABLE "${S}".project ("id" text PRIMARY KEY, "date" timestamptz,
          "is_deleted" boolean NOT NULL DEFAULT false, "is_collaborative" boolean NOT NULL DEFAULT false);
        CREATE TABLE "${S}".project_history ("project_id" varchar(255), "user_id" varchar(255),
          "created_at" timestamptz NOT NULL);
        CREATE TABLE "${S}".model ("id" text, "project_id" text, "language_id" integer,
          "engineering_type" text, "is_deleted" boolean NOT NULL DEFAULT false);
        CREATE TABLE "${S}".language ("id" integer, "name" text);
        INSERT INTO "${S}".country VALUES ('CO', 'Colombia'), ('FR', 'France');
        INSERT INTO "${S}".page_visit VALUES
          ('home', 'u1', '2026-09-03', 'CO'), ('home', 'u1', '2026-09-03', 'CO'),
          ('home', 'u2', '2026-09-03', 'FR'), ('list', 'u2', '2026-09-20', 'FR'),
          ('home', 'u3', '2025-12-31', NULL);
        INSERT INTO "${S}".project VALUES
          ('p1', '2026-09-10T12:00:00Z'), ('p2', '2026-10-05T12:00:00Z'), ('p3', NULL),
          ('p4', '2025-01-01T12:00:00Z');
        INSERT INTO "${S}".project_history VALUES
          ('p3', 'u6', '2026-09-15T12:00:00Z'), ('p1', 'u1', '2026-09-12T12:00:00Z');
        INSERT INTO "${S}".model VALUES
          ('m1', 'p1', 1), ('m2', 'p1', 1), ('m3', 'p2', 2), ('m4', 'p3', 1), ('m5', 'p4', 2);
        INSERT INTO "${S}".language VALUES (1, 'Feature'), (2, 'Class');
      `);
      await addAccountColumns(S);
      await migrate(S);
      // 23:30 in Bogotá on 30 September is 1 October in UTC
      await sequelize.query(`
        INSERT INTO "${S}".admin_access_logs ("occurred_at", "event", "outcome", "user_id") VALUES
          ('2026-09-30T23:30:00-05:00', 'sign-in', 'success', 'u4'),
          ('2026-09-10T12:00:00Z', 'sign-in', 'failed', 'u5')
      `);
    });

    it("counts the recorded visits by page and day, month and year", async () => {
      expect(await chartOf(`get_daily_visits_metrics${period}`)).toEqual([
        { page: "home", count: 3, date: "2026-09-03" },
        { page: "list", count: 1, date: "2026-09-20" },
      ]);
      expect(await chartOf(`get_daily_unique_visits_metrics${period}`)).toEqual(
        [
          { page: "home", count: 2, date: "2026-09-03" },
          { page: "list", count: 1, date: "2026-09-20" },
        ],
      );
      expect(await chartOf(`get_monthly_visits_metrics${period}`)).toEqual([
        { page: "home", count: 3, date: "2026-09" },
        { page: "list", count: 1, date: "2026-09" },
      ]);
      expect(await chartOf(`get_top_visited_pages_metrics${period}`)).toEqual([
        { page: "home", count: 3 },
        { page: "list", count: 1 },
      ]);
      expect(await chartOf("get_yearly_visits_metrics()")).toEqual({
        "2025": [["NO COUNTRY", 1]],
        "2026": [
          ["Colombia", 2],
          ["France", 2],
        ],
      });
    });

    it("counts an account once a month, whether it visited, signed in or changed a project", async () => {
      expect(
        await chartOf(`get_monthly_active_users_metrics${period}`),
      ).toEqual([
        { series: "Active users", count: 3, date: "2026-09" },
        { series: "Active users", count: 1, date: "2026-10" },
      ]);
    });

    it("counts a project changed or saved in the month, once", async () => {
      expect(
        await chartOf(`get_monthly_active_projects_metrics${period}`),
      ).toEqual([
        { series: "Active projects", count: 2, date: "2026-09" },
        { series: "Active projects", count: 1, date: "2026-10" },
      ]);
    });

    it("ranks the languages by the active projects that use them", async () => {
      expect(await chartOf(`get_top_languages_metrics${period}`)).toEqual([
        { language: "Feature", count: 2 },
        { language: "Class", count: 1 },
      ]);
    });

    it("gives every chart of the page for a period, empty without the tables of the other services", async () => {
      const read = async (schema: string) => {
        const [row] = await sequelize.query<{
          data: { id: string; data: unknown }[];
        }>(
          `SELECT "${schema}".get_metrics('2026-09-01', '2026-10-31') AS data`,
          {
            type: QueryTypes.SELECT,
          },
        );
        return row?.data ?? [];
      };
      const ids = [
        "overview",
        "content_overview",
        "visits_over_time",
        "activity_over_time",
        "top_visited_pages",
        "top_languages",
        "sign_ins",
        "sign_ins_by_hour",
        "new_accounts",
        "models_by_type",
        "yearly_visits",
        "visits_by_hour",
      ];

      expect((await read(S)).map((c) => c.id)).toEqual(ids);
      await addAccountColumns("t07_fresh");
      const empty = await read("t07_fresh");
      expect(empty.map((c) => c.id)).toEqual(ids);
      // The key figures count 0 (no account yet); the charts have nothing to draw
      expect(empty.filter((c) => c.data !== null).map((c) => c.id)).toEqual([
        "overview",
        "content_overview",
      ]);
    });

    it("gives the last 30 days without a period", async () => {
      const [row] = await sequelize.query<{ data: { id: string }[] }>(
        `SELECT "${S}".get_metrics() AS data`,
        { type: QueryTypes.SELECT },
      );
      expect(row?.data.map((c) => c.id)).toContain("overview");
    });
  });

  describe("visits kept only in the summary (EV-90, pgAgent job until May 2025)", () => {
    const S = "t25_history";
    const chartOf = async (call: string) => {
      const [row] = await sequelize.query<{ char_data: { data: unknown } }>(
        `SELECT char_data FROM "${S}".${call}`,
        { type: QueryTypes.SELECT },
      );
      return row?.char_data.data;
    };
    const period = "('2025-05-01', '2025-05-31')";

    beforeAll(async () => {
      await createSchema(S);
      // The job deleted each summed day from page_visit: the 15th is in both,
      // as on the night it ran, and must be counted once, from page_visit
      await sequelize.query(`
        CREATE TABLE "${S}".page_visit ("page_id" varchar(48), "user_id" text NOT NULL,
          "visit_date" date NOT NULL, "country_code" varchar(2));
        CREATE TABLE "${S}".visits_summary ("page_id" text NOT NULL,
          "unique_visits" bigint NOT NULL, "visits" bigint NOT NULL, "visits_date" date NOT NULL);
        INSERT INTO "${S}".visits_summary VALUES
          ('home', 2, 5, '2025-04-30'), ('home', 2, 3, '2025-05-12'),
          ('list', 1, 4, '2025-05-12'), ('home', 9, 9, '2025-05-15');
        INSERT INTO "${S}".page_visit VALUES
          ('home', 'u1', '2025-05-15', 'CO'), ('home', 'u1', '2025-05-15', 'CO'),
          ('list', 'u2', '2025-05-16', 'FR');
      `);
      await migrate(S);
    });

    it("adds the summed days before the first recorded visit, without counting a day twice", async () => {
      expect(await chartOf(`get_daily_visits_metrics${period}`)).toEqual([
        { page: "home", count: 3, date: "2025-05-12" },
        { page: "list", count: 4, date: "2025-05-12" },
        { page: "home", count: 2, date: "2025-05-15" },
        { page: "list", count: 1, date: "2025-05-16" },
      ]);
      expect(await chartOf(`get_daily_unique_visits_metrics${period}`)).toEqual(
        [
          { page: "home", count: 2, date: "2025-05-12" },
          { page: "list", count: 1, date: "2025-05-12" },
          { page: "home", count: 1, date: "2025-05-15" },
          { page: "list", count: 1, date: "2025-05-16" },
        ],
      );
      expect(
        await chartOf("get_monthly_visits_metrics('2025-04-01', '2025-05-31')"),
      ).toEqual([
        { page: "home", count: 5, date: "2025-04" },
        { page: "home", count: 5, date: "2025-05" },
        { page: "list", count: 5, date: "2025-05" },
      ]);
      expect(await chartOf(`get_top_visited_pages_metrics${period}`)).toEqual([
        { page: "home", count: 5 },
        { page: "list", count: 5 },
      ]);
    });

    it("matches a direct count of both tables over the whole history (MA-EU-01)", async () => {
      const [direct] = await sequelize.query<{ total: string }>(
        `SELECT (SELECT count(*) FROM "${S}".page_visit)
              + (SELECT coalesce(sum(visits), 0) FROM "${S}".visits_summary
                 WHERE visits_date < (SELECT min(visit_date) FROM "${S}".page_visit)) AS total`,
        { type: QueryTypes.SELECT },
      );
      const monthly = (await chartOf(
        "get_monthly_visits_metrics('2000-01-01', '2100-01-01')",
      )) as { count: number }[];
      expect(monthly.reduce((sum, row) => sum + row.count, 0)).toBe(
        Number(direct?.total),
      );
    });

    it("reads the summary alone when no visit is recorded yet", async () => {
      await sequelize.query(`TRUNCATE "${S}".page_visit`);
      expect(await chartOf(`get_top_visited_pages_metrics${period}`)).toEqual([
        { page: "home", count: 12 },
        { page: "list", count: 4 },
      ]);
    });
  });

  describe("statistics page for one period (EV-90)", () => {
    const S = "t26_overview";
    const chartOf = async (call: string) => {
      const [row] = await sequelize.query<{ char_data: { data: unknown } }>(
        `SELECT char_data FROM "${S}".${call}`,
        { type: QueryTypes.SELECT },
      );
      return row?.char_data.data;
    };
    // A week, after the week of 25 to 31 August
    const week = "('2026-09-01', '2026-09-07')";

    beforeAll(async () => {
      await createSchema(S);
      await addAccountColumns(S);
      await sequelize.query(`
        CREATE TABLE "${S}".page_visit ("page_id" varchar(48), "user_id" text NOT NULL,
          "visit_date" date NOT NULL, "country_code" varchar(2));
        CREATE TABLE "${S}".project ("id" text PRIMARY KEY, "date" timestamptz,
          "is_deleted" boolean NOT NULL DEFAULT false, "is_collaborative" boolean NOT NULL DEFAULT false);
        CREATE TABLE "${S}".project_history ("project_id" varchar(255), "user_id" varchar(255),
          "created_at" timestamptz NOT NULL);
        CREATE TABLE "${S}".model ("id" text, "project_id" text, "language_id" integer,
          "engineering_type" text, "is_deleted" boolean NOT NULL DEFAULT false);
        CREATE TABLE "${S}".language ("id" integer, "name" text);
        INSERT INTO "${S}".page_visit VALUES
          ('home', 'u1', '2026-09-01', 'CO'), ('home', 'u1', '2026-09-01', 'CO'),
          ('list', 'u2', '2026-09-01', 'FR'), ('home', 'u2', '2026-09-03', 'FR'),
          ('home', 'u3', '2026-08-30', NULL);
        INSERT INTO "${S}"."user" ("id", "created_at", "is_deleted") VALUES
          ('u1', '2026-08-26', false), ('u4', '2026-09-05', false),
          ('u5', '2026-09-06', false), ('u6', '2026-01-01', true);
        INSERT INTO "${S}".project VALUES
          ('p1', NULL, false, true), ('p2', '2026-09-06T12:00:00Z', false, true),
          ('p3', '2026-08-26T12:00:00Z', false, false), ('p4', NULL, true, false);
        INSERT INTO "${S}".project_history VALUES ('p1', 'u2', '2026-09-04T12:00:00Z');
        INSERT INTO "${S}".model VALUES
          ('m1', 'p1', 1, 'domainEngineering', false), ('m2', 'p2', 2, 'domainEngineering', false),
          ('m3', 'p3', 1, 'scope', false), ('m4', 'p4', 1, 'scope', true);
        INSERT INTO "${S}".language VALUES (1, 'Feature'), (2, 'Class');
      `);
      await migrate(S);
      // The second step of a two-factor sign-in is not a second sign-in
      await sequelize.query(`
        INSERT INTO "${S}".admin_access_logs ("occurred_at", "event", "outcome", "user_id") VALUES
          ('2026-09-02T10:00:00Z', 'sign-in', 'success', 'u1'),
          ('2026-09-02T10:01:00Z', 'sign-in.mfa', 'success', 'u1'),
          ('2026-09-05T10:00:00Z', 'sign-in.google', 'success', 'u4'),
          ('2026-09-05T11:00:00Z', 'sign-in', 'failed', 'u5'),
          ('2026-08-28T10:00:00Z', 'sign-in', 'success', 'u1')
      `);
    });

    it("compares each key figure with the period of the same length just before", async () => {
      expect(await chartOf(`get_overview_metrics${week}`)).toEqual([
        {
          key: "visits",
          label: "Visits",
          unit: "count",
          count: 4,
          previous: 1,
        },
        {
          key: "visitors",
          label: "Visitors",
          unit: "count",
          count: 2,
          previous: 1,
        },
        {
          key: "active_users",
          label: "Active users",
          unit: "count",
          count: 3,
          previous: 2,
        },
        // Of u1 and u3, active the week before, u1 came back
        {
          key: "returning_users",
          label: "Returning users",
          unit: "percent",
          count: 50,
          previous: null,
        },
        {
          key: "active_projects",
          label: "Active projects",
          unit: "count",
          count: 2,
          previous: 1,
        },
        {
          key: "new_accounts",
          label: "New accounts",
          unit: "count",
          count: 2,
          previous: 1,
        },
        {
          key: "sign_ins",
          label: "Sign-ins",
          unit: "count",
          count: 2,
          previous: 1,
        },
        {
          key: "failed_sign_ins",
          label: "Failed sign-ins",
          unit: "count",
          count: 1,
          previous: 0,
        },
      ]);
    });

    it("gives every day of the period, with 0 for a day without visits", async () => {
      const rows = (await chartOf(`get_visits_over_time_metrics${week}`)) as {
        series: string;
        count: number;
        date: string;
      }[];
      expect(rows).toHaveLength(14);
      expect(rows.slice(0, 6)).toEqual([
        { series: "Visits", count: 3, date: "2026-09-01" },
        { series: "Visitors", count: 2, date: "2026-09-01" },
        { series: "Visits", count: 0, date: "2026-09-02" },
        { series: "Visitors", count: 0, date: "2026-09-02" },
        { series: "Visits", count: 1, date: "2026-09-03" },
        { series: "Visitors", count: 1, date: "2026-09-03" },
      ]);
    });

    it("counts by week up to a year, by month beyond", async () => {
      const dates = async (call: string) =>
        ((await chartOf(call)) as { date: string }[]).map((r) => r.date);
      const weeks = await dates(
        "get_visits_over_time_metrics('2026-01-01', '2026-12-31')",
      );
      // 1 January 2026 is a Thursday: its week starts on Monday 29 December
      expect(weeks[0]).toBe("2025-12-29");
      expect(new Set(weeks).size).toBe(53);
      const months = await dates(
        "get_visits_over_time_metrics('2025-01-01', '2026-12-31')",
      );
      expect(new Set(months).size).toBe(24);
      expect(months.at(-1)).toBe("2026-12");
    });

    it("counts the sign-ins by method, the failures apart, and the new accounts", async () => {
      const signIns = (await chartOf(`get_sign_ins_metrics${week}`)) as {
        series: string;
        count: number;
        date: string;
      }[];
      expect(signIns.filter((r) => r.count > 0)).toEqual([
        { series: "Password", count: 1, date: "2026-09-02" },
        { series: "Google", count: 1, date: "2026-09-05" },
        { series: "Failed", count: 1, date: "2026-09-05" },
      ]);
      const accounts = (await chartOf(`get_new_accounts_metrics${week}`)) as {
        count: number;
        date: string;
      }[];
      expect(accounts.filter((r) => r.count > 0)).toEqual([
        { series: "New accounts", count: 1, date: "2026-09-05" },
        { series: "New accounts", count: 1, date: "2026-09-06" },
      ]);
    });

    it("counts what the platform holds, without the deleted rows", async () => {
      expect(await chartOf("get_content_metrics()")).toEqual([
        { key: "accounts", label: "Accounts", unit: "count", count: 3 },
        { key: "projects", label: "Projects", unit: "count", count: 3 },
        {
          key: "collaborative_projects",
          label: "Collaborative projects",
          unit: "percent",
          count: 67,
        },
        { key: "models", label: "Models", unit: "count", count: 3 },
        {
          key: "models_per_project",
          label: "Models per project",
          unit: "decimal",
          count: 1,
        },
        {
          key: "languages_in_use",
          label: "Languages in use",
          unit: "count",
          count: 2,
        },
      ]);
      expect(await chartOf("get_models_by_type_metrics()")).toEqual([
        { type: "Domain engineering", count: 2 },
        { type: "Scope", count: 1 },
      ]);
    });

    it("reads the creation of an account from a timestamp as from a date (0027)", async () => {
      await sequelize.query(`ALTER TABLE "${S}"."user"
        ALTER COLUMN "created_at" TYPE timestamptz USING "created_at"::timestamptz`);
      const accounts = (await chartOf(`get_new_accounts_metrics${week}`)) as {
        count: number;
        date: string;
      }[];
      expect(accounts.filter((r) => r.count > 0).map((r) => r.date)).toEqual([
        "2026-09-05",
        "2026-09-06",
      ]);
      const [row] = await sequelize.query<{ data: { id: string }[] }>(
        `SELECT "${S}".get_metrics${week} AS data`,
        { type: QueryTypes.SELECT },
      );
      expect(row?.data).toHaveLength(12);
    });

    // Sign-ins of the week: Wednesday 2 at 10:00 UTC (password), Saturday 5
    // at 10:00 UTC (Google); a failure and a second factor that do not count
    const gridOf = async (
      from: string,
      to: string,
      zone: string,
      counted: "sign_ins" | "visits" = "sign_ins",
    ) => {
      const [row] = await sequelize.query<{
        char_data: {
          title: string;
          chartType: string;
          data: { day: number; hour: number; count: number }[] | null;
        };
      }>(
        `SELECT char_data FROM "${S}".get_${counted}_by_hour_metrics('${from}', '${to}', ${zone})`,
        { type: QueryTypes.SELECT },
      );
      const cells = row?.char_data.data;
      return {
        title: row?.char_data.title,
        chartType: row?.char_data.chartType,
        cells: cells?.length ?? null,
        filled: cells?.filter((c) => c.count > 0) ?? null,
      };
    };
    const weekInUtc = [
      { day: 3, hour: 10, count: 1 },
      { day: 6, hour: 10, count: 1 },
    ];

    it("counts the successful sign-ins by day of the week and hour, in the reader's zone (0028)", async () => {
      expect(await gridOf("2026-09-01", "2026-09-07", "'UTC'")).toEqual({
        title: "Sign-ins by day and hour (UTC)",
        chartType: "heatmap",
        cells: 168,
        filled: weekInUtc,
      });
      const bogota = await gridOf(
        "2026-09-01",
        "2026-09-07",
        "'America/Bogota'",
      );
      expect(bogota.filled).toEqual([
        { day: 3, hour: 5, count: 1 },
        { day: 6, hour: 5, count: 1 },
      ]);
      // A day of the period runs from midnight in the reader's zone: at
      // UTC+14, Saturday 10:00 UTC is already Sunday 6, out of the period
      const kiritimati = "'Pacific/Kiritimati'";
      expect(
        await gridOf("2026-09-01", "2026-09-05", kiritimati),
      ).toMatchObject({
        title: "Sign-ins by day and hour (Pacific/Kiritimati)",
        filled: [{ day: 4, hour: 0, count: 1 }],
      });
    });

    it("falls back to UTC for an unknown zone, and draws nothing without a sign-in (0028)", async () => {
      for (const zone of ["'Mars/Olympus'", "NULL"]) {
        expect(await gridOf("2026-09-01", "2026-09-07", zone)).toMatchObject({
          title: "Sign-ins by day and hour (UTC)",
          filled: weekInUtc,
        });
      }
      expect(await gridOf("2026-10-01", "2026-10-07", "'UTC'")).toMatchObject({
        cells: null,
        filled: null,
      });
    });

    it("gives the grid with every chart, in the zone asked or in UTC (0028)", async () => {
      const titleOf = async (call: string) => {
        const [row] = await sequelize.query<{
          data: { id: string; title: string }[];
        }>(`SELECT "${S}".${call} AS data`, { type: QueryTypes.SELECT });
        return row?.data.find((c) => c.id === "sign_ins_by_hour")?.title;
      };
      const paris = "('2026-09-01', '2026-09-07', 'Europe/Paris')";
      expect(await titleOf(`get_metrics${paris}`)).toBe(
        "Sign-ins by day and hour (Europe/Paris)",
      );
      expect(await titleOf(`get_metrics${week}`)).toBe(
        "Sign-ins by day and hour (UTC)",
      );
    });

    // The visits inserted before the migration have no instant (0030)
    it("keeps no instant for the visits recorded before, and draws nothing from them (0030)", async () => {
      const [row] = await sequelize.query<{ without: string; total: string }>(
        `SELECT count(*) FILTER (WHERE visited_at IS NULL) AS without, count(*) AS total
           FROM "${S}".page_visit`,
        { type: QueryTypes.SELECT },
      );
      expect(row).toEqual({ without: "5", total: "5" });
      expect(
        await gridOf("2026-09-01", "2026-09-07", "'UTC'", "visits"),
      ).toEqual({
        title: "Visits by day and hour (UTC), not recorded yet",
        chartType: "heatmap",
        cells: null,
        filled: null,
      });
      const [index] = await sequelize.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = '${S}' AND indexname = 'page_visit_visited_at_idx'`,
        { type: QueryTypes.SELECT },
      );
      expect(index?.indexdef).toContain("WHERE (visited_at IS NOT NULL)");
    });

    it("reads the visits of a period by their day (0031)", async () => {
      const [index] = await sequelize.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = '${S}' AND indexname = :name`,
        { replacements: { name: VISIT_DAY_INDEX }, type: QueryTypes.SELECT },
      );
      expect(index?.indexdef).toContain("(visit_date)");
    });

    it("keeps a visit without its account, out of the active accounts (0032)", async () => {
      const [column] = await sequelize.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = '${S}' AND table_name = 'page_visit'
            AND column_name = 'user_id'`,
        { type: QueryTypes.SELECT },
      );
      expect(column?.is_nullable).toBe("YES");
      const activity = async () => {
        const [row] = await sequelize.query<{
          anonymous: string;
          rows: string;
        }>(
          `SELECT count(*) FILTER (WHERE activity_user IS NULL) AS anonymous,
                  count(*) AS rows
             FROM "${S}".metrics_user_activity('2026-08-25', '2026-08-31')`,
          { type: QueryTypes.SELECT },
        );
        return row;
      };
      const before = await activity();
      await sequelize.query(
        `INSERT INTO "${S}".page_visit ("page_id", "user_id", "visit_date")
         VALUES ('home', NULL, '2026-08-29')`,
      );
      try {
        expect(await activity()).toEqual({ ...before, anonymous: "0" });
      } finally {
        await sequelize.query(
          `DELETE FROM "${S}".page_visit WHERE "user_id" IS NULL`,
        );
      }
    });

    it("records a new visit at the quarter-hour that holds it, without the code naming it (0030)", async () => {
      const [row] = await sequelize.query<{
        on_step: boolean;
        within_step: boolean;
      }>(
        `WITH probe AS (
           INSERT INTO "${S}".page_visit ("page_id", "user_id", "visit_date")
           VALUES ('probe', 'u9', current_date) RETURNING visited_at)
         SELECT extract(epoch FROM visited_at)::BIGINT % ${VISIT_INSTANT_STEP_SECONDS} = 0 AS on_step,
                visited_at <= now()
                  AND now() - visited_at < make_interval(secs => ${VISIT_INSTANT_STEP_SECONDS}) AS within_step
           FROM probe`,
        { type: QueryTypes.SELECT },
      );
      expect(row).toEqual({ on_step: true, within_step: true });
      await sequelize.query(
        `DELETE FROM "${S}".page_visit WHERE "page_id" = 'probe'`,
      );
    });

    // Wednesday 2 at 10:00 and 10:15 UTC, Saturday 5 at 23:45 UTC
    it("counts the visits by day of the week and hour, in the reader's zone (0030)", async () => {
      await sequelize.query(`
        INSERT INTO "${S}".page_visit ("page_id", "user_id", "visit_date", "visited_at") VALUES
          ('home', 'u1', '2026-09-02', '2026-09-02T10:00:00Z'),
          ('list', 'u2', '2026-09-02', '2026-09-02T10:15:00Z'),
          ('home', 'u2', '2026-09-05', '2026-09-05T23:45:00Z')
      `);
      expect(
        await gridOf("2026-09-01", "2026-09-07", "'UTC'", "visits"),
      ).toEqual({
        title: "Visits by day and hour (UTC), recorded since 2026-09-02",
        chartType: "heatmap",
        cells: 168,
        filled: [
          { day: 3, hour: 10, count: 2 },
          { day: 6, hour: 23, count: 1 },
        ],
      });
      // A zone half an hour from UTC keeps both quarters in one hour, and
      // takes Saturday 23:45 UTC into Sunday
      expect(
        await gridOf("2026-09-02", "2026-09-07", "'Asia/Kolkata'", "visits"),
      ).toMatchObject({
        title: "Visits by day and hour (Asia/Kolkata)",
        filled: [
          { day: 3, hour: 15, count: 2 },
          { day: 7, hour: 5, count: 1 },
        ],
      });
      expect(
        await gridOf("2026-09-01", "2026-09-07", "'Mars/Olympus'", "visits"),
      ).toMatchObject({
        title: "Visits by day and hour (UTC), recorded since 2026-09-02",
      });
      const [row] = await sequelize.query<{
        data: { id: string; title: string }[];
      }>(
        `SELECT "${S}".get_metrics('2026-09-01', '2026-09-07', 'America/Bogota') AS data`,
        { type: QueryTypes.SELECT },
      );
      const ids = row?.data.map((c) => c.id) ?? [];
      // Last, beside the visits by country
      expect(ids.slice(-2)).toEqual(["yearly_visits", "visits_by_hour"]);
      expect(row?.data.find((c) => c.id === "visits_by_hour")?.title).toBe(
        "Visits by day and hour (America/Bogota), recorded since 2026-09-02",
      );
      // The charts after this one count the visits of the setup alone
      await sequelize.query(
        `DELETE FROM "${S}".page_visit WHERE visited_at IS NOT NULL`,
      );
    });

    it("ranks pages and languages for the bars of the page", async () => {
      const [row] = await sequelize.query<{ char_data: { chartType: string } }>(
        `SELECT char_data FROM "${S}".get_top_visited_pages_metrics${week}`,
        { type: QueryTypes.SELECT },
      );
      expect(row?.char_data.chartType).toBe("ranking");
      expect(await chartOf(`get_top_visited_pages_metrics${week}`)).toEqual([
        { page: "home", count: 3 },
        { page: "list", count: 1 },
      ]);
    });
  });
});
