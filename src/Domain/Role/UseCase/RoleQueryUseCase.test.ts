import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { Role } from "@src/Domain/Role/Entity/Role.js";
import { RoleFilter } from "@src/Domain/Role/Entity/RoleFilter.js";
import type { IRoleRepository } from "@src/Domain/Role/Repository/IRoleRepository.js";
import { type MockProxy, mock } from "vitest-mock-extended";
import { RoleQueryUseCase } from "./RoleQueryUseCase.js";

describe("RoleQueryUseCase - Unit Tests", () => {
  let useCase: RoleQueryUseCase;
  let mockRoleRepository: MockProxy<IRoleRepository>;

  beforeEach(() => {
    mockRoleRepository = mock<IRoleRepository>();
    useCase = new RoleQueryUseCase(mockRoleRepository);
  });

  test("should query roles", async () => {
    const mockFilter = new RoleFilter(1, "Admin");
    const mockRoles = [new Role(1, "Admin")];
    const mockResponse = new ResponseModel<Role[]>("tx-1").withResponse(
      mockRoles,
    );
    mockRoleRepository.queryRoles.mockResolvedValue(mockResponse);

    const req = new RequestModel<RoleFilter>("tx-1", mockFilter);
    const res = await useCase.queryRoles(req);

    expect(res.data).toBe(mockRoles);
    expect(mockRoleRepository.queryRoles).toHaveBeenCalledWith(req);
  });

  test("should query role by id", async () => {
    const mockRole = new Role(1, "Admin");
    const mockResponse = new ResponseModel<Role>("tx-4").withResponse(mockRole);
    mockRoleRepository.queryById.mockResolvedValue(mockResponse);

    const req = new RequestModel<string>("tx-4", "1");
    const res = await useCase.queryById(req);

    expect(res.data).toBe(mockRole);
    expect(mockRoleRepository.queryById).toHaveBeenCalledWith(req);
  });
});
