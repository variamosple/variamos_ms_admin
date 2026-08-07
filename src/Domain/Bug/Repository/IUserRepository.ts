import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";

export interface IUserRepository {
  findSessionUser(
    request: RequestModel<string>,
  ): Promise<ResponseModel<{ email: string } | null>>;
}
