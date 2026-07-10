import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Visit } from "../Entity/Visit";

export interface IVisitRepository {
  registerVisit(request: RequestModel<Visit>): Promise<ResponseModel<Visit>>;
}
