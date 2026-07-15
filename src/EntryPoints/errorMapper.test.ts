import { mapDomainErrorToHttpStatus } from "./errorMapper";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import HttpStatusCodes from "@src/common/HttpStatusCodes";

describe("errorMapper Unit Tests", () => {
  it("should return OK if no error code is provided", () => {
    expect(mapDomainErrorToHttpStatus()).toBe(HttpStatusCodes.OK);
    expect(mapDomainErrorToHttpStatus(null)).toBe(HttpStatusCodes.OK);
  });

  it("should map known DomainErrorCodes to correct HttpStatusCodes", () => {
    expect(mapDomainErrorToHttpStatus(DomainErrorCodes.INVALID_INPUT)).toBe(
      HttpStatusCodes.BAD_REQUEST,
    );
    expect(mapDomainErrorToHttpStatus(DomainErrorCodes.ENTITY_NOT_FOUND)).toBe(
      HttpStatusCodes.NOT_FOUND,
    );
    expect(mapDomainErrorToHttpStatus(DomainErrorCodes.UNAUTHORIZED_ACCESS)).toBe(
      HttpStatusCodes.UNAUTHORIZED,
    );
    expect(mapDomainErrorToHttpStatus(DomainErrorCodes.SYSTEM_ERROR)).toBe(
      HttpStatusCodes.INTERNAL_SERVER_ERROR,
    );
  });

  it("should return the errorCode if it is a number in default case", () => {
    expect(mapDomainErrorToHttpStatus(418)).toBe(418);
  });

  it("should return INTERNAL_SERVER_ERROR if it is an unknown domain error code and not a number", () => {
    expect(mapDomainErrorToHttpStatus("UNKNOWN_ERROR" as DomainErrorCodes)).toBe(
      HttpStatusCodes.INTERNAL_SERVER_ERROR,
    );
  });

  it("should return parsed number if errorCode is a numeric string", () => {
    expect(mapDomainErrorToHttpStatus("404")).toBe(404);
  });
});
