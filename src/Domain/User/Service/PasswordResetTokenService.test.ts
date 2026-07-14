import { mock, MockProxy } from "jest-mock-extended";
import { PasswordResetTokenService } from "./PasswordResetTokenService";
import { IUserRepository } from "../IUserRepository";
import { User } from "../Entity/User";
import logger from "jet-logger";

describe("PasswordResetTokenService", () => {
  let service: PasswordResetTokenService;
  let mockUserRepository: MockProxy<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = mock<IUserRepository>();
    service = new PasswordResetTokenService(mockUserRepository);
  });

  const mockUser = {
    id: "user-123",
    isEnabled: true,
    isDeleted: false,
    name: "Test User",
    email: "user@example.com",
    user: "testuser",
    roles: [],
    permissions: [],
    countryCode: null,
    countryName: null,
    createdAt: new Date(),
  } as User;

  it("should generate a token and save its hash in the database successfully", async () => {
    mockUserRepository.savePasswordResetToken.mockResolvedValue(undefined);

    const token = await service.createResetToken(mockUser, 3600000, "TEST CONTEXT");

    expect(token).toBeDefined();
    expect(token.length).toBe(36); // UUID length
    expect(mockUserRepository.savePasswordResetToken).toHaveBeenCalledWith(
      "user-123",
      expect.any(String),
      expect.any(Date),
    );

    const call = mockUserRepository.savePasswordResetToken.mock.calls[0];
    const savedDate = call[2];
    const minExpectedDate = new Date(Date.now() + 3500000);
    expect(savedDate.getTime()).toBeGreaterThan(minExpectedDate.getTime());
  });

  it("should throw an error if user is disabled", async () => {
    const disabledUser = { ...mockUser, isEnabled: false } as User;
    const loggerWarnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

    await expect(service.createResetToken(disabledUser, 3600000, "TEST CONTEXT")).rejects.toThrow(
      "User account is disabled.",
    );

    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining("TEST CONTEXT"));
    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining("user-123"));
    expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
    loggerWarnSpy.mockRestore();
  });

  it("should throw an error if user is marked as deleted", async () => {
    const deletedUser = { ...mockUser, isDeleted: true } as User;
    const loggerWarnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

    await expect(service.createResetToken(deletedUser, 3600000, "TEST CONTEXT")).rejects.toThrow(
      "User account is deleted.",
    );

    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining("TEST CONTEXT"));
    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining("user-123"));
    expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
    loggerWarnSpy.mockRestore();
  });
});
