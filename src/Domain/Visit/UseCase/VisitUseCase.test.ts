import { mock, MockProxy } from "jest-mock-extended";
import { VisitUseCase } from "./VisitUseCase";
import { IVisitRepository } from "@src/Domain/Visit/Repository/IVisitRepository";
import { ICountriesRepository } from "@src/Domain/Countries/Repository/ICountriesRepository";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Visit } from "@src/Domain/Visit/Entity/Visit";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";

describe("VisitUseCase - Unit Tests", () => {
  let useCase: VisitUseCase;
  let mockVisitRepository: MockProxy<IVisitRepository>;
  let mockCountriesRepository: MockProxy<ICountriesRepository>;

  beforeEach(() => {
    mockVisitRepository = mock<IVisitRepository>();
    mockCountriesRepository = mock<ICountriesRepository>();
    useCase = new VisitUseCase(mockVisitRepository, mockCountriesRepository);
  });

  test("should return error if visit data is missing", async () => {
    const req = new RequestModel<Visit>("tx-1", undefined);
    const res = await useCase.registerVisit(req);

    expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(res.message).toBe("Visit data is required.");
    expect(mockVisitRepository.registerVisit).not.toHaveBeenCalled();
  });

  test("should return error if countryCodeRepository returns an error", async () => {
    const visit = new Visit("home", "user-123");
    const mockErrorResponse = new ResponseModel<string>("tx-1").withError(
      DomainErrorCodes.SYSTEM_ERROR,
      "Database not responding",
    );
    mockCountriesRepository.getUserCountryCode.mockResolvedValue(mockErrorResponse);

    const req = new RequestModel<Visit>("tx-1", visit);
    const res = await useCase.registerVisit(req);

    expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    expect(res.message).toBe("Database not responding");
    expect(mockVisitRepository.registerVisit).not.toHaveBeenCalled();
  });

  test("should register visit successfully using user country code", async () => {
    const visit = new Visit("home", "user-123");
    const mockCountryResponse = new ResponseModel<string>("tx-1").withResponse("FR");
    mockCountriesRepository.getUserCountryCode.mockResolvedValue(mockCountryResponse);

    const mockSavedVisit = new Visit("home", "user-123", "FR");
    const mockRegisterResponse = new ResponseModel<Visit>("tx-1").withResponse(mockSavedVisit);
    mockVisitRepository.registerVisit.mockResolvedValue(mockRegisterResponse);

    const req = new RequestModel<Visit>("tx-1", visit);
    const res = await useCase.registerVisit(req);

    expect(res.data).toBe(mockSavedVisit);
    expect(mockCountriesRepository.getUserCountryCode).toHaveBeenCalledWith(
      expect.objectContaining({ data: "user-123" }),
    );
    expect(mockVisitRepository.registerVisit).toHaveBeenCalledWith(req);
    expect(visit.countryCode).toBe("FR");
  });

  test("should fallback to IP country code when user country code is null and ipAddress is provided", async () => {
    const visit = new Visit("home", "user-123");
    const mockUserCountryResponse = new ResponseModel<string>("tx-1").withResponse(null);
    mockCountriesRepository.getUserCountryCode.mockResolvedValue(mockUserCountryResponse);

    const mockIpCountryResponse = new ResponseModel<string>("tx-1").withResponse("US");
    mockCountriesRepository.getIpCountryCode.mockResolvedValue(mockIpCountryResponse);

    const mockSavedVisit = new Visit("home", "user-123", "US");
    const mockRegisterResponse = new ResponseModel<Visit>("tx-1").withResponse(mockSavedVisit);
    mockVisitRepository.registerVisit.mockResolvedValue(mockRegisterResponse);

    const req = new RequestModel<Visit>("tx-1", visit);
    const res = await useCase.registerVisit(req, "192.168.1.1");

    expect(res.data).toBe(mockSavedVisit);
    expect(mockCountriesRepository.getIpCountryCode).toHaveBeenCalledWith(
      expect.objectContaining({ data: "192.168.1.1" }),
    );
    expect(visit.countryCode).toBe("US");
  });

  test("should register visit with default error message when countryCodeRepository returns error without message", async () => {
    const visit = new Visit("home", "user-123");
    const mockErrorResponse = new ResponseModel<string>("tx-1");
    mockErrorResponse.errorCode = DomainErrorCodes.SYSTEM_ERROR;
    mockErrorResponse.message = undefined;
    mockCountriesRepository.getUserCountryCode.mockResolvedValue(mockErrorResponse);

    const req = new RequestModel<Visit>("tx-1", visit);
    const res = await useCase.registerVisit(req);

    expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    expect(res.message).toBe("An unexpected error occurred");
  });

  test("should fallback to null countryCode if ipCountryResponse has no data", async () => {
    const visit = new Visit("home", "user-123");
    const mockUserCountryResponse = new ResponseModel<string>("tx-1").withResponse(null);
    mockCountriesRepository.getUserCountryCode.mockResolvedValue(mockUserCountryResponse);

    const mockIpCountryResponse = new ResponseModel<string>("tx-1").withResponse(null);
    mockCountriesRepository.getIpCountryCode.mockResolvedValue(mockIpCountryResponse);

    const mockSavedVisit = new Visit("home", "user-123", null);
    const mockRegisterResponse = new ResponseModel<Visit>("tx-1").withResponse(mockSavedVisit);
    mockVisitRepository.registerVisit.mockResolvedValue(mockRegisterResponse);

    const req = new RequestModel<Visit>("tx-1", visit);
    const res = await useCase.registerVisit(req, "192.168.1.1");

    expect(res.data).toBe(mockSavedVisit);
    expect(visit.countryCode).toBeNull();
  });
});
