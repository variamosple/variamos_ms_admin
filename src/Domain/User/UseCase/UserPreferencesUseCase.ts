import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  knownTimeZone,
  type UserPreferences,
} from "../Entity/UserPreferences.js";
import type { IUserPreferencesRepository } from "../Repository/IUserPreferencesRepository.js";

/** The display preferences of the signed-in account (EV-115 lot C). */
export class UserPreferencesUseCase {
  constructor(private readonly preferences: IUserPreferencesRepository) {}

  public async get(
    transactionId: string,
    userId: string,
  ): Promise<ResponseModel<UserPreferences>> {
    return new ResponseModel<UserPreferences>(transactionId).withResponse(
      await this.preferences.find(userId),
    );
  }

  /** Null goes back to the time zone of the browser. */
  public async setTimeZone(
    transactionId: string,
    userId: string,
    timeZone: string | null,
  ): Promise<ResponseModel<UserPreferences>> {
    const response = new ResponseModel<UserPreferences>(transactionId);
    const zone = timeZone === null ? null : knownTimeZone(timeZone.trim());
    if (timeZone !== null && !zone) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "The time zone is unknown.",
      );
    }
    return response.withResponse(await this.preferences.save(userId, zone));
  }
}
