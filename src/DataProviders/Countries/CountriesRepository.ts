import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";

import { Country } from "@src/Domain/Countries/Entity/Country";
import logger from "jet-logger";
import { BaseRepository } from "../BaseRepository";
import { UserModel } from "../User/User";
import { CountryModel } from "./Country";
import { ICountriesRepository } from "@src/Domain/Countries/Repository/ICountriesRepository";

export class CountriesRepositoryImpl extends BaseRepository implements ICountriesRepository {
  public async getCountries(request: RequestModel<void>): Promise<ResponseModel<Country[]>> {
    const response = new ResponseModel<Country[]>(request.transactionId);

    try {
      response.data = await CountryModel.findAll().then((result) =>
        result.map(({ code, name, latitude, longitude }) =>
          Country.builder()
            .setCode(code)
            .setName(name)
            .setLatitude(latitude)
            .setLongitude(longitude)
            .build(),
        ),
      );
    } catch (error) {
      const err = error as Error;
      logger.err("Error in getCountries:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async getUserCountryCode(request: RequestModel<string>) {
    const response = new ResponseModel<string>(request.transactionId);

    try {
      response.data = await UserModel.findByPk(request.data).then((result) => result?.countryCode);
    } catch (error) {
      const err = error as Error;
      logger.err("Error in getUserCountryCode:");
      logger.err(request);
      logger.err(err);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
    }

    return response;
  }

  public async getIpCountryCode(request: RequestModel<string>) {
    const response = new ResponseModel<string>(request.transactionId);
    logger.info("IP country code request for IP: " + request.data);

    await fetch(`https://api.ipquery.io/${request.data}`)
      .then((result) => {
        return result.json() as Promise<{ location?: { country_code?: string } }>;
      })
      .then((data) => {
        response.data = data?.location?.country_code;
      })
      .catch((error) => {
        const err = error as Error;
        logger.err("Error in getIpCountryCode:");
        logger.err(request);
        logger.err(err);
        response.withError(DomainErrorCodes.INTERNAL_ERROR, "Internal server error");
      });

    return response;
  }
}

export const CountriesRepositoryInstance = new CountriesRepositoryImpl();
