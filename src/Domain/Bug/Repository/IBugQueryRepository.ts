import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { Bug } from "../Entity/Bug.js";
import type { BugFilter } from "../Entity/BugFilter.js";
import type { BugStatusLog } from "../Entity/BugStatusLog.js";

/** Reads bugs and their status history. */
export interface IBugQueryRepository {
  queryBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>>;
  queryLocalBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>>;
  findById(request: RequestModel<string>): Promise<ResponseModel<Bug | null>>;
  findExpiredRejectedBugs(
    request: RequestModel<Date>,
  ): Promise<ResponseModel<Bug[]>>;
  queryHistory(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugStatusLog[]>>;
}
