import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Role } from "../Entity/Role.js";

export interface IGuestRoleRepository {
  queryGuestRole(request: RequestModel<void>): Promise<ResponseModel<Role>>;
}
