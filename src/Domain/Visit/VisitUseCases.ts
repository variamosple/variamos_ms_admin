import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Visit } from "./Entity/Visit";
import { IVisitRepository } from "./Repository/IVisitRepository";
import { ICountriesRepository } from "../Countries/Repository/ICountriesRepository";

export class VisitsUseCases {
  public constructor(
    private readonly visitRepository: IVisitRepository,
    private readonly countriesRepository: ICountriesRepository,
  ) {}

  public async registerVisit(
    request: RequestModel<Visit>,
    ipAddress?: string,
  ): Promise<ResponseModel<Visit>> {
    if (!request.data) {
      return new ResponseModel<Visit>(request.transactionId).withError(
        DomainErrorCodes.BAD_REQUEST,
        "Visit data is required.",
      );
    }

    const countryCodeResponse = await this.countriesRepository.getUserCountryCode(
      new RequestModel(request.transactionId, request.data.userId),
    );

    if (countryCodeResponse.errorCode) {
      return new ResponseModel<Visit>(request.transactionId).withError(
        countryCodeResponse.errorCode,
        countryCodeResponse.message ?? "An unexpected error occurred",
      );
    }

    if (countryCodeResponse.data) {
      request.data.countryCode = countryCodeResponse.data;
    } else if (ipAddress) {
      const ipCountryResponse = await this.countriesRepository.getIpCountryCode(
        new RequestModel(request.transactionId, ipAddress),
      );
      request.data.countryCode = ipCountryResponse?.data || null;
    }

    return this.visitRepository.registerVisit(request);
  }
}
