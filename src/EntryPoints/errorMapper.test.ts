import { mapDomainErrorToHttpStatus } from "./errorMapper";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import HttpStatusCodes from "@src/common/HttpStatusCodes";

describe("errorMapper Unit Tests", () => {
  it("should return OK if no error code is provided", () => {
    expect(mapDomainErrorToHttpStatus()).toBe(HttpStatusCodes.OK);
    expect(mapDomainErrorToHttpStatus(null)).toBe(HttpStatusCodes.OK);
  });

  it("should map known DomainErrorCodes to correct HttpStatusCodes", () => {
    expect(mapDomainErrorToHttpStatus(DomainErrorCodes.BAD_REQUEST)).toBe(
      HttpStatusCodes.BAD_REQUEST,
    );
    expect(mapDomainErrorToHttpStatus(DomainErrorCodes.NOT_FOUND)).toBe(HttpStatusCodes.NOT_FOUND);
    expect(mapDomainErrorToHttpStatus(DomainErrorCodes.UNAUTHORIZED)).toBe(
      HttpStatusCodes.UNAUTHORIZED,
    );
    expect(mapDomainErrorToHttpStatus(DomainErrorCodes.INTERNAL_ERROR)).toBe(
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
});
