import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { Role } from "@src/Domain/Role/Entity/Role.js";
import type { IRoleRepository } from "@src/Domain/Role/Repository/IRoleRepository.js";
import { type MockProxy, mock } from "vitest-mock-extended";
import { RoleManagementUseCase } from "./RoleManagementUseCase.js";

describe("RoleManagementUseCase - Unit Tests", () => {
  let useCase: RoleManagementUseCase;
  let mockRoleRepository: MockProxy<IRoleRepository>;

  beforeEach(() => {
    mockRoleRepository = mock<IRoleRepository>();
    useCase = new RoleManagementUseCase(mockRoleRepository);
  });

  test("should create role", async () => {
    const mockRole = new Role(null, "User");
    const createdRole = new Role(2, "User");
    const mockResponse = new ResponseModel<Role>("tx-2").withResponse(
      createdRole,
    );
    mockRoleRepository.createRole.mockResolvedValue(mockResponse);

    const req = new RequestModel<Role>("tx-2", mockRole);
    const res = await useCase.createRole(req);

    expect(res.data).toBe(createdRole);
    expect(mockRoleRepository.createRole).toHaveBeenCalledWith(req);
  });

  test("should delete role", async () => {
    const mockResponse = new ResponseModel<void>("tx-3");
    mockRoleRepository.deleteRole.mockResolvedValue(mockResponse);

    const req = new RequestModel<string>("tx-3", "1");
    const res = await useCase.deleteRole(req);

    expect(res.errorCode).toBeUndefined();
    expect(mockRoleRepository.deleteRole).toHaveBeenCalledWith(req);
  });

  test("should update role", async () => {
    const mockRole = new Role(1, "Super admin");
    const mockResponse = new ResponseModel<Role>("tx-5").withResponse(mockRole);
    mockRoleRepository.updateRole.mockResolvedValue(mockResponse);

    const req = new RequestModel<Role>("tx-5", mockRole);
    const res = await useCase.updateRole(req);

    expect(res.data).toBe(mockRole);
    expect(mockRoleRepository.updateRole).toHaveBeenCalledWith(req);
  });
});
