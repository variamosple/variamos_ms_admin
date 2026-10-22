import { QueryTypes, Sequelize } from "sequelize";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import {
  MAX_TRUSTED_DEVICES_PER_USER,
  TrustedDeviceRepositoryImpl,
} from "./TrustedDeviceRepository.js";
import { UserMfaRepositoryImpl } from "./UserMfaRepository.js";

// Needs a disposable PostgreSQL, as the migration tests do:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t_mfa_trusted_device";

describe.skipIf(!url)("TrustedDeviceRepositoryImpl on PostgreSQL", () => {
  let sequelize: Sequelize;
  let devices: TrustedDeviceRepositoryImpl;
  let mfa: UserMfaRepositoryImpl;

  const table = `"${SCHEMA}"."user_mfa_trusted_device"`;
  const count = async (userId: string) => {
    const [row] = await sequelize.query<{ n: string }>(
      `SELECT count(*) AS n FROM ${table} WHERE "user_id" = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT },
    );
    return Number(row?.n);
  };
  /** Moves a browser back in time, as if trusted `days` ago. */
  const age = (tokenHash: string, days: number) =>
    sequelize.query(
      `UPDATE ${table} SET "created_at" = "created_at" - make_interval(days => :days)
        WHERE "token_hash" = :tokenHash`,
      { replacements: { tokenHash, days } },
    );
  const enableMfa = async (userId: string) => {
    await mfa.savePending(userId, "v1:secret");
    await mfa.enable(userId, 1, []);
  };

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
    devices = new TrustedDeviceRepositoryImpl(sequelize, SCHEMA);
    mfa = new UserMfaRepositoryImpl(sequelize, SCHEMA);
  });

  beforeEach(async () => {
    await sequelize.query(`DELETE FROM "${SCHEMA}"."user"`);
    await sequelize.query(
      `INSERT INTO "${SCHEMA}"."user" ("id") VALUES ('u-1'), ('u-2')`,
    );
    await enableMfa("u-1");
    await enableMfa("u-2");
    // Turned on long ago, so that browsers can be moved back in time
    await sequelize.query(
      `UPDATE "${SCHEMA}"."user_mfa" SET "enabled_at" = "enabled_at" - interval '60 days'`,
    );
  });

  afterAll(async () => {
    await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize?.close();
  });

  it("trusts a browser of its own user only", async () => {
    await devices.add("u-1", "h1", 14);

    expect(await devices.use("u-1", "h1", 14)).toBe(true);
    expect(await devices.use("u-2", "h1", 14)).toBe(false);
    expect(await devices.use("u-1", "other", 14)).toBe(false);
  });

  it("records the last use", async () => {
    await devices.add("u-1", "h1", 14);

    await devices.use("u-1", "h1", 14);

    const [row] = await sequelize.query<{ last_used_at: Date | null }>(
      `SELECT "last_used_at" FROM ${table} WHERE "token_hash" = 'h1'`,
      { type: QueryTypes.SELECT },
    );
    expect(row?.last_used_at).toBeInstanceOf(Date);
  });

  it("stops at the end of its days, or sooner when the days are lowered", async () => {
    await devices.add("u-1", "h1", 14);
    await age("h1", 5);

    expect(await devices.use("u-1", "h1", 14)).toBe(true);
    expect(await devices.use("u-1", "h1", 3)).toBe(false);

    await sequelize.query(
      `UPDATE ${table} SET "expires_at" = CURRENT_TIMESTAMP - interval '1 second'`,
    );
    expect(await devices.use("u-1", "h1", 14)).toBe(false);
  });

  it("does not trust a browser older than the factor", async () => {
    await devices.add("u-1", "h1", 14);
    await age("h1", 1);
    await sequelize.query(
      `UPDATE "${SCHEMA}"."user_mfa" SET "enabled_at" = CURRENT_TIMESTAMP WHERE "user_id" = 'u-1'`,
    );

    expect(await devices.use("u-1", "h1", 14)).toBe(false);
  });

  it("keeps the latest browsers of a user and drops the expired ones", async () => {
    for (let i = 0; i < MAX_TRUSTED_DEVICES_PER_USER; i++) {
      await devices.add("u-1", `old-${i}`, 14);
      await age(`old-${i}`, MAX_TRUSTED_DEVICES_PER_USER - i);
    }
    await devices.add("u-2", "kept", 14);

    await devices.add("u-1", "newest", 14);

    expect(await count("u-1")).toBe(MAX_TRUSTED_DEVICES_PER_USER);
    expect(await devices.use("u-1", "old-0", 14)).toBe(false);
    expect(await devices.use("u-1", "newest", 14)).toBe(true);
    expect(await count("u-2")).toBe(1);
  });

  it("forgets the browsers with the factor or on request", async () => {
    await devices.add("u-1", "h1", 14);
    await devices.add("u-1", "h2", 14);
    await devices.add("u-2", "h3", 14);

    expect(await devices.removeAll("u-1")).toBe(2);
    expect(await count("u-1")).toBe(0);

    await mfa.remove("u-2");
    expect(await count("u-2")).toBe(0);
  });
});
