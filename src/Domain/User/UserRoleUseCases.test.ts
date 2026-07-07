import { UserRoleUseCases } from "./UserRoleUseCases";
import { IUserRoleRepository } from "./Repository/IUserRoleRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Role } from "../Role/Entity/Role";
import { UserRole } from "./Entity/UserRole";
import { UserRoleFilter } from "./Entity/UserRoleFilter";

describe("UserRoleUseCases - Unit Tests", () => {
  let useCases: UserRoleUseCases;
  let mockUserRoleRepository: jest.Mocked<IUserRoleRepository>;

  beforeEach(() => {
    mockUserRoleRepository = {
      queryUserRoles: jest.fn(),
      queryUserRolesDetails: jest.fn(),
      createUserRole: jest.fn(),
      deleteUserRole: jest.fn(),
    } as jest.Mocked<IUserRoleRepository>;

    useCases = new UserRoleUseCases(mockUserRoleRepository);
  });

  test("should query user roles", async () => {
    const mockFilter = new UserRoleFilter("user-123");
    const mockRoles = [new Role(1, "ADMIN")];
    const mockResponse = new ResponseModel<Role[]>("tx-1").withResponse(mockRoles);
    mockUserRoleRepository.queryUserRoles.mockResolvedValue(mockResponse);

    const req = new RequestModel<UserRoleFilter>("tx-1", mockFilter);
    const res = await useCases.queryUserRoles(req);

    expect(res.data).toBe(mockRoles);
    expect(mockUserRoleRepository.queryUserRoles).toHaveBeenCalledWith(req);
  });

  test("should query user roles details", async () => {
    const mockFilter = new UserRoleFilter("user-123");
    const mockRoles = [new Role(1, "ADMIN")];
    const mockResponse = new ResponseModel<Role[]>("tx-2").withResponse(mockRoles);
    mockUserRoleRepository.queryUserRolesDetails.mockResolvedValue(mockResponse);

    const req = new RequestModel<UserRoleFilter>("tx-2", mockFilter);
    const res = await useCases.queryUserRolesDetails(req);

    expect(res.data).toBe(mockRoles);
    expect(mockUserRoleRepository.queryUserRolesDetails).toHaveBeenCalledWith(req);
  });

  test("should create user role", async () => {
    const mockUserRole = new UserRole("user-123", 1);
    const mockResponse = new ResponseModel<UserRole>("tx-3").withResponse(mockUserRole);
    mockUserRoleRepository.createUserRole.mockResolvedValue(mockResponse);

    const req = new RequestModel<UserRole>("tx-3", mockUserRole);
    const res = await useCases.createUserRole(req);

    expect(res.data).toBe(mockUserRole);
    expect(mockUserRoleRepository.createUserRole).toHaveBeenCalledWith(req);
  });

  test("should delete user role", async () => {
    const mockUserRole = new UserRole("user-123", 1);
    const mockResponse = new ResponseModel<void>("tx-4");
    mockUserRoleRepository.deleteUserRole.mockResolvedValue(mockResponse);

    const req = new RequestModel<UserRole>("tx-4", mockUserRole);
    const res = await useCases.deleteUserRole(req);

    expect(res.errorCode).toBeUndefined();
    expect(mockUserRoleRepository.deleteUserRole).toHaveBeenCalledWith(req);
  });
});
