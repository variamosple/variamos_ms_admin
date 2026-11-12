import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import type { IBugTrackerConfig } from "#src/Domain/Bug/Config/IBugTrackerConfig.js";
import type { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import { isBugComponent } from "#src/Domain/Bug/Entity/BugComponent.js";
import { canChangeStatus } from "#src/Domain/Bug/Entity/BugStatus.js";
import type { IBugRepository } from "#src/Domain/Bug/Repository/IBugRepository.js";
import type { IBugScheduleProvider } from "#src/Domain/Bug/Service/BugScheduleService.js";
import type { IGitHubTokenProvider } from "#src/Domain/Bug/Service/IGitHubTokenProvider.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import type { IIssueTrackerService } from "#src/Domain/Core/Service/IIssueTrackerService.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IStorageService } from "#src/Domain/Core/Service/IStorageService.js";
import { BugIssueSync, type PublishedIssue } from "./BugIssueSync.js";
import {
  applyEdits,
  approvalNoteOf,
  invalidEdit,
  modifiedFieldsOf,
  type StatusChange,
} from "./bugApproval.js";

export interface BugLifecycleUseCaseDependencies {
  bugRepository: IBugRepository;
  issueTrackerService: IIssueTrackerService;
  storageService: IStorageService;
  githubConfig: IBugTrackerConfig;
  tokenResolver: IGitHubTokenProvider;
  journal: IActivityJournal;
  logger: ILogger;
  schedule: Pick<IBugScheduleProvider, "getRejectedRetentionDays">;
}

export class BugLifecycleUseCase {
  private readonly bugRepository: IBugRepository;
  private readonly storageService: IStorageService;
  private readonly issues: BugIssueSync;
  private readonly journal: IActivityJournal;
  private readonly logger: ILogger;
  private readonly schedule: Pick<
    IBugScheduleProvider,
    "getRejectedRetentionDays"
  >;

  public constructor(dependencies: BugLifecycleUseCaseDependencies) {
    const {
      bugRepository,
      issueTrackerService,
      storageService,
      githubConfig,
      tokenResolver,
      journal,
      logger,
      schedule,
    } = dependencies;
    this.bugRepository = bugRepository;
    this.storageService = storageService;
    this.issues = new BugIssueSync({
      githubConfig,
      tokenResolver,
      issueTrackerService,
    });
    this.journal = journal;
    this.logger = logger;
    this.schedule = schedule;
  }

  public async updateStatus(
    request: RequestModel<StatusChange>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data;
    if (!data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Request data is required.",
      );
    }

    if (!data.id || !data.status) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Bug ID and status are required.",
      );
    }

    const bugResponse = await this.bugRepository.findById(
      new RequestModel(request.transactionId, data.id),
    );

    if (!bugResponse.data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Bug not found.",
      );
    }

    const bug = bugResponse.data;

    if (!canChangeStatus(bug.status, data.status)) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        `A bug cannot go from "${bug.status}" to "${data.status}".`,
      );
    }

    return withJournal(
      this.journal,
      {
        actorId: request.actorId ?? data.adminId,
        action: "bug.status.update",
        entityType: "bug",
        entityId: bug.id,
        before: { status: bug.status },
        after: { status: data.status },
        transactionId: request.transactionId,
      },
      () => this.changeStatus(request.transactionId, data, bug),
    );
  }

  private async changeStatus(
    transactionId: string | undefined,
    data: StatusChange,
    bug: Bug,
  ): Promise<ResponseModel<Bug>> {
    const refuse = (message: string) =>
      new ResponseModel<Bug>(transactionId).withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        message,
      );
    const previousStatus = bug.status;

    const invalid = invalidEdit(data, bug);
    if (invalid) return refuse(invalid);

    // Checked by build() above
    const component =
      data.component && isBugComponent(data.component)
        ? data.component
        : undefined;
    const modifiedFields = modifiedFieldsOf(data, bug);
    applyEdits(bug, data, component);

    let issue: PublishedIssue | undefined;
    if (data.status === "open" && !bug.gitIssueNumber && bug.githubRepo) {
      const published = await this.issues.publishApproved(
        bug,
        bug.githubRepo,
        data.comment,
      );
      if (typeof published === "string") return refuse(published);
      issue = published;
    }

    // The issue follows the status before the database does: when GitHub
    // refuses, nothing changes, and a synchronization cannot undo the status
    if (bug.gitIssueNumber && bug.githubRepo) {
      const synced = await this.issues.applyStatusOnGitHub(
        bug.githubRepo,
        bug.gitIssueNumber,
        previousStatus,
        data.status,
      );
      if (!synced) {
        return refuse(
          "The GitHub issue could not be updated; the status was not changed.",
        );
      }
    }

    if (data.status === "open") {
      await this.bugRepository.createNote(
        new RequestModel(transactionId, {
          bugId: bug.id,
          body: approvalNoteOf(modifiedFields, data.comment),
        }),
      );
    }

    return this.bugRepository.updateStatus(
      new RequestModel(transactionId, {
        id: data.id,
        status: data.status,
        comment: data.comment,
        adminId: data.adminId,
        gitIssueNumber: issue?.gitIssueNumber,
        githubHtmlUrl: issue?.githubHtmlUrl,
        title: data.title,
        description: data.description,
        priority: data.priority,
        category: data.category,
        component,
        githubRepo: data.githubRepo,
      }),
    );
  }

  public async rejectBug(
    request: RequestModel<{ id: string; adminId: string }>,
  ): Promise<ResponseModel<Bug>> {
    return await withJournal(
      this.journal,
      {
        actorId: request.actorId ?? request.data?.adminId,
        action: "bug.reject",
        entityType: "bug",
        entityId: request.data?.id,
        transactionId: request.transactionId,
      },
      () => this.applyRejectBug(request),
    );
  }

  private async applyRejectBug(
    request: RequestModel<{ id: string; adminId: string }>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data;
    if (!data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Request data is required.",
      );
    }

    if (!data.id) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Bug ID is required.",
      );
    }

    const bugResponse = await this.bugRepository.findById(
      new RequestModel(request.transactionId, data.id),
    );

    if (!bugResponse.data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Local bug not found.",
      );
    }

    if (bugResponse.data.status !== "pending") {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Only pending bugs can be rejected.",
      );
    }

    return this.bugRepository.rejectBug(
      new RequestModel(request.transactionId, {
        id: data.id,
        adminId: data.adminId,
        logComment: "Bug rejected.",
      }),
    );
  }

  public async restoreBug(
    request: RequestModel<{ id: string; adminId: string }>,
  ): Promise<ResponseModel<Bug>> {
    return await withJournal(
      this.journal,
      {
        actorId: request.actorId ?? request.data?.adminId,
        action: "bug.restore",
        entityType: "bug",
        entityId: request.data?.id,
        transactionId: request.transactionId,
      },
      () => this.applyRestoreBug(request),
    );
  }

  private async applyRestoreBug(
    request: RequestModel<{ id: string; adminId: string }>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data;
    if (!data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Request data is required.",
      );
    }

    if (!data.id) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Bug ID is required.",
      );
    }

    const bugResponse = await this.bugRepository.findById(
      new RequestModel(request.transactionId, data.id),
    );

    if (!bugResponse.data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Local bug not found.",
      );
    }

    if (bugResponse.data.status !== "rejected") {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Only rejected bugs can be restored.",
      );
    }

    return this.bugRepository.restoreBug(
      new RequestModel(request.transactionId, {
        id: data.id,
        adminId: data.adminId,
        logComment: "Bug restored.",
      }),
    );
  }

  public async purgeExpiredRejectedBugs(): Promise<void> {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(
        thresholdDate.getDate() -
          (await this.schedule.getRejectedRetentionDays()),
      );

      const transactionId = "purgeExpiredBugs";
      const expiredResponse = await this.bugRepository.findExpiredRejectedBugs(
        new RequestModel(transactionId, thresholdDate),
      );

      const expiredBugs = expiredResponse.data || [];
      if (expiredBugs.length === 0) return;
      this.logger.info(
        `Found ${expiredBugs.length} expired rejected bugs to purge.`,
      );

      for (const bug of expiredBugs) {
        await this.purge(bug, transactionId);
      }
      this.logger.info("Expired rejected bugs purging complete.");
    } catch (error) {
      this.logger.err(
        `Failed to purge expired rejected bugs: ${errorMessage(error)}`,
      );
    }
  }

  // The bug is marked purged, its stored files deleted, and the purge logged
  private async purge(bug: Bug, transactionId: string): Promise<void> {
    const hasAttachments = await this.purgeAttachments(bug, transactionId);

    await this.bugRepository.updateStatus(
      new RequestModel(transactionId, {
        id: bug.id,
        status: "purged",
        adminId: "",
      }),
    );

    await this.bugRepository.createLog(
      new RequestModel(transactionId, {
        action: "purge",
        comment: hasAttachments
          ? "Bug status changed to purged. Physical attachments deleted due to retention policy."
          : "Bug status changed to purged. No attachments to delete.",
        bugId: bug.id,
      }),
    );
  }

  /** Deletes the stored files of the bug; true when it had some. */
  private async purgeAttachments(
    bug: Bug,
    transactionId: string,
  ): Promise<boolean> {
    let hasAttachments = false;
    const attachments = Array.isArray(bug.attachments) ? bug.attachments : [];
    for (const attachment of attachments) {
      if (!attachment.filePath || attachment.filePath === "/purged") continue;
      hasAttachments = true;
      await this.storageService.deleteFile(attachment.filePath);
      // A stored attachment always has its id; the type allows a new one
      if (attachment.id !== undefined) {
        await this.bugRepository.updateAttachmentPath(
          new RequestModel(transactionId, {
            id: attachment.id,
            filePath: "/purged",
          }),
        );
      }
    }
    return hasAttachments;
  }
}
