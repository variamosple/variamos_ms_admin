import { CountriesRepositoryInstance } from "@src/DataProviders/Countries/CountriesRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Country } from "./Entity/Country";

export class CountriesUseCases {
  getCountries(
    request: RequestModel<unknown>
  ): Promise<ResponseModel<Country[]>> {
    return CountriesRepositoryInstance.getCountries(request);
  }
}
