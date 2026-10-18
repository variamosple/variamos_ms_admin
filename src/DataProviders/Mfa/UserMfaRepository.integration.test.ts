import { QueryTypes, Sequelize } from "sequelize";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { UserMfaRepositoryImpl } from "./UserMfaRepository.js";

// Needs a disposable PostgreSQL, as the migration tests do:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t_mfa_repository";

describe.skipIf(!url)("UserMfaRepositoryImpl on PostgreSQL", () => {
  let sequelize: Sequelize;
  let repository: UserMfaRepositoryImpl;

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
    repository = new UserMfaRepositoryImpl(sequelize, SCHEMA);
  });

  beforeEach(async () => {
    await sequelize.query(`DELETE FROM "${SCHEMA}"."user"`);
    await sequelize.query(
      `INSERT INTO "${SCHEMA}"."user" ("id") VALUES ('u-1'), ('u-2')`,
    );
  });

  afterAll(async () => {
    await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize?.close();
  });

  it("keeps a pending enrollment until it is enabled", async () => {
    expect(await repository.findByUser("u-1")).toBeNull();

    expect(await repository.savePending("u-1", "v1:first")).toBe(true);
    expect(await repository.savePending("u-1", "v1:second")).toBe(true);

    expect(await repository.findByUser("u-1")).toEqual({
      userId: "u-1",
      secretEncrypted: "v1:second",
      enabledAt: null,
      lastUsedStep: null,
    });
  });

  it("enables once, with the recovery codes, then refuses a new secret", async () => {
    await repository.savePending("u-1", "v1:secret");

    expect(await repository.enable("u-1", 60_000_000, ["h1", "h2"])).toBe(true);
    expect(await repository.enable("u-1", 60_000_001, ["h3"])).toBe(false);
    expect(await repository.savePending("u-1", "v1:other")).toBe(false);

    const record = await repository.findByUser("u-1");
    expect(record?.enabledAt).toBeInstanceOf(Date);
    expect(record?.lastUsedStep).toBe(60_000_000);
    expect(record?.secretEncrypted).toBe("v1:secret");
    expect(await repository.countUnusedRecoveryCodes("u-1")).toBe(2);
  });

  it("refuses to enable without a pending enrollment", async () => {
    expect(await repository.enable("u-2", 1, ["h1"])).toBe(false);
    expect(await repository.countUnusedRecoveryCodes("u-2")).toBe(0);
  });

  it("records each step once, never an older one", async () => {
    await repository.savePending("u-1", "v1:secret");
    await repository.enable("u-1", 100, []);

    expect(await repository.countUnusedRecoveryCodes("u-1")).toBe(0);
    expect(await repository.recordStep("u-1", 100)).toBe(false);
    expect(await repository.recordStep("u-1", 99)).toBe(false);
    expect(await repository.recordStep("u-1", 101)).toBe(true);
    expect((await repository.findByUser("u-1"))?.lastUsedStep).toBe(101);
  });

  it("lets only one of two simultaneous requests use a step or a code", async () => {
    await repository.savePending("u-1", "v1:secret");
    await repository.enable("u-1", 100, ["h1"]);

    const steps = await Promise.all([
      repository.recordStep("u-1", 101),
      repository.recordStep("u-1", 101),
    ]);
    const codes = await Promise.all([
      repository.useRecoveryCode("u-1", "h1"),
      repository.useRecoveryCode("u-1", "h1"),
    ]);

    expect(steps.filter(Boolean)).toHaveLength(1);
    expect(codes.filter(Boolean)).toHaveLength(1);
  });

  it("spends a recovery code of its own user only", async () => {
    await repository.savePending("u-1", "v1:secret");
    await repository.enable("u-1", 100, ["h1", "h2"]);

    expect(await repository.useRecoveryCode("u-2", "h1")).toBe(false);
    expect(await repository.useRecoveryCode("u-1", "h1")).toBe(true);
    expect(await repository.useRecoveryCode("u-1", "h1")).toBe(false);
    expect(await repository.countUnusedRecoveryCodes("u-1")).toBe(1);
  });

  it("removes the factor and its codes, and nothing of another user", async () => {
    for (const user of ["u-1", "u-2"]) {
      await repository.savePending(user, "v1:secret");
      await repository.enable(user, 100, ["h1"]);
    }

    await repository.remove("u-1");

    expect(await repository.findByUser("u-1")).toBeNull();
    expect(await repository.findByUser("u-2")).not.toBeNull();
    expect(
      await sequelize.query(
        `SELECT "user_id" FROM "${SCHEMA}"."user_mfa_recovery_code"`,
        { type: QueryTypes.SELECT },
      ),
    ).toEqual([{ user_id: "u-2" }]);
  });
});
