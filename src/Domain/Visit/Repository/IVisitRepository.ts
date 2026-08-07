import type { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import type { Visit } from "../Entity/Visit.js";

export interface IVisitRepository {
  registerVisit(request: RequestModel<Visit>): Promise<ResponseModel<Visit>>;
}
