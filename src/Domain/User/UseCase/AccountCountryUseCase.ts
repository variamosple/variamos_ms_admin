import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IAccountCountryRepository } from "../Repository/IAccountCountryRepository.js";

/** An ISO 3166-1 alpha-2 code, as the countries table holds them. */
const COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * A country by default for an account without one (EV-90): the browser
 * gives the country of its time zone, and the account keeps it until the
 * user chooses another in "My account". No address of the user is used.
 */
export class AccountCountryUseCase {
  constructor(private readonly countries: IAccountCountryRepository) {}

  /** The answer says whether the country was saved. */
  public async setDefault(
    transactionId: string,
    userId: string,
    countryCode: string,
  ): Promise<ResponseModel<{ saved: boolean }>> {
    const response = new ResponseModel<{ saved: boolean }>(transactionId);
    const code = countryCode.trim().toUpperCase();
    if (!COUNTRY_CODE.test(code)) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        "The country code must be two letters.",
      );
    }
    return response.withResponse({
      saved: await this.countries.setIfMissing(userId, code),
    });
  }
}
