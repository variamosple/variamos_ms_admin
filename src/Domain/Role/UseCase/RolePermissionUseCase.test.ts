import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { Permission } from "@src/Domain/Permission/Entity/Permission.js";
import { RolePermission } from "@src/Domain/Role/Entity/RolePermission.js";
import { RolePermissionFilter } from "@src/Domain/Role/Entity/RolePermissionFilter.js";
import type { IRolePermissionRepository } from "@src/Domain/Role/Repository/IRolePermissionRepository.js";
import { type MockProxy, mock } from "vitest-mock-extended";
import { RolePermissionUseCase } from "./RolePermissionUseCase.js";

describe("RolePermissionUseCase - Unit Tests", () => {
  let useCase: RolePermissionUseCase;
  let mockRolePermissionRepository: MockProxy<IRolePermissionRepository>;

  beforeEach(() => {
    mockRolePermissionRepository = mock<IRolePermissionRepository>();
    useCase = new RolePermissionUseCase(mockRolePermissionRepository);
  });

  test("should query role permissions", async () => {
    const mockFilter = new RolePermissionFilter(1);
    const mockPermissions = [new Permission(1, "roles::read")];
    const mockResponse = new ResponseModel<Permission[]>("tx-1").withResponse(
      mockPermissions,
    );
    mockRolePermissionRepository.queryRolePermissions.mockResolvedValue(
      mockResponse,
    );

    const req = new RequestModel<RolePermissionFilter>("tx-1", mockFilter);
    const res = await useCase.queryRolePermissions(req);

    expect(res.data).toBe(mockPermissions);
    expect(
      mockRolePermissionRepository.queryRolePermissions,
    ).toHaveBeenCalledWith(req);
  });

  test("should create role permission", async () => {
    const mockRolePermission = new RolePermission(1, 2);
    const mockResponse = new ResponseModel<RolePermission>("tx-2").withResponse(
      mockRolePermission,
    );
    mockRolePermissionRepository.createRolePermission.mockResolvedValue(
      mockResponse,
    );

    const req = new RequestModel<RolePermission>("tx-2", mockRolePermission);
    const res = await useCase.createRolePermission(req);

    expect(res.data).toBe(mockRolePermission);
    expect(
      mockRolePermissionRepository.createRolePermission,
    ).toHaveBeenCalledWith(req);
  });

  test("should delete role permission", async () => {
    const mockRolePermission = new RolePermission(1, 2);
    const mockResponse = new ResponseModel<void>("tx-3");
    mockRolePermissionRepository.deleteRolePermission.mockResolvedValue(
      mockResponse,
    );

    const req = new RequestModel<RolePermission>("tx-3", mockRolePermission);
    const res = await useCase.deleteRolePermission(req);

    expect(res.errorCode).toBeUndefined();
    expect(
      mockRolePermissionRepository.deleteRolePermission,
    ).toHaveBeenCalledWith(req);
  });
});
