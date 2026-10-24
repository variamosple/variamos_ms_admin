import logger from "jet-logger";
import { type MockProxy, mock } from "vitest-mock-extended";
import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { Bug, type BugUserRef } from "#src/Domain/Bug/Entity/Bug.js";
import type { IBugRepository } from "#src/Domain/Bug/Repository/IBugRepository.js";
import type { IBugAssignmentNotifier } from "#src/Domain/Bug/Service/IBugAssignmentNotifier.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  ASSIGNABLE_PERMISSION,
  BugAssignmentUseCase,
} from "./BugAssignmentUseCase.js";

const ANA = { id: "u-ana", name: "Ana" };
const BEN = { id: "u-ben", name: "Ben" };
const CAM = { id: "u-cam", name: "Cam" };

describe("BugAssignmentUseCase", () => {
  let repository: MockProxy<IBugRepository>;
  let notifier: MockProxy<IBugAssignmentNotifier>;
  let journal: MockProxy<IActivityJournal>;
  let useCase: BugAssignmentUseCase;

  const bugAssignedTo = (...assignees: BugUserRef[]) =>
    Bug.builder()
      .setId("b1")
      .setTitle("Crash on save")
      .setStatus("open")
      .setAssignedAdmins(assignees)
      .build();

  const assign = (userIds: string[], bugId = "b1") =>
    useCase.setAssignees(new RequestModel("tx", { bugId, userIds }, "actor-1"));

  beforeEach(() => {
    repository = mock<IBugRepository>();
    notifier = mock<IBugAssignmentNotifier>();
    journal = mock<IActivityJournal>();
    useCase = new BugAssignmentUseCase(repository, notifier, journal);

    repository.findById.mockResolvedValue(
      new ResponseModel<Bug | null>("tx").withResponse(bugAssignedTo(ANA)),
    );
    repository.queryUsersWithPermission.mockResolvedValue(
      new ResponseModel<BugUserRef[]>("tx").withResponse([ANA, BEN, CAM]),
    );
    repository.setAssignees.mockImplementation(async (request) =>
      new ResponseModel<BugUserRef[]>("tx").withResponse(
        [ANA, BEN, CAM].filter((u) => request.data?.userIds.includes(u.id)),
      ),
    );
    notifier.notifyAssigned.mockResolvedValue();
  });

  it("lists the enabled accounts that can update bugs", async () => {
    await useCase.queryAssignableUsers(new RequestModel("tx"));

    expect(repository.queryUsersWithPermission).toHaveBeenCalledWith(
      expect.objectContaining({ data: ASSIGNABLE_PERMISSION }),
    );
    expect(ASSIGNABLE_PERMISSION).toBe("bugs::update");
  });

  it("replaces the assignees, journals the change and notifies only the new ones", async () => {
    const res = await assign([ANA.id, BEN.id, BEN.id]);

    expect(res.errorCode).toBeUndefined();
    expect(res.data).toEqual([ANA, BEN]);
    expect(repository.setAssignees).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { bugId: "b1", userIds: [ANA.id, BEN.id], assignedBy: "actor-1" },
      }),
    );
    expect(journal.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "actor-1",
        action: "bug.assignees.update",
        entityType: "bug",
        entityId: "b1",
        outcome: "success",
        before: { assignees: [ANA.id] },
        after: { assignees: [ANA.id, BEN.id] },
      }),
    );
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(
      [BEN.id],
      "Crash on save",
      "actor-1",
    );
  });

  it("clears the assignees without checking accounts nor notifying", async () => {
    const res = await assign([]);

    expect(res.data).toEqual([]);
    expect(repository.queryUsersWithPermission).not.toHaveBeenCalled();
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it("refuses an account that cannot update bugs, before any change", async () => {
    const res = await assign([ANA.id, "u-reader"]);

    expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(res.message).toBe(
      "Only enabled administrators who can update bugs can be assigned.",
    );
    expect(repository.setAssignees).not.toHaveBeenCalled();
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it("answers the error of the account lookup", async () => {
    repository.queryUsersWithPermission.mockResolvedValue(
      new ResponseModel<BugUserRef[]>("tx").withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      ),
    );

    const res = await assign([BEN.id]);

    expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    expect(repository.setAssignees).not.toHaveBeenCalled();
  });

  it("requires a bug id", async () => {
    const res = await assign([BEN.id], "");

    expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it("answers 'not found' for an unknown bug", async () => {
    repository.findById.mockResolvedValue(
      new ResponseModel<Bug | null>("tx").withResponse(null),
    );

    const res = await assign([BEN.id]);

    expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
    expect(repository.setAssignees).not.toHaveBeenCalled();
  });

  it("answers the error of the bug lookup", async () => {
    repository.findById.mockResolvedValue(
      new ResponseModel<Bug | null>("tx").withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      ),
    );

    const res = await assign([BEN.id]);

    expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    expect(repository.setAssignees).not.toHaveBeenCalled();
  });

  it("journals a failed save and notifies no one", async () => {
    repository.setAssignees.mockResolvedValue(
      new ResponseModel<BugUserRef[]>("tx").withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      ),
    );

    const res = await assign([BEN.id]);

    expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    expect(journal.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed" }),
    );
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it("keeps the saved assignment when the notification fails", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    notifier.notifyAssigned.mockRejectedValue(new Error("service down"));

    const res = await assign([ANA.id, CAM.id]);

    expect(res.errorCode).toBeUndefined();
    expect(res.data).toEqual([ANA, CAM]);
    expect(warn).toHaveBeenCalledWith(
      "Bug assignment notification failed: service down",
    );
    warn.mockRestore();
  });
});
