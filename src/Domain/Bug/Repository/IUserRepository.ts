import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";

export interface IUserRepository {
  findSessionUser(request: RequestModel<string>): Promise<ResponseModel<{ email: string } | null>>;
}
