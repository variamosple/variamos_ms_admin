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

export class CountriesRepositoryImpl
  extends BaseRepository
  implements ICountriesRepository
{
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

  public async getIpCountryCode(request: RequestModel<string>) {
    const response = new ResponseModel<string>(request.transactionId);
    logger.info("IP country code request");

    await fetch(`https://api.ipquery.io/${request.data}`)
      .then((result): Promise<unknown> => result.json())
      .then((data) => {
        // An answer of another service: only a text is kept
        const code: unknown = fieldOf(
          fieldOf(data, "location"),
          "country_code",
        );
        response.data = typeof code === "string" ? code : undefined;
      })
      .catch((error) => {
        logger.err("Error in getIpCountryCode:");
        logger.err(error);
        response.withError(
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal server error",
        );
      });

    return response;
  }
}
