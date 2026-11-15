import { Sequelize } from "sequelize";
import { AccountCountryRepositoryImpl } from "./AccountCountryRepository.js";

// Needs a disposable PostgreSQL, as the migration tests do:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t_account_country";

describe.skipIf(!url)(
  "AccountCountryRepositoryImpl on PostgreSQL (EV-90)",
  () => {
    let sequelize: Sequelize;
    let countries: AccountCountryRepositoryImpl;

    const countryOf = async (id: string) =>
      (
        (await sequelize.query(
          `SELECT "country_code" FROM "${SCHEMA}"."user" WHERE "id" = :id`,
          { plain: true, replacements: { id } },
        )) as { country_code: string | null } | null
      )?.country_code;

    beforeAll(async () => {
      sequelize = new Sequelize(url as string, { logging: false });
      await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
      await sequelize.query(
        `CREATE TABLE "${SCHEMA}"."country" ("code" text PRIMARY KEY)`,
      );
      await sequelize.query(
        `CREATE TABLE "${SCHEMA}"."user" ("id" text PRIMARY KEY, "country_code" text)`,
      );
      await sequelize.query(
        `INSERT INTO "${SCHEMA}"."country" ("code") VALUES ('CO'), ('FR')`,
      );
      await sequelize.query(
        `INSERT INTO "${SCHEMA}"."user" ("id", "country_code")
       VALUES ('without', NULL), ('chosen', 'FR'), ('unknown', NULL)`,
      );
      countries = new AccountCountryRepositoryImpl(sequelize, SCHEMA);
    });

    afterAll(async () => {
      await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await sequelize?.close();
    });

    it("gives its country to an account without one, once", async () => {
      expect(await countries.setIfMissing("without", "CO")).toBe(true);
      expect(await countryOf("without")).toBe("CO");

      expect(await countries.setIfMissing("without", "FR")).toBe(false);
      expect(await countryOf("without")).toBe("CO");
    });

    it("keeps a country already chosen", async () => {
      expect(await countries.setIfMissing("chosen", "CO")).toBe(false);
      expect(await countryOf("chosen")).toBe("FR");
    });

    it("saves no code missing from the countries table, and no unknown account", async () => {
      expect(await countries.setIfMissing("unknown", "ZZ")).toBe(false);
      expect(await countryOf("unknown")).toBeNull();
      expect(await countries.setIfMissing("nobody", "CO")).toBe(false);
    });
  },
);
