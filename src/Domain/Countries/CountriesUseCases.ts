import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Country } from "./Entity/Country";
import { ICountriesRepository } from "./Repository/ICountriesRepository";

export class CountriesUseCases {
  public constructor(private readonly countriesRepository: ICountriesRepository) {}

  public getCountries(request: RequestModel<void>): Promise<ResponseModel<Country[]>> {
    return this.countriesRepository.getCountries(request);
  }
}
