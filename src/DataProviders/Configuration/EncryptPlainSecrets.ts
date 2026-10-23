import { isDeepStrictEqual } from "node:util";
import { QueryTypes, type Sequelize } from "sequelize";
import type { ConfigurationValue } from "#src/Domain/Configuration/Entity/Configuration.js";
import { SecretConfigurationValue } from "./SecretConfigurationValue.js";

interface SecretRow {
  key: string;
  value: ConfigurationValue;
}

/**
 * Encrypts the secret configurations still stored in clear (T-13, EV-78
 * lot 2). Run at each start with a key: it can be replayed, and it also
 * covers a key set after the release. Each value is decrypted again before
 * the commit; one failure leaves every row as it was.
 * @returns the number of values encrypted
 */
export async function encryptPlainSecrets(
  sequelize: Sequelize,
  schema: string,
  secrets: SecretConfigurationValue,
): Promise<number> {
  if (!secrets.canEncrypt()) return 0;
  const table = `"${schema}"."configurations"`;

  return sequelize.transaction(async (transaction) => {
    const rows = await sequelize.query<SecretRow>(
      `SELECT "key", "value" FROM ${table}
        WHERE "is_secret" = true ORDER BY "key" FOR UPDATE`,
      { type: QueryTypes.SELECT, transaction },
    );
    const plain = rows.filter(
      (row) => !SecretConfigurationValue.isEncrypted(row.value),
    );

    for (const row of plain) {
      const encrypted = secrets.encrypt(row.key, row.value);
      if (!isDeepStrictEqual(secrets.decrypt(row.key, encrypted), row.value)) {
        throw new Error(
          `The secret configuration '${row.key}' did not decrypt back.`,
        );
      }
      await sequelize.query(
        `UPDATE ${table} SET "value" = CAST(:value AS jsonb) WHERE "key" = :key`,
        {
          replacements: { key: row.key, value: JSON.stringify(encrypted) },
          transaction,
        },
      );
    }
    return plain.length;
  });
}
