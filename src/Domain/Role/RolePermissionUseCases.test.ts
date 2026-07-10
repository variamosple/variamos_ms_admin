import { mock, MockProxy } from "jest-mock-extended";
import { RolePermissionUseCases } from "./RolePermissionUseCases";
import { IRolePermissionRepository } from "./Repository/IRolePermissionRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Permission } from "../Permission/Entity/Permission";
import { RolePermission } from "./Entity/RolePermission";
import { RolePermissionFilter } from "./Entity/RolePermissionFilter";

describe("RolePermissionUseCases - Unit Tests", () => {
  let useCases: RolePermissionUseCases;
  let mockRolePermissionRepository: MockProxy<IRolePermissionRepository>;

  beforeEach(() => {
    mockRolePermissionRepository = mock<IRolePermissionRepository>();

    useCases = new RolePermissionUseCases(mockRolePermissionRepository);
  });

  test("should query role permissions", async () => {
    const mockFilter = new RolePermissionFilter(1);
    const mockPermissions = [new Permission(1, "roles::read")];
    const mockResponse = new ResponseModel<Permission[]>("tx-1").withResponse(mockPermissions);
    mockRolePermissionRepository.queryRolePermissions.mockResolvedValue(mockResponse);

    const req = new RequestModel<RolePermissionFilter>("tx-1", mockFilter);
    const res = await useCases.queryRolePermissions(req);

    expect(res.data).toBe(mockPermissions);
    expect(mockRolePermissionRepository.queryRolePermissions).toHaveBeenCalledWith(req);
  });

  test("should create role permission", async () => {
    const mockRolePermission = new RolePermission(1, 2);
    const mockResponse = new ResponseModel<RolePermission>("tx-2").withResponse(mockRolePermission);
    mockRolePermissionRepository.createRolePermission.mockResolvedValue(mockResponse);

    const req = new RequestModel<RolePermission>("tx-2", mockRolePermission);
    const res = await useCases.createRolePermission(req);

    expect(res.data).toBe(mockRolePermission);
    expect(mockRolePermissionRepository.createRolePermission).toHaveBeenCalledWith(req);
  });

  test("should delete role permission", async () => {
    const mockRolePermission = new RolePermission(1, 2);
    const mockResponse = new ResponseModel<void>("tx-3");
    mockRolePermissionRepository.deleteRolePermission.mockResolvedValue(mockResponse);

    const req = new RequestModel<RolePermission>("tx-3", mockRolePermission);
    const res = await useCases.deleteRolePermission(req);

    expect(res.errorCode).toBeUndefined();
    expect(mockRolePermissionRepository.deleteRolePermission).toHaveBeenCalledWith(req);
  });
});
