import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { BugUserRef } from "../Entity/Bug.js";

/** The administrators bugs are assigned to. */
export interface IBugAssigneeRepository {
  /** Replaces the administrators assigned to a bug; answers the new list. */
  setAssignees(
    request: RequestModel<{
      bugId: string;
      userIds: string[];
      assignedBy?: string;
    }>,
  ): Promise<ResponseModel<BugUserRef[]>>;
  /** Enabled accounts that hold the given permission. */
  queryUsersWithPermission(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugUserRef[]>>;
}
