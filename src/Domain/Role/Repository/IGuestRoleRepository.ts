import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Role } from "../Entity/Role";

export interface IGuestRoleRepository {
  queryGuestRole(request: RequestModel<void>): Promise<ResponseModel<Role>>;
}
