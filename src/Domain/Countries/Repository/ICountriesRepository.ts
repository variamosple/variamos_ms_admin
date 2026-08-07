import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Country } from "../Entity/Country.js";

export interface ICountriesRepository {
  getCountries(request: RequestModel<void>): Promise<ResponseModel<Country[]>>;
  getUserCountryCode(
    request: RequestModel<string>,
  ): Promise<ResponseModel<string>>;
  getIpCountryCode(
    request: RequestModel<string>,
  ): Promise<ResponseModel<string>>;
}
