import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { VisitRetentionRepositoryImpl } from "./VisitRetentionRepository.js";

// Needs a disposable PostgreSQL, as the migration tests:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t32_visits";

describe.skipIf(!url)("Visit retention on PostgreSQL (2026-11-16)", () => {
  let sequelize: Sequelize;
  let retention: VisitRetentionRepositoryImpl;

  beforeAll(async () => {
    sequelize = new Sequelize(url as string, { logging: false });
    await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
    // The platform tables, as production holds them before the migrations
    await sequelize.query(`
      CREATE TABLE "${SCHEMA}"."user" ("id" text PRIMARY KEY, "email" text,
        "is_enabled" boolean, "is_deleted" boolean);
      CREATE TABLE "${SCHEMA}".page_visit ("page_id" varchar(48) NOT NULL,
        "organization" varchar(128) DEFAULT 'NO_DATA', "user_id" text NOT NULL,
        "visit_date" date DEFAULT CURRENT_DATE NOT NULL, "country_code" varchar(2));
      CREATE TABLE "${SCHEMA}".user_visit ("user_id" text NOT NULL,
        "country_code" varchar(2), "visit_date" date NOT NULL);
    `);
    const connection = new Sequelize(url as string, { logging: false });
    try {
      await runMigrations(connection, SCHEMA);
    } finally {
      await connection.close();
    }
    retention = new VisitRetentionRepositoryImpl(sequelize, SCHEMA);
  });

  afterAll(async () => {
    await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize?.close();
  });

  it("erases the account and the instant of the visits past six months, and keeps the rest", async () => {
    await sequelize.query(
      `INSERT INTO "${SCHEMA}".page_visit ("page_id", "user_id", "visit_date", "country_code", "visited_at")
       VALUES ('home', 'u1', current_date - interval '7 months', 'CO', now() - interval '7 months'),
              ('list', 'u2', current_date - interval '5 months', 'FR', now() - interval '5 months');
       INSERT INTO "${SCHEMA}".user_visit VALUES
              ('u1', 'CO', current_date - interval '7 months'),
              ('u2', 'FR', current_date - interval '5 months')`,
    );

    expect(await retention.purgeExpired()).toBe(2);

    expect(
      await sequelize.query(
        `SELECT "page_id", "user_id", "country_code", "visited_at" IS NULL AS "noInstant"
           FROM "${SCHEMA}".page_visit ORDER BY "page_id"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([
      { page_id: "home", user_id: null, country_code: "CO", noInstant: true },
      { page_id: "list", user_id: "u2", country_code: "FR", noInstant: false },
    ]);
    expect(
      await sequelize.query(`SELECT "user_id" FROM "${SCHEMA}".user_visit`, {
        type: QueryTypes.SELECT,
      }),
    ).toEqual([{ user_id: "u2" }]);
  });

  it("changes nothing the second time", async () => {
    expect(await retention.purgeExpired()).toBe(0);
  });

  it("leaves a schema without the visit tables as it is", async () => {
    const elsewhere = new VisitRetentionRepositoryImpl(sequelize, "public");

    await expect(elsewhere.purgeExpired()).resolves.toBe(0);
  });
});
