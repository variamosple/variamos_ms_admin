import { mock } from "vitest-mock-extended";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IAccountCountryRepository } from "../Repository/IAccountCountryRepository.js";
import { AccountCountryUseCase } from "./AccountCountryUseCase.js";

describe("AccountCountryUseCase (EV-90)", () => {
  const countries = mock<IAccountCountryRepository>();
  const useCase = new AccountCountryUseCase(countries);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("saves the country of an account that has none, in capitals", async () => {
    countries.setIfMissing.mockResolvedValue(true);

    const response = await useCase.setDefault("t", "user-1", " co ");

    expect(response.errorCode).toBeUndefined();
    expect(response.data).toEqual({ saved: true });
    expect(countries.setIfMissing).toHaveBeenCalledWith("user-1", "CO");
  });

  it("says when the account kept the country it had", async () => {
    countries.setIfMissing.mockResolvedValue(false);

    const response = await useCase.setDefault("t", "user-1", "FR");

    expect(response.data).toEqual({ saved: false });
  });

  it.each(["", "C", "COL", "C1", "--"])(
    "refuses %j, which is not a country code",
    async (code) => {
      const response = await useCase.setDefault("t", "user-1", code);

      expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(countries.setIfMissing).not.toHaveBeenCalled();
    },
  );
});
