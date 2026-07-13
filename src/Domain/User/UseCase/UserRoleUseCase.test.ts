import { mock, MockProxy } from "jest-mock-extended";
import { UserRoleUseCase } from "./UserRoleUseCase";
import { IUserRoleRepository } from "../Repository/IUserRoleRepository";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "@src/Domain/Role/Entity/Role";
import { UserRole } from "../Entity/UserRole";
import { UserRoleFilter } from "../Entity/UserRoleFilter";

describe("UserRoleUseCase", () => {
  let useCase: UserRoleUseCase;
  let mockRepository: MockProxy<IUserRoleRepository>;

  beforeEach(() => {
    mockRepository = mock<IUserRoleRepository>();
    useCase = new UserRoleUseCase(mockRepository);
  });

  it("should query user roles", async () => {
    mockRepository.queryUserRoles.mockResolvedValue(
      new ResponseModel<Role[]>("tx-1").withResponse([]),
    );
    const req = new RequestModel("tx-1", new UserRoleFilter("user-123"));
    const res = await useCase.queryUserRoles(req);
    expect(res.data).toEqual([]);
  });

  it("should query user roles details", async () => {
    mockRepository.queryUserRolesDetails.mockResolvedValue(
      new ResponseModel<Role[]>("tx-1").withResponse([]),
    );
    const req = new RequestModel("tx-1", new UserRoleFilter("user-123"));
    const res = await useCase.queryUserRolesDetails(req);
    expect(res.data).toEqual([]);
  });

  it("should create user role", async () => {
    const mockUserRole = new UserRole("user-1", 1);
    mockRepository.createUserRole.mockResolvedValue(
      new ResponseModel<UserRole>("tx-1").withResponse(mockUserRole),
    );
    const req = new RequestModel("tx-1", mockUserRole);
    const res = await useCase.createUserRole(req);
    expect(res.data).toBe(mockUserRole);
  });

  it("should delete user role", async () => {
    const mockUserRole = new UserRole("user-1", 1);
    mockRepository.deleteUserRole.mockResolvedValue(new ResponseModel<void>("tx-1"));
    const req = new RequestModel("tx-1", mockUserRole);
    const res = await useCase.deleteUserRole(req);
    expect(res.errorCode).toBeUndefined();
  });
});
