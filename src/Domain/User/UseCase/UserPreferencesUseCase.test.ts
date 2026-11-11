import { mock } from "vitest-mock-extended";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { NO_PREFERENCES } from "../Entity/UserPreferences.js";
import type { IUserPreferencesRepository } from "../Repository/IUserPreferencesRepository.js";
import { UserPreferencesUseCase } from "./UserPreferencesUseCase.js";

const SAVED = {
  timeZone: "Europe/Paris",
  updatedAt: new Date("2026-11-11T12:00:00Z"),
};

describe("UserPreferencesUseCase (EV-115 lot C)", () => {
  const preferences = mock<IUserPreferencesRepository>();
  const useCase = new UserPreferencesUseCase(preferences);

  beforeEach(() => {
    vi.resetAllMocks();
    preferences.save.mockResolvedValue(SAVED);
  });

  it("gives the preferences of the account", async () => {
    preferences.find.mockResolvedValue(NO_PREFERENCES);

    const response = await useCase.get("t", "user-1");

    expect(response.data).toEqual(NO_PREFERENCES);
    expect(preferences.find).toHaveBeenCalledWith("user-1");
  });

  it("saves a known time zone under the name the runtime gives it", async () => {
    const response = await useCase.setTimeZone("t", "user-1", " europe/paris ");

    expect(response.errorCode).toBeUndefined();
    expect(response.data).toEqual(SAVED);
    expect(preferences.save).toHaveBeenCalledWith("user-1", "Europe/Paris");
  });

  it("goes back to the browser's time zone with null", async () => {
    await useCase.setTimeZone("t", "user-1", null);

    expect(preferences.save).toHaveBeenCalledWith("user-1", null);
  });

  it("refuses an unknown time zone and saves nothing", async () => {
    const response = await useCase.setTimeZone("t", "user-1", "Mars/Base");

    expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(response.message).toBe("The time zone is unknown.");
    expect(preferences.save).not.toHaveBeenCalled();
  });
});
