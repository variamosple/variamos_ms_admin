import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActivityEntry } from "#src/Domain/Activity/ActivityEntry.js";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { ActivityJournalRepositoryImpl } from "./ActivityJournalRepository.js";

// Needs a disposable PostgreSQL, as the migration tests:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t24_journal";
const TABLE = `"${SCHEMA}"."admin_activity_logs"`;

const entry = (overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
  actorId: "admin-1",
  action: "role.update",
  entityType: "role",
  entityId: "7",
  outcome: "success",
  errorCode: null,
  before: { name: "Old" },
  after: { name: "New" },
  transactionId: "updateRole",
  ...overrides,
});

describe.skipIf(!url)("Activity journal on PostgreSQL (T-24)", () => {
  let sequelize: Sequelize;
  let journal: ActivityJournalRepositoryImpl;

  const rows = () =>
    sequelize.query<Record<string, unknown>>(
      `SELECT "actor_id", "action", "entity_type", "entity_id", "outcome",
              "error_code", "before", "after", "transaction_id"
         FROM ${TABLE} ORDER BY "id"`,
      { type: QueryTypes.SELECT },
    );

  beforeAll(async () => {
    sequelize = new Sequelize(url as string, { logging: false });
    await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
    await sequelize.query(
      `CREATE TABLE "${SCHEMA}"."user" ("id" text PRIMARY KEY)`,
    );
    const connection = new Sequelize(url as string, { logging: false });
    try {
      await runMigrations(connection, SCHEMA);
    } finally {
      await connection.close();
    }
    journal = new ActivityJournalRepositoryImpl(sequelize, SCHEMA);
  });

  afterAll(async () => {
    await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize?.close();
  });

  it("records an entry with its values", async () => {
    await journal.record(entry());
    await journal.record(
      entry({ outcome: "failed", errorCode: "INVALID_INPUT", before: null }),
    );

    expect(await rows()).toEqual([
      {
        actor_id: "admin-1",
        action: "role.update",
        entity_type: "role",
        entity_id: "7",
        outcome: "success",
        error_code: null,
        before: { name: "Old" },
        after: { name: "New" },
        transaction_id: "updateRole",
      },
      expect.objectContaining({
        outcome: "failed",
        error_code: "INVALID_INPUT",
        before: null,
      }),
    ]);
  });

  it("refuses to change an entry", async () => {
    await expect(
      sequelize.query(`UPDATE ${TABLE} SET "actor_id" = 'someone-else'`),
    ).rejects.toThrow("append-only");
  });

  it("refuses to delete a recent entry, or to empty the table", async () => {
    await expect(sequelize.query(`DELETE FROM ${TABLE}`)).rejects.toThrow(
      "append-only",
    );
    await expect(sequelize.query(`TRUNCATE ${TABLE}`)).rejects.toThrow(
      "append-only",
    );
    expect((await rows()).length).toBe(2);
  });

  it("lets the purge delete an entry older than the retention", async () => {
    await sequelize.query(
      `INSERT INTO ${TABLE} ("occurred_at", "action", "entity_type", "outcome")
       VALUES (now() - interval '13 months', 'role.delete', 'role', 'success')`,
    );

    await sequelize.query(
      `DELETE FROM ${TABLE} WHERE "occurred_at" < now() - interval '1 year'`,
    );

    expect((await rows()).length).toBe(2);
  });

  it("never throws when the entry cannot be written", async () => {
    const broken = new ActivityJournalRepositoryImpl(
      sequelize,
      "no_such_schema",
    );

    await expect(broken.record(entry())).resolves.toBeUndefined();
  });
});
