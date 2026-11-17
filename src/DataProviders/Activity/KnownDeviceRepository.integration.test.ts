import { createHash } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { KnownDeviceRepositoryImpl } from "./KnownDeviceRepository.js";

// Needs a disposable PostgreSQL, as the migration tests:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "ev88_devices";
const TABLE = `"${SCHEMA}"."admin_known_devices"`;

describe.skipIf(!url)("Known devices on PostgreSQL (EV-88)", () => {
  let sequelize: Sequelize;
  let devices: KnownDeviceRepositoryImpl;

  const rows = () =>
    sequelize.query<{ user_id: string; device_hash: string }>(
      `SELECT "user_id", "device_hash" FROM ${TABLE}
        ORDER BY "user_id", "first_seen_at"`,
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
         ('user-1', 'ana@example.com', true, false),
         ('user-2', 'off@example.com', false, false),
         ('user-3', 'gone@example.com', true, true),
         ('user-4', NULL, true, false)`,
    );
    const connection = new Sequelize(url as string, { logging: false });
    try {
      await runMigrations(connection, SCHEMA);
    } finally {
      await connection.close();
    }
    devices = new KnownDeviceRepositoryImpl(sequelize, SCHEMA);
  });

  afterAll(async () => {
    await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize?.close();
  });

  it("learns the first browser of an account, then knows it", async () => {
    expect(await devices.remember("user-1", "browser-a")).toEqual({
      firstForAccount: true,
      known: false,
    });
    expect(await devices.remember("user-1", "browser-a")).toEqual({
      firstForAccount: false,
      known: true,
    });
    expect(await devices.remember("user-1", "browser-b")).toEqual({
      firstForAccount: false,
      known: false,
    });
    // Another account starts with no browser, even one used by user-1
    expect(await devices.remember("user-2", "browser-a")).toEqual({
      firstForAccount: true,
      known: false,
    });
  });

  it("keeps only the SHA-256 of the identifier, once per account", async () => {
    const digest = createHash("sha256").update("browser-a").digest("hex");

    expect(await rows()).toEqual([
      { user_id: "user-1", device_hash: digest },
      {
        user_id: "user-1",
        device_hash: expect.not.stringContaining("browser"),
      },
      { user_id: "user-2", device_hash: digest },
    ]);
  });

  it("gives the address of an active account only", async () => {
    expect(await devices.emailOf("user-1")).toBe("ana@example.com");
    expect(await devices.emailOf("user-2")).toBeNull();
    expect(await devices.emailOf("user-3")).toBeNull();
    expect(await devices.emailOf("user-4")).toBeNull();
    expect(await devices.emailOf("nobody")).toBeNull();
  });

  it("purges the browsers not seen for 400 days, and only those", async () => {
    await sequelize.query(
      `UPDATE ${TABLE} SET "last_seen_at" = now() - interval '401 days'
        WHERE "user_id" = 'user-2'`,
    );

    expect(await devices.purgeExpired()).toBe(1);
    expect((await rows()).map((row) => row.user_id)).toEqual([
      "user-1",
      "user-1",
    ]);
  });

  it("forgets the browsers of a deleted account", async () => {
    await sequelize.query(
      `DELETE FROM "${SCHEMA}"."user" WHERE "id" = 'user-1'`,
    );

    expect(await rows()).toEqual([]);
  });
});
