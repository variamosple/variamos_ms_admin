import logger from "jet-logger";
import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import type { BugUserRef } from "#src/Domain/Bug/Entity/Bug.js";
import type { IBugRepository } from "#src/Domain/Bug/Repository/IBugRepository.js";
import type { IBugAssignmentNotifier } from "#src/Domain/Bug/Service/IBugAssignmentNotifier.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";

// Only an administrator who can work on a bug may be assigned to it
export const ASSIGNABLE_PERMISSION = "bugs::update";

/**
 * Assignment of a bug to several administrators (T-23, EV-84 lot 3,
 * MA-BG-01). The new assignees are notified in the application.
 */
export class BugAssignmentUseCase {
  public constructor(
    private readonly bugRepository: IBugRepository,
    private readonly notifier: IBugAssignmentNotifier,
    private readonly journal: IActivityJournal,
  ) {}

  public queryAssignableUsers(
    request: RequestModel<void>,
  ): Promise<ResponseModel<BugUserRef[]>> {
    return this.bugRepository.queryUsersWithPermission(
      new RequestModel(request.transactionId, ASSIGNABLE_PERMISSION),
    );
  }

  public async setAssignees(
    request: RequestModel<{ bugId: string; userIds: string[] }>,
  ): Promise<ResponseModel<BugUserRef[]>> {
    const { transactionId, data, actorId } = request;
    const fail = (code: DomainErrorCodes, message = "") =>
      new ResponseModel<BugUserRef[]>(transactionId).withError(code, message);

    if (!data?.bugId) {
      return fail(DomainErrorCodes.INVALID_INPUT, "Bug ID is required.");
    }
    const userIds = [...new Set(data.userIds)];

    const bugResponse = await this.bugRepository.findById(
      new RequestModel(transactionId, data.bugId),
    );
    if (bugResponse.errorCode) {
      return fail(bugResponse.errorCode, bugResponse.message);
    }
    const bug = bugResponse.data;
    if (!bug) {
      return fail(DomainErrorCodes.ENTITY_NOT_FOUND, "Bug not found.");
    }

    if (userIds.length > 0) {
      const assignable = await this.queryAssignableUsers(
        new RequestModel(transactionId),
      );
      if (assignable.errorCode) {
        return fail(assignable.errorCode, assignable.message);
      }
      const allowed = new Set((assignable.data ?? []).map((user) => user.id));
      if (userIds.some((id) => !allowed.has(id))) {
        return fail(
          DomainErrorCodes.INVALID_INPUT,
          "Only enabled administrators who can update bugs can be assigned.",
        );
      }
    }

    const before = (bug.assignedAdmins ?? []).map((user) => user.id);
    const response = await withJournal(
      this.journal,
      {
        actorId,
        action: "bug.assignees.update",
        entityType: "bug",
        entityId: bug.id,
        before: { assignees: before },
        after: { assignees: userIds },
        transactionId,
      },
      () =>
        this.bugRepository.setAssignees(
          new RequestModel(
            transactionId,
            { bugId: bug.id, userIds, assignedBy: actorId },
            actorId,
          ),
        ),
    );

    const added = userIds.filter((id) => !before.includes(id));
    if (!response.errorCode && added.length > 0) {
      // The assignment is saved: a notification failure is only logged
      await this.notifier
        .notifyAssigned(added, bug.title, actorId)
        .catch((error: Error) =>
          logger.warn(`Bug assignment notification failed: ${error.message}`),
        );
    }
    return response;
  }
}
