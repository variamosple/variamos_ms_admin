import { mock, MockProxy } from "jest-mock-extended";
import { RolesUseCases } from "./RoleUseCases";
import { IRoleRepository } from "./Repository/IRoleRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Role } from "./Entity/Role";
import { RoleFilter } from "./Entity/RoleFilter";

describe("RolesUseCases - Unit Tests", () => {
  let useCases: RolesUseCases;
  let mockRoleRepository: MockProxy<IRoleRepository>;

  beforeEach(() => {
    mockRoleRepository = mock<IRoleRepository>();

    useCases = new RolesUseCases(mockRoleRepository);
  });

  test("should query roles", async () => {
    const mockFilter = new RoleFilter(1, "ADMIN");
    const mockRoles = [new Role(1, "ADMIN")];
    const mockResponse = new ResponseModel<Role[]>("tx-1").withResponse(mockRoles);
    mockRoleRepository.queryRoles.mockResolvedValue(mockResponse);

    const req = new RequestModel<RoleFilter>("tx-1", mockFilter);
    const res = await useCases.queryRoles(req);

    expect(res.data).toBe(mockRoles);
    expect(mockRoleRepository.queryRoles).toHaveBeenCalledWith(req);
  });

  test("should create role", async () => {
    const mockRole = new Role(null, "USER");
    const createdRole = new Role(2, "USER");
    const mockResponse = new ResponseModel<Role>("tx-2").withResponse(createdRole);
    mockRoleRepository.createRole.mockResolvedValue(mockResponse);

    const req = new RequestModel<Role>("tx-2", mockRole);
    const res = await useCases.createRole(req);

    expect(res.data).toBe(createdRole);
    expect(mockRoleRepository.createRole).toHaveBeenCalledWith(req);
  });

  test("should delete role", async () => {
    const mockResponse = new ResponseModel<void>("tx-3");
    mockRoleRepository.deleteRole.mockResolvedValue(mockResponse);

    const req = new RequestModel<string>("tx-3", "1");
    const res = await useCases.deleteRole(req);

    expect(res.errorCode).toBeUndefined();
    expect(mockRoleRepository.deleteRole).toHaveBeenCalledWith(req);
  });

  test("should query role by id", async () => {
    const mockRole = new Role(1, "ADMIN");
    const mockResponse = new ResponseModel<Role>("tx-4").withResponse(mockRole);
    mockRoleRepository.queryById.mockResolvedValue(mockResponse);

    const req = new RequestModel<string>("tx-4", "1");
    const res = await useCases.queryById(req);

    expect(res.data).toBe(mockRole);
    expect(mockRoleRepository.queryById).toHaveBeenCalledWith(req);
  });

  test("should update role", async () => {
    const mockRole = new Role(1, "SUPER_ADMIN");
    const mockResponse = new ResponseModel<Role>("tx-5").withResponse(mockRole);
    mockRoleRepository.updateRole.mockResolvedValue(mockResponse);

    const req = new RequestModel<Role>("tx-5", mockRole);
    const res = await useCases.updateRole(req);

    expect(res.data).toBe(mockRole);
    expect(mockRoleRepository.updateRole).toHaveBeenCalledWith(req);
  });
});
