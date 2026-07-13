import { mock, MockProxy } from "jest-mock-extended";
import { PasswordResetTokenService } from "./PasswordResetTokenService";
import { IUserRepository } from "../IUserRepository";
import { User } from "../Entity/User";

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
  });

  it("should throw an error if user is disabled", async () => {
    const disabledUser = { ...mockUser, isEnabled: false } as User;

    await expect(service.createResetToken(disabledUser, 3600000, "TEST CONTEXT")).rejects.toThrow(
      "User account is disabled.",
    );

    expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
  });

  it("should throw an error if user is marked as deleted", async () => {
    const deletedUser = { ...mockUser, isDeleted: true } as User;

    await expect(service.createResetToken(deletedUser, 3600000, "TEST CONTEXT")).rejects.toThrow(
      "User account is deleted.",
    );

    expect(mockUserRepository.savePasswordResetToken).not.toHaveBeenCalled();
  });
});
