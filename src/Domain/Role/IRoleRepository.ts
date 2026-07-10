import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Role } from "./Entity/Role";

export interface IRoleRepository {
  queryGuestRole(request: RequestModel<void>): Promise<ResponseModel<Role>>;
}
