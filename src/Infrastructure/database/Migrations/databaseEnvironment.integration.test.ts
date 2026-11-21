import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readDatabaseEnvironment } from "./Migrator.js";

// Needs a disposable PostgreSQL, as Migrator.integration.test.ts
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;

const withConnection = async <T>(run: (s: Sequelize) => Promise<T>) => {
  const connection = new Sequelize(url as string, { logging: false });
  try {
    return await run(connection);
  } finally {
    await connection.close();
  }
};

// ADM-N32: the production database says what it is, to every connection
describe.skipIf(!url)("readDatabaseEnvironment on PostgreSQL", () => {
  let database: string;

  beforeAll(async () => {
    database = await withConnection(async (s) => {
      const [row] = await s.query<{ name: string }>(
        "SELECT current_database() AS name",
        { type: QueryTypes.SELECT },
      );
      return row?.name ?? "";
    });
  });

  const setMarker = (value: string | null) =>
    withConnection((s) =>
      s.query(
        value === null
          ? `ALTER DATABASE "${database}" RESET variamos.environment`
          : `ALTER DATABASE "${database}" SET variamos.environment = '${value}'`,
      ),
    );

  afterAll(async () => {
    await setMarker(null);
  });

  it("reads nothing on a database without the setting", async () => {
    await setMarker(null);
    await expect(withConnection(readDatabaseEnvironment)).resolves.toBeNull();
  });

  it("reads the setting given to the database, on a new connection", async () => {
    await setMarker("production");
    await expect(withConnection(readDatabaseEnvironment)).resolves.toBe(
      "production",
    );
  });
});
