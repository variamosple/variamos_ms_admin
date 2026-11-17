import { createHash } from "node:crypto";
import { QueryTypes, type Sequelize } from "sequelize";
import type { IJournalPurge } from "#src/Domain/Activity/IJournalPurge.js";
import type {
  DeviceMemory,
  IAccountEmails,
  IKnownDevices,
} from "#src/Domain/Activity/NewDeviceAlerts.js";
import { rowCountOf } from "../queryResults.js";

// The table of migration 0033
const KNOWN_DEVICE_TABLE = "admin_known_devices";

// Longer than the year the browser keeps the identifier
const RETENTION = "400 days";

const digestOf = (deviceId: string) =>
  createHash("sha256").update(deviceId).digest("hex");

/**
 * The devices seen on each account (EV-88, 2026-11-17). Only the SHA-256 of
 * the identifier the browser keeps is stored: the table cannot be used to
 * pass for a known device.
 */
export class KnownDeviceRepositoryImpl
  implements IKnownDevices, IAccountEmails, IJournalPurge
{
  public readonly journal = "known-devices";

  public constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  public async remember(
    userId: string,
    deviceId: string,
  ): Promise<DeviceMemory> {
    // The statements of a WITH see the table as it was before the insert
    const [row] = await this.sequelize.query<{
      devices: number;
      known: boolean;
    }>(
      `WITH "before" AS (
         SELECT count(*)::int AS "devices",
                coalesce(bool_or("device_hash" = :digest), false) AS "known"
           FROM "${this.schema}"."${KNOWN_DEVICE_TABLE}"
          WHERE "user_id" = :userId
       ), "seen" AS (
         INSERT INTO "${this.schema}"."${KNOWN_DEVICE_TABLE}"
           ("user_id", "device_hash")
         VALUES (:userId, :digest)
         ON CONFLICT ("user_id", "device_hash")
           DO UPDATE SET "last_seen_at" = now()
       )
       SELECT "devices", "known" FROM "before"`,
      {
        replacements: { userId, digest: digestOf(deviceId) },
        type: QueryTypes.SELECT,
      },
    );
    return {
      firstForAccount: (row?.devices ?? 0) === 0,
      known: row?.known ?? false,
    };
  }

  public async emailOf(userId: string): Promise<string | null> {
    const [row] = await this.sequelize.query<{ email: string | null }>(
      `SELECT "email" FROM "${this.schema}"."user"
        WHERE "id"::text = :userId AND "is_enabled" AND NOT "is_deleted"
        LIMIT 1`,
      { replacements: { userId }, type: QueryTypes.SELECT },
    );
    return row?.email || null;
  }

  public async purgeExpired(): Promise<number> {
    const [, result] = await this.sequelize.query(
      `DELETE FROM "${this.schema}"."${KNOWN_DEVICE_TABLE}"
        WHERE "last_seen_at" < now() - interval '${RETENTION}'`,
    );
    return rowCountOf(result);
  }
}
