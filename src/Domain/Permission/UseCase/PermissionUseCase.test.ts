import { mock, MockProxy } from "jest-mock-extended";
import { PermissionUseCase } from "./PermissionUseCase";
import { IPermissionRepository } from "@src/Domain/Permission/Repository/IPermissionRepository";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Permission } from "@src/Domain/Permission/Entity/Permission";
import { PermissionFilter } from "@src/Domain/Permission/Entity/PermissionFilter";

describe("PermissionUseCase - Unit Tests", () => {
  let useCase: PermissionUseCase;
  let mockPermissionRepository: MockProxy<IPermissionRepository>;

  beforeEach(() => {
    mockPermissionRepository = mock<IPermissionRepository>();
    useCase = new PermissionUseCase(mockPermissionRepository);
  });

  test("should query permissions", async () => {
    const mockFilter = new PermissionFilter(1, "permissions::query");
    const mockPermissions = [new Permission(1, "permissions::query")];
    const mockResponse = new ResponseModel<Permission[]>("tx-1").withResponse(mockPermissions);
    mockPermissionRepository.queryPermissions.mockResolvedValue(mockResponse);

    const req = new RequestModel<PermissionFilter>("tx-1", mockFilter);
    const res = await useCase.queryPermissions(req);

    expect(res.data).toBe(mockPermissions);
    expect(mockPermissionRepository.queryPermissions).toHaveBeenCalledWith(req);
  });

  test("should create permission", async () => {
    const mockPermission = new Permission(null, "permissions::create");
    const createdPermission = new Permission(2, "permissions::create");
    const mockResponse = new ResponseModel<Permission>("tx-2").withResponse(createdPermission);
    mockPermissionRepository.createPermission.mockResolvedValue(mockResponse);

    const req = new RequestModel<Permission>("tx-2", mockPermission);
    const res = await useCase.createPermission(req);

    expect(res.data).toBe(createdPermission);
    expect(mockPermissionRepository.createPermission).toHaveBeenCalledWith(req);
  });

  test("should delete permission", async () => {
    const mockResponse = new ResponseModel<void>("tx-3");
    mockPermissionRepository.deletePermission.mockResolvedValue(mockResponse);

    const req = new RequestModel<number>("tx-3", 1);
    const res = await useCase.deletePermission(req);

    expect(res.errorCode).toBeUndefined();
    expect(mockPermissionRepository.deletePermission).toHaveBeenCalledWith(req);
  });

  test("should query permission by id", async () => {
    const mockPermission = new Permission(1, "permissions::query");
    const mockResponse = new ResponseModel<Permission>("tx-4").withResponse(mockPermission);
    mockPermissionRepository.queryById.mockResolvedValue(mockResponse);

    const req = new RequestModel<number>("tx-4", 1);
    const res = await useCase.queryById(req);

    expect(res.data).toBe(mockPermission);
    expect(mockPermissionRepository.queryById).toHaveBeenCalledWith(req);
  });

  test("should update permission", async () => {
    const mockPermission = new Permission(1, "permissions::update");
    const mockResponse = new ResponseModel<Permission>("tx-5").withResponse(mockPermission);
    mockPermissionRepository.updatePermission.mockResolvedValue(mockResponse);

    const req = new RequestModel<Permission>("tx-5", mockPermission);
    const res = await useCase.updatePermission(req);

    expect(res.data).toBe(mockPermission);
    expect(mockPermissionRepository.updatePermission).toHaveBeenCalledWith(req);
  });
});
