import type { RequestModel } from "../Core/Entity/RequestModel.js";
import type { ResponseModel } from "../Core/Entity/ResponseModel.js";
import type { Role } from "./Entity/Role.js";

export interface IRoleRepository {
  queryGuestRole(request: RequestModel<void>): Promise<ResponseModel<Role>>;
}
