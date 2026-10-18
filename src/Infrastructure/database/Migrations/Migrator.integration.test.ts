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
import { BASELINE_TABLES, baseline } from "./0001-baseline.js";
import { ACCOUNT_LOCKOUT_ROWS } from "./0002-account-lockout-keys.js";
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
  const structureOf = async (schema: string) => {
    const select = (sql: string) =>
      sequelize.query(sql, {
        replacements: { schema, ignored: ADMIN_MIGRATIONS_TABLE },
        type: QueryTypes.SELECT,
      });
    const structure = {
      columns: await select(
        `SELECT table_name, column_name, data_type, udt_name, character_maximum_length,
                numeric_precision, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = :schema AND table_name <> :ignored
          ORDER BY table_name, column_name`,
      ),
      constraints: await select(
        `SELECT c.relname AS on_table, k.conname, pg_get_constraintdef(k.oid) AS def
           FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
          WHERE k.connamespace = :schema::regnamespace AND c.relname <> :ignored
          ORDER BY k.conname`,
      ),
      indexes: await select(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = :schema AND tablename <> :ignored ORDER BY indexname`,
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
    const before = await structureOf("t07_prod");

    expect(await migrate("t07_prod")).toEqual(ALL_MIGRATIONS);

    expect(await structureOf("t07_prod")).toEqual(before);
    expect(
      await sequelize.query(
        `SELECT "key", "value" FROM "t07_prod"."configurations" ORDER BY "key"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([
      { key: "security.lockout.duration_minutes", value: 15 },
      { key: "security.lockout.max_attempts", value: 10 },
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
         FROM "t07_keys"."configurations" ORDER BY "key"`,
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
});
