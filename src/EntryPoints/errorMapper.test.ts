import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";

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
    expect(
      mapDomainErrorToHttpStatus(DomainErrorCodes.UNAUTHORIZED_ACCESS),
    ).toBe(HttpStatusCodes.UNAUTHORIZED);
    expect(mapDomainErrorToHttpStatus(DomainErrorCodes.SYSTEM_ERROR)).toBe(
      HttpStatusCodes.INTERNAL_SERVER_ERROR,
    );
    expect(mapDomainErrorToHttpStatus(DomainErrorCodes.UNAVAILABLE)).toBe(
      HttpStatusCodes.SERVICE_UNAVAILABLE,
    );
  });

  it.each([418, "404", 0.5])(
    "answers 500 for a code outside the enumeration, even a number: %j",
    (code) => {
      expect(mapDomainErrorToHttpStatus(code)).toBe(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
      );
    },
  );

  it("should return INTERNAL_SERVER_ERROR if it is an unknown domain error code and not a number", () => {
    expect(
      mapDomainErrorToHttpStatus("UNKNOWN_ERROR" as DomainErrorCodes),
    ).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
  });
});
