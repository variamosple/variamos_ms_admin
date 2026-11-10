import { type MockProxy, mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { User } from "../Entity/User.js";
import type { IUserRepository } from "../IUserRepository.js";
import { PasswordResetTokenService } from "./PasswordResetTokenService.js";

describe("PasswordResetTokenService", () => {
  let service: PasswordResetTokenService;
  let mockUserRepository: MockProxy<IUserRepository>;
  let logger: MockProxy<ILogger>;

  beforeEach(() => {
    mockUserRepository = mock<IUserRepository>();
    logger = mock<ILogger>();
    service = new PasswordResetTokenService(mockUserRepository, logger);
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

    const token = await service.createResetToken(
      mockUser,
      3600000,
      "TEST CONTEXT",
    );

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

    await expect(
      service.createResetToken(disabledUser, 3600000, "TEST CONTEXT"),
    ).rejects.toThrow("User account is disabled.");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("TEST CONTEXT"),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("user-123"),
    );
    expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
  });

  it("should throw an error if user is marked as deleted", async () => {
    const deletedUser = { ...mockUser, isDeleted: true } as User;

    await expect(
      service.createResetToken(deletedUser, 3600000, "TEST CONTEXT"),
    ).rejects.toThrow("User account is deleted.");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("TEST CONTEXT"),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("user-123"),
    );
    expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
  });
});
