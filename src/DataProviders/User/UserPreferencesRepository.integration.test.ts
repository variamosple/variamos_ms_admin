import { Sequelize } from "sequelize";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { UserPreferencesRepositoryImpl } from "./UserPreferencesRepository.js";

// Needs a disposable PostgreSQL, as the migration tests do:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t_user_preferences";

describe.skipIf(!url)(
  "UserPreferencesRepositoryImpl on PostgreSQL (EV-115 lot C)",
  () => {
    let sequelize: Sequelize;
    let preferences: UserPreferencesRepositoryImpl;

    beforeAll(async () => {
      sequelize = new Sequelize(url as string, { logging: false });
      await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
      await sequelize.query(
        `CREATE TABLE "${SCHEMA}"."user" ("id" text PRIMARY KEY)`,
      );
      await runMigrations(sequelize, SCHEMA);
      await sequelize.query(
        `INSERT INTO "${SCHEMA}"."user" ("id") VALUES ('user-1'), ('user-2')`,
      );
      preferences = new UserPreferencesRepositoryImpl(sequelize, SCHEMA);
    });

    afterAll(async () => {
      await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await sequelize?.close();
    });

    it("gives no preferences to an account that never chose", async () => {
      expect(await preferences.find("user-2")).toEqual({
        timeZone: null,
        updatedAt: null,
      });
    });

    it("saves a time zone, changes it, then takes it back", async () => {
      const first = await preferences.save("user-1", "America/Bogota");
      expect(first.timeZone).toBe("America/Bogota");
      expect(first.updatedAt).toBeInstanceOf(Date);

      await preferences.save("user-1", "Europe/Paris");
      expect((await preferences.find("user-1")).timeZone).toBe("Europe/Paris");

      await preferences.save("user-1", null);
      expect((await preferences.find("user-1")).timeZone).toBeNull();
      expect(
        await sequelize.query(
          `SELECT count(*)::int AS "rows" FROM "${SCHEMA}"."user_preferences"`,
          { plain: true },
        ),
      ).toEqual({ rows: 1 });
    });
  },
);
