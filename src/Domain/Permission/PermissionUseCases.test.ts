import { PermissionsUseCases } from "./PermissionUseCases";
import { IPermissionRepository } from "./Repository/IPermissionRepository";
import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Permission } from "./Entity/Permission";
import { PermissionFilter } from "./Entity/PermissionFilter";

describe("PermissionsUseCases - Unit Tests", () => {
  let useCases: PermissionsUseCases;
  let mockPermissionRepository: jest.Mocked<IPermissionRepository>;

  beforeEach(() => {
    mockPermissionRepository = {
      queryPermissions: jest.fn(),
      createPermission: jest.fn(),
      deletePermission: jest.fn(),
      queryById: jest.fn(),
      updatePermission: jest.fn(),
    } as jest.Mocked<IPermissionRepository>;

    useCases = new PermissionsUseCases(mockPermissionRepository);
  });

  test("should query permissions", async () => {
    const mockFilter = new PermissionFilter(1, "READ");
    const mockPermissions = [new Permission(1, "READ")];
    const mockResponse = new ResponseModel<Permission[]>("tx-1").withResponse(mockPermissions);
    mockPermissionRepository.queryPermissions.mockResolvedValue(mockResponse);

    const req = new RequestModel<PermissionFilter>("tx-1", mockFilter);
    const res = await useCases.queryPermissions(req);

    expect(res.data).toBe(mockPermissions);
    expect(mockPermissionRepository.queryPermissions).toHaveBeenCalledWith(req);
  });

  test("should create permission", async () => {
    const mockPermission = new Permission(null, "WRITE");
    const createdPermission = new Permission(2, "WRITE");
    const mockResponse = new ResponseModel<Permission>("tx-2").withResponse(createdPermission);
    mockPermissionRepository.createPermission.mockResolvedValue(mockResponse);

    const req = new RequestModel<Permission>("tx-2", mockPermission);
    const res = await useCases.createPermission(req);

    expect(res.data).toBe(createdPermission);
    expect(mockPermissionRepository.createPermission).toHaveBeenCalledWith(req);
  });

  test("should delete permission", async () => {
    const mockResponse = new ResponseModel<void>("tx-3");
    mockPermissionRepository.deletePermission.mockResolvedValue(mockResponse);

    const req = new RequestModel<number>("tx-3", 1);
    const res = await useCases.deletePermission(req);

    expect(res.errorCode).toBeUndefined();
    expect(mockPermissionRepository.deletePermission).toHaveBeenCalledWith(req);
  });

  test("should query permission by id", async () => {
    const mockPermission = new Permission(1, "READ");
    const mockResponse = new ResponseModel<Permission>("tx-4").withResponse(mockPermission);
    mockPermissionRepository.queryById.mockResolvedValue(mockResponse);

    const req = new RequestModel<number>("tx-4", 1);
    const res = await useCases.queryById(req);

    expect(res.data).toBe(mockPermission);
    expect(mockPermissionRepository.queryById).toHaveBeenCalledWith(req);
  });

  test("should update permission", async () => {
    const mockPermission = new Permission(1, "READ_WRITE");
    const mockResponse = new ResponseModel<Permission>("tx-5").withResponse(mockPermission);
    mockPermissionRepository.updatePermission.mockResolvedValue(mockResponse);

    const req = new RequestModel<Permission>("tx-5", mockPermission);
    const res = await useCases.updatePermission(req);

    expect(res.data).toBe(mockPermission);
    expect(mockPermissionRepository.updatePermission).toHaveBeenCalledWith(req);
  });
});
