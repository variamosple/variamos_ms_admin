import { randomBytes } from "node:crypto";
import { QueryTypes, Sequelize } from "sequelize";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { AesGcmSecretCipher } from "#src/Infrastructure/Security/AesGcmSecretCipher.js";
import { encryptPlainSecrets } from "./EncryptPlainSecrets.js";
import { SecretConfigurationValue } from "./SecretConfigurationValue.js";

// Needs a disposable PostgreSQL, as the migration tests do:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t_config_secrets";

describe.skipIf(!url)("encryptPlainSecrets on PostgreSQL", () => {
  let sequelize: Sequelize;
  const secrets = new SecretConfigurationValue(
    new AesGcmSecretCipher(randomBytes(32)),
  );
  const table = `"${SCHEMA}"."configurations"`;

  const insert = (key: string, value: unknown, isSecret: boolean) =>
    sequelize.query(
      `INSERT INTO ${table} ("key", "value", "type", "category", "is_secret",
         "target_services", "created_at", "updated_at")
       VALUES (:key, CAST(:value AS jsonb), :type, 'notification', :isSecret,
         ARRAY['all'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      {
        replacements: {
          key,
          value: JSON.stringify(value),
          type: typeof value === "number" ? "number" : "string",
          isSecret,
        },
      },
    );
  const stored = async () =>
    Object.fromEntries(
      (
        await sequelize.query<{ key: string; value: unknown }>(
          `SELECT "key", "value" FROM ${table} ORDER BY "key"`,
          { type: QueryTypes.SELECT },
        )
      ).map((row) => [row.key, row.value]),
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
  });

  beforeEach(async () => {
    await sequelize.query(`DELETE FROM ${table}`);
    await insert("notification.smtp.password", "smtp-password", true);
    await insert("notification.smtp.port", 587, true);
    await insert("notification.smtp.host", "smtp.example.com", false);
  });

  afterAll(async () => {
    await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await sequelize?.close();
  });

  it("encrypts the secrets in clear and leaves the other values", async () => {
    expect(await encryptPlainSecrets(sequelize, SCHEMA, secrets)).toBe(2);

    const values = await stored();
    expect(
      SecretConfigurationValue.isEncrypted(
        values["notification.smtp.password"],
      ),
    ).toBe(true);
    expect(JSON.stringify(values)).not.toContain("smtp-password");
    expect(
      secrets.decrypt(
        "notification.smtp.password",
        values["notification.smtp.password"],
      ),
    ).toBe("smtp-password");
    expect(
      secrets.decrypt(
        "notification.smtp.port",
        values["notification.smtp.port"],
      ),
    ).toBe(587);
    expect(values["notification.smtp.host"]).toBe("smtp.example.com");
  });

  it("can be replayed: an encrypted secret is not encrypted again", async () => {
    await encryptPlainSecrets(sequelize, SCHEMA, secrets);
    const first = await stored();
    await insert("notification.smtp.user", "smtp-user", true);

    expect(await encryptPlainSecrets(sequelize, SCHEMA, secrets)).toBe(1);

    const second = await stored();
    expect(second["notification.smtp.password"]).toEqual(
      first["notification.smtp.password"],
    );
    expect(
      SecretConfigurationValue.isEncrypted(second["notification.smtp.user"]),
    ).toBe(true);
  });

  it("does nothing without a key", async () => {
    const noKey = new SecretConfigurationValue(new AesGcmSecretCipher(null));

    expect(await encryptPlainSecrets(sequelize, SCHEMA, noKey)).toBe(0);

    expect((await stored())["notification.smtp.password"]).toBe(
      "smtp-password",
    );
  });

  it("leaves every row as it was when a value does not decrypt back", async () => {
    const broken = new SecretConfigurationValue(
      new AesGcmSecretCipher(randomBytes(32)),
    );
    const decrypt = broken.decrypt.bind(broken);
    let calls = 0;
    // The second secret comes back wrong, after the first one was written
    vi.spyOn(broken, "decrypt").mockImplementation((key, value) =>
      ++calls === 2 ? "something else" : decrypt(key, value),
    );

    await expect(
      encryptPlainSecrets(sequelize, SCHEMA, broken),
    ).rejects.toThrow("did not decrypt back");

    const values = await stored();
    expect(values["notification.smtp.password"]).toBe("smtp-password");
    expect(values["notification.smtp.port"]).toBe(587);
  });
});
