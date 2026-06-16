import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Bug } from "../Entity/Bug";
import { BugFilter } from "../Entity/BugFilter";

export interface IIssueTrackerRepository {
  queryBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>>;
  saveOrUpdateBug(
    request: RequestModel<Bug>,
  ): Promise<ResponseModel<{ created: boolean; updated: boolean }>>;
  updateStatus(
    request: RequestModel<{
      id: string;
      status: string;
      comment?: string;
      adminId: string;
    }>,
  ): Promise<ResponseModel<Bug>>;
}
