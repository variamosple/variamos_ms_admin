import { QueryTypes, Sequelize } from "sequelize";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { SessionRepositoryImpl } from "./SessionRepository.js";

// Needs a disposable PostgreSQL, as the migration tests do:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t_admin_sessions";

const hash = (n: number) => String(n).padStart(64, "0");

describe.skipIf(!url)("SessionRepositoryImpl on PostgreSQL", () => {
  let sequelize: Sequelize;
  let sessions: SessionRepositoryImpl;

  const table = `"${SCHEMA}"."admin_sessions"`;
  /** Moves a session back in time, as if opened and last seen `hours` ago. */
  const age = (idHash: string, hours: number) =>
    sequelize.query(
      `UPDATE ${table}
          SET "started_at" = "started_at" - make_interval(hours => :hours),
              "last_seen_at" = "last_seen_at" - make_interval(hours => :hours)
        WHERE "id_hash" = :idHash`,
      { replacements: { idHash, hours } },
    );

  beforeAll(async () => {
    sequelize = new Sequelize(url as string, { logging: false });
    await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
    await sequelize.query(
      `CREATE TABLE "${SCHEMA}"."user" ("id" text PRIMARY KEY)`,
    );
    const migrations = new Sequelize(url as string, { logging: false });
    await runMigrations(migrations, SCHEMA);
    await migrations.close();
    sessions = new SessionRepositoryImpl(sequelize, SCHEMA);
  });

  beforeEach(async () => {
    await sequelize.query(`DELETE FROM ${table}`);
  });

  afterAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize.close();
  });

  it("opens a session, finds it and moves its last activity", async () => {
    await sessions.open(hash(1), "u-1");
    await age(hash(1), 2);

    const opened = await sessions.find(hash(1));
    expect(opened).toMatchObject({ userId: "u-1", revokedAt: null });
    await sessions.touch(hash(1));
    const touched = await sessions.find(hash(1));

    expect(touched?.startedAt).toEqual(opened?.startedAt);
    expect(
      (touched?.lastSeenAt.getTime() ?? 0) -
        (opened?.lastSeenAt.getTime() ?? 0),
    ).toBeGreaterThan(3_500_000);
    expect(await sessions.find(hash(2))).toBeNull();
  });

  it("refuses two sessions with the same identifier", async () => {
    await sessions.open(hash(1), "u-1");
    await expect(sessions.open(hash(1), "u-2")).rejects.toThrow();
  });

  it("revokes one session, then every open session of an account", async () => {
    await sessions.open(hash(1), "u-1");
    await sessions.open(hash(2), "u-1");
    await sessions.open(hash(3), "u-1");
    await sessions.open(hash(4), "u-2");

    await sessions.revoke(hash(1));
    const revokedAt = (await sessions.find(hash(1)))?.revokedAt;
    expect(revokedAt).toBeInstanceOf(Date);

    expect(await sessions.revokeAllOf("u-1")).toBe(2);
    expect(await sessions.revokeAllOf("u-1")).toBe(0);
    // A revoked session keeps its first revocation and no longer moves
    await sessions.touch(hash(2));
    const second = await sessions.find(hash(2));
    expect(second?.revokedAt).toBeInstanceOf(Date);
    expect((await sessions.find(hash(1)))?.revokedAt).toEqual(revokedAt);
    expect((await sessions.find(hash(4)))?.revokedAt).toBeNull();
  });

  it("deletes the sessions opened more than 31 days ago", async () => {
    await sessions.open(hash(1), "u-1");
    await sessions.open(hash(2), "u-1");
    await age(hash(1), 32 * 24);
    await age(hash(2), 30 * 24);

    expect(sessions.journal).toBe("session");
    expect(await sessions.purgeExpired()).toBe(1);
    const left = await sequelize.query<{ id_hash: string }>(
      `SELECT "id_hash" FROM ${table}`,
      { type: QueryTypes.SELECT },
    );
    expect(left).toEqual([{ id_hash: hash(2) }]);
  });
});
