import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Country } from "../Entity/Country";

export interface ICountriesRepository {
  getCountries(request: RequestModel<void>): Promise<ResponseModel<Country[]>>;
  getUserCountryCode(request: RequestModel<string>): Promise<ResponseModel<string>>;
  getIpCountryCode(request: RequestModel<string>): Promise<ResponseModel<string>>;
}
