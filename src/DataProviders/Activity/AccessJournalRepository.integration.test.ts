import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AccessEntry } from "#src/Domain/Activity/AccessEntry.js";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { AccessJournalRepositoryImpl } from "./AccessJournalRepository.js";
import { ActivityJournalRepositoryImpl } from "./ActivityJournalRepository.js";

// Needs a disposable PostgreSQL, as the migration tests:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t24_access";
const TABLE = `"${SCHEMA}"."admin_access_logs"`;

const entry = (overrides: Partial<AccessEntry> = {}): AccessEntry => ({
  event: "sign-in",
  outcome: "failed",
  reason: "invalid_credentials",
  userId: "user-1",
  ip: "203.0.113.7",
  method: "POST",
  path: "/auth/sign-in",
  statusCode: 400,
  ...overrides,
});

describe.skipIf(!url)("Access journal on PostgreSQL (T-24)", () => {
  let sequelize: Sequelize;
  let journal: AccessJournalRepositoryImpl;

  const rows = () =>
    sequelize.query<Record<string, unknown>>(
      `SELECT "event", "outcome", "reason", "user_id", "ip", "method", "path",
              "status_code"
         FROM ${TABLE} ORDER BY "id"`,
      { type: QueryTypes.SELECT },
    );

  beforeAll(async () => {
    sequelize = new Sequelize(url as string, { logging: false });
    await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
    await sequelize.query(
      `CREATE TABLE "${SCHEMA}"."user" ("id" text PRIMARY KEY, "email" text,
         "is_enabled" boolean, "is_deleted" boolean)`,
    );
    await sequelize.query(
      `INSERT INTO "${SCHEMA}"."user" VALUES
         ('user-1', 'Ana@Example.com', true, false),
         ('user-2', 'off@example.com', false, false)`,
    );
    const connection = new Sequelize(url as string, { logging: false });
    try {
      await runMigrations(connection, SCHEMA);
    } finally {
      await connection.close();
    }
    journal = new AccessJournalRepositoryImpl(sequelize, SCHEMA);
  });

  afterAll(async () => {
    await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize?.close();
  });

  it("records an entry with its values", async () => {
    await journal.record(entry());
    await journal.record(
      entry({
        event: "access.refused",
        reason: "forbidden",
        userId: null,
        method: "GET",
        path: "/v1/users",
        statusCode: 403,
      }),
    );

    expect(await rows()).toEqual([
      {
        event: "sign-in",
        outcome: "failed",
        reason: "invalid_credentials",
        user_id: "user-1",
        ip: "203.0.113.7",
        method: "POST",
        path: "/auth/sign-in",
        status_code: 400,
      },
      expect.objectContaining({
        event: "access.refused",
        user_id: null,
        status_code: 403,
      }),
    ]);
  });

  it("finds the account of an e-mail, whatever its case", async () => {
    expect(await journal.accountByEmail("ana@example.com")).toEqual({
      id: "user-1",
      active: true,
    });
    expect(await journal.accountByEmail("off@example.com")).toEqual({
      id: "user-2",
      active: false,
    });
    expect(await journal.accountByEmail("nobody@example.com")).toBeNull();
  });

  it("refuses to change, delete or empty recent entries", async () => {
    await expect(
      sequelize.query(`UPDATE ${TABLE} SET "user_id" = 'someone-else'`),
    ).rejects.toThrow("append-only");
    await expect(sequelize.query(`DELETE FROM ${TABLE}`)).rejects.toThrow(
      "append-only",
    );
    await expect(sequelize.query(`TRUNCATE ${TABLE}`)).rejects.toThrow(
      "append-only",
    );
    expect((await rows()).length).toBe(2);
  });

  it("purges the entries older than six months, and only those", async () => {
    await sequelize.query(
      `INSERT INTO ${TABLE} ("occurred_at", "event", "outcome")
       VALUES (now() - interval '7 months', 'sign-in', 'success'),
              (now() - interval '5 months', 'sign-in', 'success')`,
    );

    expect(await journal.purgeExpired()).toBe(1);
    expect((await rows()).length).toBe(3);
  });

  it("purges the activity entries older than one year, and only those", async () => {
    const activity = new ActivityJournalRepositoryImpl(sequelize, SCHEMA);
    await sequelize.query(
      `INSERT INTO "${SCHEMA}"."admin_activity_logs"
         ("occurred_at", "action", "entity_type", "outcome")
       VALUES (now() - interval '13 months', 'role.delete', 'role', 'success'),
              (now() - interval '11 months', 'role.delete', 'role', 'success')`,
    );

    expect(await activity.purgeExpired()).toBe(1);
  });

  it("never throws when the entry cannot be written or read", async () => {
    const broken = new AccessJournalRepositoryImpl(sequelize, "no_such_schema");

    await expect(broken.record(entry())).resolves.toBeUndefined();
    await expect(broken.accountByEmail("ana@example.com")).resolves.toBeNull();
  });
});
