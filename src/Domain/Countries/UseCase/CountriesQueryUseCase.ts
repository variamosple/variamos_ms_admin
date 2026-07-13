import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Country } from "@src/Domain/Countries/Entity/Country";
import { ICountriesRepository } from "@src/Domain/Countries/Repository/ICountriesRepository";

export class CountriesQueryUseCase {
  public constructor(private readonly countriesRepository: ICountriesRepository) {}

  public getCountries(request: RequestModel<void>): Promise<ResponseModel<Country[]>> {
    return this.countriesRepository.getCountries(request);
  }
}
