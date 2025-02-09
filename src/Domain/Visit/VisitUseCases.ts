import { CountriesRepositoryInstance } from "@src/DataProviders/Countries/CountriesRepository";
import { VisitRepositoryInstance } from "@src/DataProviders/Visit/VisitRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Visit } from "./Entity/Visit";

export class VisitsUseCases {
  async registerVisit(
    request: RequestModel<Visit>,
    ipAddress?: string
  ): Promise<ResponseModel<Visit>> {
    const countryCodeResponse =
      await CountriesRepositoryInstance.getUserCountryCode(
        new RequestModel(request.transactionId, request.data?.userId)
      );

    if (countryCodeResponse.errorCode) {
      return new ResponseModel<Visit>(request.transactionId).withError(
        countryCodeResponse.errorCode,
        countryCodeResponse.message!
      );
    }

    if (countryCodeResponse.data) {
      request.data!.countryCode = countryCodeResponse.data;
    } else if (ipAddress) {
      const ipCountryResponse =
        await CountriesRepositoryInstance.getIpCountryCode(
          new RequestModel(request.transactionId, ipAddress)
        );
      request.data!.countryCode = ipCountryResponse?.data || null;
    }

    return VisitRepositoryInstance.registerVisit(request);
  }
}
