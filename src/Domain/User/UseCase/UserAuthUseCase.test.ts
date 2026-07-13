import { mock, MockProxy } from "jest-mock-extended";
import { UserAuthUseCase } from "./UserAuthUseCase";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { IGuestRoleRepository } from "@src/Domain/Role/Repository/IGuestRoleRepository";
import { Role } from "@src/Domain/Role/Entity/Role";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { UserRegistration } from "@src/Domain/User/Entity/UserRegistration";
import { Credentials } from "@src/Domain/User/Entity/Credentials";
import { User } from "@src/Domain/User/Entity/User";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";

describe("UserAuthUseCase", () => {
  let useCase: UserAuthUseCase;
  let mockUserRepository: MockProxy<IUserRepository>;
  let mockRoleRepository: MockProxy<IGuestRoleRepository>;

  beforeEach(() => {
    mockUserRepository = mock<IUserRepository>();
    mockRoleRepository = mock<IGuestRoleRepository>();
    useCase = new UserAuthUseCase(mockUserRepository, mockRoleRepository);
  });

  describe("signUp", () => {
    it("should fail if required fields are missing", async () => {
      const reg = {
        name: "",
        email: "",
        password: "",
        passwordConfirmation: "",
      } as unknown as UserRegistration;
      const req = new RequestModel<UserRegistration>("tx-1", reg);
      const res = await useCase.signUp(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });

    it("should fail if password does not match confirmation", async () => {
      const reg = {
        name: "Name",
        email: "test@e.com",
        password: "Password123!",
        passwordConfirmation: "OtherPass!",
      } as unknown as UserRegistration;
      const req = new RequestModel<UserRegistration>("tx-1", reg);
      const res = await useCase.signUp(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Password and password confirmation do not match.");
    });

    it("should fail if password does not match complex regexp pattern", async () => {
      const reg = {
        name: "Name",
        email: "test@e.com",
        password: "simple",
        passwordConfirmation: "simple",
      } as unknown as UserRegistration;
      const req = new RequestModel<UserRegistration>("tx-1", reg);
      const res = await useCase.signUp(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });

    it("should signup successfully if inputs are valid", async () => {
      const reg = UserRegistration.builder()
        .setName("Name")
        .setEmail("test@e.com")
        .setPassword("Password123!")
        .setPasswordConfirmation("Password123!")
        .build();
      const mockUser = User.builder()
        .setId("1")
        .setUser("u1")
        .setName("Name")
        .setEmail("test@e.com")
        .setIsEnabled(true)
        .setIsDeleted(false)
        .setCreatedAt(new Date())
        .build();
      const mockResponse = new ResponseModel<User>("tx-1").withResponse(mockUser);
      mockUserRepository.signUp.mockResolvedValue(mockResponse);

      const req = new RequestModel<UserRegistration>("tx-1", reg);
      const res = await useCase.signUp(req);
      expect(res.data).toBe(mockUser);
    });
  });

  describe("signIn", () => {
    it("should authenticate user and return details successfully", async () => {
      const credentials = new Credentials("testuser", "Password123!");
      const mockUser = User.builder()
        .setId("user-123")
        .setUser("testuser")
        .setName("Test User")
        .setEmail("test@e.com")
        .setIsEnabled(true)
        .setIsDeleted(false)
        .setCreatedAt(new Date())
        .build();
      const mockResponse = new ResponseModel<User>("tx-1").withResponse(mockUser);
      mockUserRepository.signIn.mockResolvedValue(mockResponse);

      const req = new RequestModel<Credentials>("tx-1", credentials);
      const res = await useCase.signIn(req);

      expect(res.data).toBe(mockUser);
      expect(mockUserRepository.signIn).toHaveBeenCalledWith(req);
    });
  });

  describe("findOrCreate", () => {
    it("should find or create user details successfully", async () => {
      const mockUser = User.builder()
        .setId("user-123")
        .setUser("testuser")
        .setName("Test User")
        .setEmail("test@e.com")
        .setIsEnabled(true)
        .setIsDeleted(false)
        .setCreatedAt(new Date())
        .build();
      const mockResponse = new ResponseModel<User>("tx-1").withResponse(mockUser);
      mockUserRepository.findOrCreateUser.mockResolvedValue(mockResponse);

      const req = new RequestModel<User>("tx-1", mockUser);
      const res = await useCase.findOrCreate(req);

      expect(res.data).toBe(mockUser);
      expect(mockUserRepository.findOrCreateUser).toHaveBeenCalledWith(req);
    });
  });

  describe("getGuestData", () => {
    it("should return Guest user details successfully", async () => {
      const mockExistsResponse1 = new ResponseModel<boolean>("tx-1").withResponse(true);
      const mockExistsResponse2 = new ResponseModel<boolean>("tx-1").withResponse(false);
      mockUserRepository.userExists
        .mockResolvedValueOnce(mockExistsResponse1)
        .mockResolvedValueOnce(mockExistsResponse2);

      const mockPermission = new Permission(1, "users::read");
      const mockRole = new Role(1, "Guest", [mockPermission]);
      mockRoleRepository.queryGuestRole.mockResolvedValue(
        new ResponseModel<Role>("tx-1").withResponse(mockRole),
      );

      const req = new RequestModel<string>("tx-1", "existing-guest");
      const res = await useCase.getGuestData(req);

      expect(res.data?.name).toBe("Guest");
      expect(res.data?.roles).toContain("Guest");
      expect(res.data?.permissions).toContain("users::read");
    });
  });
});
