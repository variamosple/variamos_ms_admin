import logger from "#src/common/logger.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { fieldOf } from "#src/Domain/Core/Value/fieldOf.js";
import { Country } from "#src/Domain/Countries/Entity/Country.js";
import type { ICountriesRepository } from "#src/Domain/Countries/Repository/ICountriesRepository.js";
import { BaseRepository } from "../BaseRepository.js";
import { UserModel } from "../User/User.js";
import { CountryModel } from "./Country.js";
import { IpCountryCache, type IpCountryLookup } from "./IpCountryCache.js";
import { publicAddressOf } from "./publicAddress.js";

/**
 * The country of an address is only a default offered at sign-in: a
 * geolocation service that does not answer within 2 s is skipped (ADM-N33).
 */
const IP_LOOKUP_TIMEOUT_MS = 2000;

/** Where the country of an address is asked, and how long to wait. */
export interface IpLookupSettings {
  baseUrl: string;
  timeoutMs: number;
}

export class CountriesRepositoryImpl
  extends BaseRepository
  implements ICountriesRepository
{
  public constructor(
    private readonly ipLookup: IpLookupSettings = {
      baseUrl: "https://api.ipquery.io",
      timeoutMs: IP_LOOKUP_TIMEOUT_MS,
    },
    private readonly ipCountries = new IpCountryCache(),
  ) {
    super();
  }

  public async getCountries(
    request: RequestModel<void>,
  ): Promise<ResponseModel<Country[]>> {
    const response = new ResponseModel<Country[]>(request.transactionId);

    try {
      response.data = await CountryModel.findAll().then((result) =>
        result.map(({ code, name, latitude, longitude, code3 }) =>
          Country.builder()
            .setCode(code)
            .setName(name)
            .setLatitude(Number(latitude))
            .setLongitude(Number(longitude))
            .setCode3(code3)
            .build(),
        ),
      );
    } catch (error) {
      logger.err("Error in getCountries:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  public async getUserCountryCode(request: RequestModel<string>) {
    const response = new ResponseModel<string>(request.transactionId);

    try {
      response.data = await UserModel.findByPk(request.data).then(
        (result) => result?.countryCode,
      );
    } catch (error) {
      logger.err("Error in getUserCountryCode:");
      logger.err(error);
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    }

    return response;
  }

  /**
   * The country of a public address, asked once a day per address (ADM-N26).
   * A private address is never sent: it has no country.
   */
  public async getIpCountryCode(request: RequestModel<string>) {
    const response = new ResponseModel<string>(request.transactionId);
    const address = request.data ? publicAddressOf(request.data) : null;
    if (!address) return response;

    const lookup =
      this.ipCountries.get(address) ?? (await this.lookUpCountry(address));
    if (lookup.failed) {
      response.withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
    } else {
      response.data = lookup.countryCode;
    }
    return response;
  }

  private async lookUpCountry(address: string): Promise<IpCountryLookup> {
    logger.info("IP country code request");
    let lookup: IpCountryLookup;
    try {
      const result = await fetch(`${this.ipLookup.baseUrl}/${address}`, {
        signal: AbortSignal.timeout(this.ipLookup.timeoutMs),
      });
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      const data: unknown = await result.json();
      // An answer of another service: only a text is kept
      const code: unknown = fieldOf(fieldOf(data, "location"), "country_code");
      lookup = {
        failed: false,
        countryCode: typeof code === "string" ? code : undefined,
      };
    } catch (error) {
      logger.err("Error in getIpCountryCode:");
      logger.err(error);
      lookup = { failed: true };
    }
    this.ipCountries.set(address, lookup);
    return lookup;
  }
}
