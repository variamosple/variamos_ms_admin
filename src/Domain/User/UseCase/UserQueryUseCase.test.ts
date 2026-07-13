import { mock, MockProxy } from "jest-mock-extended";
import { UserQueryUseCase } from "./UserQueryUseCase";
import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { User } from "@src/Domain/User/Entity/User";
import { UserFilter } from "@src/Domain/User/Entity/UserFilter";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";

describe("UserQueryUseCase", () => {
  let useCase: UserQueryUseCase;
  let mockUserRepository: MockProxy<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = mock<IUserRepository>();
    useCase = new UserQueryUseCase(mockUserRepository);
  });

  const mockUser = User.builder()
    .setId("user-123")
    .setUser("testuser")
    .setName("Test User")
    .setEmail("test@e.com")
    .setIsEnabled(true)
    .setIsDeleted(false)
    .setCreatedAt(new Date())
    .build();

  describe("queryList", () => {
    it("should query users with filter", async () => {
      const mockFilter = new UserFilter("1", "testuser");
      const mockResponse = new ResponseModel<User[]>("tx-1").withResponse([mockUser]);
      mockUserRepository.queryUsers.mockResolvedValue(mockResponse);

      const req = new RequestModel<UserFilter>("tx-1", mockFilter);
      const res = await useCase.queryList(req);

      expect(res.data).toEqual([mockUser]);
      expect(mockUserRepository.queryUsers).toHaveBeenCalledWith(req);
    });
  });

  describe("queryById", () => {
    it("should query user by id successfully", async () => {
      const mockResponse = new ResponseModel<User>("tx-1").withResponse(mockUser);
      mockUserRepository.queryById.mockResolvedValue(mockResponse);

      const req = new RequestModel<string>("tx-1", "user-123");
      const res = await useCase.queryById(req);

      expect(res.data).toBe(mockUser);
      expect(mockUserRepository.queryById).toHaveBeenCalledWith(req);
    });
  });

  describe("sessionUser", () => {
    it("should find session user successfully", async () => {
      const mockResponse = new ResponseModel<User>("tx-1").withResponse(mockUser);
      mockUserRepository.findSessionUser.mockResolvedValue(mockResponse);

      const req = new RequestModel<string>("tx-1", "session-token");
      const res = await useCase.sessionUser(req);

      expect(res.data).toBe(mockUser);
      expect(mockUserRepository.findSessionUser).toHaveBeenCalledWith(req);
    });
  });

  describe("myAccount", () => {
    it("should return minimized user details successfully", async () => {
      const fullMockUser = User.builder()
        .setId("user-123")
        .setUser("testuser")
        .setName("Test User")
        .setEmail("test@e.com")
        .setIsEnabled(true)
        .setIsDeleted(false)
        .setRoles(["Guest"])
        .setPermissions(["users::read"])
        .setCountryCode("FR")
        .setCountryName("France")
        .setCreatedAt(new Date())
        .build();

      mockUserRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(fullMockUser),
      );

      const req = new RequestModel<string>("tx-1", "user-123");
      const res = await useCase.myAccount(req);

      expect(res.data?.id).toBe("user-123");
      expect(res.data?.roles).toBeUndefined(); // minimized
      expect(res.data?.permissions).toBeUndefined(); // minimized
      expect(res.data?.countryCode).toBe("FR");
      expect(res.data?.countryName).toBe("France");
    });
  });
});
