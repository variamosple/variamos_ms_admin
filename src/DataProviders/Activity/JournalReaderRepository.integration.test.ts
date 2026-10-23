import { Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AccessFilter,
  ActivityFilter,
} from "#src/Domain/Activity/JournalQuery.js";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { JournalReaderRepositoryImpl } from "./JournalReaderRepository.js";

// Needs a disposable PostgreSQL, as the migration tests:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t24_reader";
const ANA = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

const period = {
  from: new Date(Date.now() - 24 * 60 * 60 * 1000),
  to: new Date(Date.now() + 60 * 1000),
};

const activity = (overrides: Partial<ActivityFilter> = {}): ActivityFilter => ({
  ...period,
  user: null,
  outcome: null,
  pageNumber: 1,
  pageSize: 50,
  action: null,
  entityType: null,
  entityId: null,
  ...overrides,
});

const access = (overrides: Partial<AccessFilter> = {}): AccessFilter => ({
  ...period,
  user: null,
  outcome: null,
  pageNumber: 1,
  pageSize: 50,
  event: null,
  reason: null,
  ip: null,
  ...overrides,
});

describe.skipIf(!url)("Reading the journals on PostgreSQL (T-24)", () => {
  let sequelize: Sequelize;
  let reader: JournalReaderRepositoryImpl;

  beforeAll(async () => {
    sequelize = new Sequelize(url as string, { logging: false });
    await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
    // As the baseline expects: a text id holding uuids
    await sequelize.query(
      `CREATE TABLE "${SCHEMA}"."user" ("id" text PRIMARY KEY, "name" text,
         "email" text)`,
    );
    await sequelize.query(
      `INSERT INTO "${SCHEMA}"."user" VALUES
         ('${ANA}', 'Ana 100%', 'ana@example.com'),
         ('${BOB}', 'Bob', 'bob@example.com')`,
    );
    const connection = new Sequelize(url as string, { logging: false });
    try {
      await runMigrations(connection, SCHEMA);
    } finally {
      await connection.close();
    }
    await sequelize.query(
      `INSERT INTO "${SCHEMA}"."admin_activity_logs"
         ("occurred_at", "actor_id", "action", "entity_type", "entity_id",
          "outcome", "error_code", "before", "after", "transaction_id")
       VALUES
         (now() - interval '3 hours', '${ANA}', 'role.update', 'role', '7',
          'success', NULL, '{"name":"Old"}', '{"name":"New"}', 'updateRole'),
         (now() - interval '2 hours', '${BOB}', 'user.disable', 'user', '${ANA}',
          'failed', 'FORBIDDEN', NULL, NULL, 'disableUser'),
         (now() - interval '1 hour', '${GONE}', 'role.delete', 'role', '8',
          'success', NULL, NULL, NULL, 'deleteRole'),
         (now() - interval '3 days', '${ANA}', 'role.create', 'role', '9',
          'success', NULL, NULL, NULL, 'createRole')`,
    );
    await sequelize.query(
      `INSERT INTO "${SCHEMA}"."admin_access_logs"
         ("occurred_at", "event", "outcome", "reason", "user_id", "ip",
          "method", "path", "status_code")
       VALUES
         (now() - interval '2 hours', 'sign-in', 'failed', 'locked', '${ANA}',
          '203.0.113.7', 'POST', '/auth/sign-in', 429),
         (now() - interval '1 hour', 'access.refused', 'failed', 'forbidden',
          NULL, '198.51.100.2', 'GET', '/v1/users', 403),
         (now() - interval '30 minutes', 'sign-in', 'success', NULL, '${BOB}',
          '203.0.113.7', 'POST', '/auth/sign-in', 200)`,
    );
    reader = new JournalReaderRepositoryImpl(sequelize, SCHEMA);
  });

  afterAll(async () => {
    await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize?.close();
  });

  it("reads the period, newest first, with the account", async () => {
    const page = await reader.queryActivity(activity());

    expect(page.total).toBe(3);
    expect(page.rows.map((row) => row.action)).toEqual([
      "role.delete",
      "user.disable",
      "role.update",
    ]);
    expect(page.rows[2]).toMatchObject({
      actorId: ANA,
      actor: { id: ANA, name: "Ana 100%", email: "ana@example.com" },
      entityId: "7",
      before: { name: "Old" },
      after: { name: "New" },
    });
    // An account that no longer exists keeps its id
    expect(page.rows[0]).toMatchObject({ actorId: GONE, actor: null });
  });

  it("filters the activity by account, action, entity and outcome", async () => {
    const byEmail = await reader.queryActivity(activity({ user: "BOB@" }));
    const byId = await reader.queryActivity(activity({ user: GONE }));
    const byEntity = await reader.queryActivity(
      activity({ entityType: "user", entityId: ANA }),
    );
    const failed = await reader.queryActivity(activity({ outcome: "failed" }));
    const byAction = await reader.queryActivity(
      activity({ action: "role.update" }),
    );

    expect(byEmail.rows.map((row) => row.action)).toEqual(["user.disable"]);
    expect(byId.rows.map((row) => row.action)).toEqual(["role.delete"]);
    expect(byEntity.rows.map((row) => row.action)).toEqual(["user.disable"]);
    expect(failed.rows.map((row) => row.errorCode)).toEqual(["FORBIDDEN"]);
    expect(byAction.total).toBe(1);
  });

  it("matches a typed % literally, never as a pattern", async () => {
    // Only Ana's name holds a %; her other entry is out of the period
    const count = async (user: string) =>
      (await reader.queryActivity(activity({ user }))).total;

    expect(await count("100%")).toBe(1);
    expect(await count("%")).toBe(1);
    expect(await count("_")).toBe(0);
  });

  it("pages the entries and keeps the total", async () => {
    const second = await reader.queryActivity(
      activity({ pageNumber: 2, pageSize: 2 }),
    );

    expect(second.total).toBe(3);
    expect(second.rows.map((row) => row.action)).toEqual(["role.update"]);
  });

  it("reads and filters the access journal", async () => {
    const all = await reader.queryAccess(access());
    const byIp = await reader.queryAccess(access({ ip: "203.0.113.7" }));
    const locked = await reader.queryAccess(
      access({ event: "sign-in", reason: "locked" }),
    );
    const byName = await reader.queryAccess(access({ user: "ana" }));

    expect(all.total).toBe(3);
    expect(all.rows[1]).toMatchObject({
      event: "access.refused",
      userId: null,
      user: null,
      path: "/v1/users",
      statusCode: 403,
    });
    expect(byIp.total).toBe(2);
    expect(locked.rows).toEqual([
      expect.objectContaining({
        userId: ANA,
        user: { id: ANA, name: "Ana 100%", email: "ana@example.com" },
        statusCode: 429,
      }),
    ]);
    expect(byName.total).toBe(1);
  });
});
