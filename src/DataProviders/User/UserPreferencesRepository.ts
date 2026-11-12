import { QueryTypes, type Sequelize } from "sequelize";
import {
  NO_PREFERENCES,
  type UserPreferences,
} from "#src/Domain/User/Entity/UserPreferences.js";
import type { IUserPreferencesRepository } from "#src/Domain/User/Repository/IUserPreferencesRepository.js";

const COLUMNS = `"time_zone" AS "timeZone", "updated_at" AS "updatedAt"`;

export class UserPreferencesRepositoryImpl
  implements IUserPreferencesRepository
{
  constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  private get table() {
    // "user_preferences" belongs to the notifications service
    return `"${this.schema}"."user_display_preferences"`;
  }

  public async find(userId: string): Promise<UserPreferences> {
    const [row] = await this.sequelize.query<UserPreferences>(
      `SELECT ${COLUMNS} FROM ${this.table} WHERE "user_id" = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT },
    );
    return row ?? NO_PREFERENCES;
  }

  public async save(
    userId: string,
    timeZone: string | null,
  ): Promise<UserPreferences> {
    const [row] = await this.sequelize.query<UserPreferences>(
      `INSERT INTO ${this.table} ("user_id", "time_zone", "updated_at")
       VALUES (:userId, :timeZone, now())
       ON CONFLICT ("user_id")
       DO UPDATE SET "time_zone" = EXCLUDED."time_zone", "updated_at" = now()
       RETURNING ${COLUMNS}`,
      { replacements: { userId, timeZone }, type: QueryTypes.SELECT },
    );
    if (!row) throw new Error("The saved preferences could not be read back.");
    return row;
  }
}
