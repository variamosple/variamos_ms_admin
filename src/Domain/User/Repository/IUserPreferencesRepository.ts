import type { UserPreferences } from "../Entity/UserPreferences.js";

export interface IUserPreferencesRepository {
  /** The preferences of the account, or none when it never chose. */
  find(userId: string): Promise<UserPreferences>;
  save(userId: string, timeZone: string | null): Promise<UserPreferences>;
}
