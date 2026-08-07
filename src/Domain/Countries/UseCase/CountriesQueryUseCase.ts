import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Country } from "@src/Domain/Countries/Entity/Country.js";
import type { ICountriesRepository } from "@src/Domain/Countries/Repository/ICountriesRepository.js";

export class CountriesQueryUseCase {
  public constructor(
    private readonly countriesRepository: ICountriesRepository,
  ) {}

  public getCountries(
    request: RequestModel<void>,
  ): Promise<ResponseModel<Country[]>> {
    return this.countriesRepository.getCountries(request);
  }
}
