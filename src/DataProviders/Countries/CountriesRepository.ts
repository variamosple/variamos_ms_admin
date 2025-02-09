import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";

import { Country } from "@src/Domain/Countries/Entity/Country";
import logger from "jet-logger";
import { BaseRepository } from "../BaseRepository";
import { UserModel } from "../User/User";
import { CountryModel } from "./Country";

export class CountriesRepositoryImpl extends BaseRepository {
  async getCountries(
    request: RequestModel<unknown>
  ): Promise<ResponseModel<Country[]>> {
    const response = new ResponseModel<Country[]>(request.transactionId);

    try {
      response.data = await CountryModel.findAll().then((result) =>
        result.map(({ code, name, latitude, longitude }) =>
          Country.builder()
            .setCode(code)
            .setName(name)
            .setLatitude(latitude)
            .setLongitude(longitude)
            .build()
        )
      );
    } catch (error) {
      logger.err("Error in getCountries:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async getUserCountryCode(request: RequestModel<string>) {
    const response = new ResponseModel<string>(request.transactionId);

    try {
      response.data = await UserModel.findByPk(request.data).then(
        (result) => result?.countryCode
      );
    } catch (error) {
      logger.err("Error in getUserCountryCode:");
      logger.err(request);
      logger.err(error);
      response.withError(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      );
    }

    return response;
  }

  async getIpCountryCode(request: RequestModel<string>) {
    const response = new ResponseModel<string>(request.transactionId);
    console.log("request", request);

    await fetch(`https://api.ipquery.io/${request.data}`)
      .then((result) => {
        return result.json();
      })
      .then((data) => {
        response.data = data?.location?.country_code;
      })
      .catch((error) => {
        logger.err("Error in getIpCountryCode:");
        logger.err(request);
        logger.err(error);
        response.withError(
          HttpStatusCodes.INTERNAL_SERVER_ERROR,
          "Internal server error"
        );
      });

    return response;
  }
}

export const CountriesRepositoryInstance = new CountriesRepositoryImpl();
