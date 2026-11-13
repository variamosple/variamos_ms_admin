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
      { key: "monitoring.health_check_interval_seconds", value: 30 },
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
      // Added by 0012, which finds the permission tables here
      { name: "laboratory::access" },
    ]);
    await expect(insertPermission("t14_legacy", "new name")).rejects.toThrow(
      PERMISSION_NAME_CHECK,
    );
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
        // A second one, with a period (0018)
        "get_top_visited_pages_metrics",
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
        CREATE TABLE "${S}".project ("id" text PRIMARY KEY, "date" timestamptz);
        CREATE TABLE "${S}".project_history ("project_id" varchar(255), "user_id" varchar(255),
          "created_at" timestamptz NOT NULL);
        CREATE TABLE "${S}".model ("id" text, "project_id" text, "language_id" integer);
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

    it("gives every chart to the dashboard, empty without the tables of the other services", async () => {
      const read = async (schema: string) => {
        const [row] = await sequelize.query<{
          data: { id: string; data: unknown }[];
        }>(`SELECT "${schema}".get_metrics() AS data`, {
          type: QueryTypes.SELECT,
        });
        return row?.data ?? [];
      };
      const ids = [
        "yearly_visits",
        "daily_visits",
        "daily_unique_visits",
        "monthly_visits",
        "top_visited_pages",
        "monthly_active_users",
        "monthly_active_projects",
        "top_languages",
      ];

      expect((await read(S)).map((c) => c.id)).toEqual(ids);
      const empty = await read("t07_fresh");
      expect(empty.map((c) => c.id)).toEqual(ids);
      expect(empty.every((c) => c.data === null)).toBe(true);
    });
  });
});
