import logger from "#src/common/logger.js";
import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import type { BugComponentValue } from "#src/Domain/Bug/Entity/BugComponent.js";
import type { BugPriorityValue } from "#src/Domain/Bug/Entity/BugPriority.js";
import type {
  BugStatusUpdate,
  IBugRepository,
} from "#src/Domain/Bug/Repository/IBugRepository.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { INTERNAL_ERROR_MESSAGE } from "#src/Domain/Core/Error/InternalErrorMessage.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "../User/User.js";
import { BugModel } from "./Bug.js";
import { BugAttachmentModel } from "./BugAttachment.js";
import { BugLogModel } from "./BugLog.js";
import { bugFromRow, resolveOperatorId } from "./bugRows.js";

/**
 * Copies what GitHub owns onto the saved bug (title, text, status, priority,
 * author, link, assignee, creation date); true when one of them changed.
 */
function copyGitHubFields(dbBug: BugModel, bug: Bug): boolean {
  let changed = false;
  if (dbBug.title !== bug.title) {
    dbBug.title = bug.title;
    changed = true;
  }
  if (dbBug.description !== bug.description) {
    dbBug.description = bug.description;
    changed = true;
  }
  if (dbBug.status !== bug.status) {
    dbBug.status = bug.status;
    changed = true;
  }
  if (dbBug.priority !== bug.priority) {
    dbBug.priority = bug.priority;
    changed = true;
  }
  if (dbBug.githubCreator !== bug.githubCreator) {
    dbBug.githubCreator = bug.githubCreator;
    changed = true;
  }
  if (dbBug.githubHtmlUrl !== bug.githubHtmlUrl) {
    dbBug.githubHtmlUrl = bug.githubHtmlUrl;
    changed = true;
  }
  if (dbBug.githubAssignee !== bug.githubAssignee) {
    dbBug.githubAssignee = bug.githubAssignee;
    changed = true;
  }
  if (dbBug.githubCreatedAt?.toISOString() !== bug.createdAt?.toISOString()) {
    dbBug.githubCreatedAt = bug.createdAt;
    changed = true;
  }

  return changed;
}

// The new status, and each corrected field that the update gives
function applyStatusUpdate(dbBug: BugModel, update: BugStatusUpdate): void {
  dbBug.status = update.status;
  if (update.gitIssueNumber !== undefined) {
    dbBug.gitIssueNumber = update.gitIssueNumber;
  }
  if (update.githubHtmlUrl !== undefined) {
    dbBug.githubHtmlUrl = update.githubHtmlUrl;
  }
  if (update.title !== undefined) dbBug.title = update.title;
  if (update.description !== undefined) {
    dbBug.description = update.description;
  }
  if (update.priority !== undefined) dbBug.priority = update.priority;
  if (update.category !== undefined) dbBug.category = update.category;
  if (update.component !== undefined) dbBug.component = update.component;
  if (update.githubRepo !== undefined) dbBug.githubRepo = update.githubRepo;
}

/** Writes bugs: creation, synchronization, status changes and their log. */
export class BugRepositoryImpl implements IBugRepository {
  public async saveOrUpdateBug(
    request: RequestModel<Bug>,
  ): Promise<ResponseModel<{ created: boolean; updated: boolean }>> {
    const response = new ResponseModel<{ created: boolean; updated: boolean }>(
      request.transactionId,
    );
    try {
      const bug = request.data;
      if (!bug) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Bug data is required.",
        );
      }
      const dbBug = await BugModel.findOne({
        where: {
          githubRepo: bug.githubRepo,
          gitIssueNumber: bug.gitIssueNumber,
        },
      });

      if (!dbBug) {
        await BugModel.create({
          id: bug.id,
          title: bug.title,
          description: bug.description,
          priority: bug.priority,
          status: bug.status,
          githubRepo: bug.githubRepo,
          gitIssueNumber: bug.gitIssueNumber,
          githubCreator: bug.githubCreator,
          githubHtmlUrl: bug.githubHtmlUrl,
          githubAssignee: bug.githubAssignee,
          githubCreatedAt: bug.createdAt,
          createdAt: bug.createdAt,
          updatedAt: bug.updatedAt,
          createdById: bug.createdById || undefined,
          reporterEmail: bug.reporterEmail || undefined,
        });
        response.data = { created: true, updated: false };
      } else {
        const changed = copyGitHubFields(dbBug, bug);
        if (changed) {
          await dbBug.save();
          response.data = { created: false, updated: true };
        } else {
          response.data = { created: false, updated: false };
        }
      }
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public rejectBug(
    request: RequestModel<{ id: string; adminId: string; logComment: string }>,
  ): Promise<ResponseModel<Bug>> {
    return this.moveBugTo(request, "rejected", "reject");
  }

  public restoreBug(
    request: RequestModel<{ id: string; adminId: string; logComment: string }>,
  ): Promise<ResponseModel<Bug>> {
    return this.moveBugTo(request, "pending", "restore");
  }

  /** Sets the bug's status and logs the action, in one transaction. */
  private async moveBugTo(
    request: RequestModel<{ id: string; adminId: string; logComment: string }>,
    status: string,
    action: string,
  ): Promise<ResponseModel<Bug>> {
    const response = new ResponseModel<Bug>(request.transactionId);
    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Request data is required.",
        );
      }
      const { id, adminId, logComment } = data;
      await VARIAMOS_ORM.transaction(async (t) => {
        const dbBug = await BugModel.findByPk(id, { transaction: t });

        if (!dbBug) {
          response.withError(
            DomainErrorCodes.ENTITY_NOT_FOUND,
            "Local bug not found",
          );
          return;
        }

        dbBug.status = status;
        await dbBug.save({ transaction: t });

        const resolvedOperatorId = await resolveOperatorId(adminId, t);

        await BugLogModel.create(
          {
            action,
            comment: logComment,
            bugId: dbBug.id ?? "",
            operatorId: resolvedOperatorId || "",
          },
          { transaction: t },
        );

        response.data = Bug.builder()
          .setId(dbBug.id)
          .setStatus(dbBug.status)
          .build();
      });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async createLog(
    request: RequestModel<{
      action: string;
      comment: string;
      bugId: string;
      operatorId?: string;
    }>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Log data is required.",
        );
      }
      const { action, comment, bugId, operatorId } = data;
      await BugLogModel.create({
        action,
        comment,
        bugId,
        operatorId: operatorId || undefined,
      });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async createBug(
    request: RequestModel<{
      title: string;
      description: string;
      priority: BugPriorityValue;
      category: string;
      component?: BugComponentValue;
      githubRepo?: string;
      createdById: string;
      resolvedFile?: { filePath: string; fileType: string };
      reporterEmail: string;
      status: string;
      logComment: string;
      gitIssueNumber?: number;
      githubHtmlUrl?: string;
    }>,
  ): Promise<ResponseModel<Bug>> {
    const response = new ResponseModel<Bug>(request.transactionId);
    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Request data is required.",
        );
      }
      const {
        title,
        description,
        priority,
        category,
        component,
        githubRepo,
        createdById,
        resolvedFile,
        reporterEmail,
        status,
        logComment,
        gitIssueNumber,
        githubHtmlUrl,
      } = data;

      await VARIAMOS_ORM.transaction(async (t) => {
        const dbBug = await BugModel.create(
          {
            title,
            description,
            priority,
            category,
            component,
            status,
            githubRepo,
            reporterEmail,
            createdById: createdById || undefined,
            gitIssueNumber,
            githubHtmlUrl,
          },
          { transaction: t },
        );

        if (resolvedFile) {
          await BugAttachmentModel.create(
            {
              filePath: resolvedFile.filePath,
              fileType: resolvedFile.fileType,
              bugId: dbBug.id ?? "",
            },
            { transaction: t },
          );
        }

        await BugLogModel.create(
          {
            action: "create",
            comment: logComment,
            bugId: dbBug.id ?? "",
            operatorId: createdById || undefined,
          },
          { transaction: t },
        );

        const freshBug = await BugModel.findByPk(dbBug.id, {
          include: [
            { model: BugAttachmentModel, as: "attachments" },
            {
              model: UserModel,
              as: "createdBy",
              attributes: ["name", "email"],
            },
          ],
          transaction: t,
        });
        // Created just above, in the same transaction
        if (!freshBug)
          throw new Error("The created bug could not be read back.");

        response.data = bugFromRow(freshBug).build();
      });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async updateStatus(
    request: RequestModel<BugStatusUpdate>,
  ): Promise<ResponseModel<Bug>> {
    const response = new ResponseModel<Bug>(request.transactionId);
    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Request data is required.",
        );
      }
      const { id, status, comment, adminId } = data;
      await VARIAMOS_ORM.transaction(async (t) => {
        const dbBug = await BugModel.findByPk(id, { transaction: t });
        if (!dbBug) {
          response.withError(
            DomainErrorCodes.ENTITY_NOT_FOUND,
            "Bug not found",
          );
          return;
        }

        applyStatusUpdate(dbBug, data);
        await dbBug.save({ transaction: t });

        const resolvedOperatorId = await resolveOperatorId(adminId, t);

        await BugLogModel.create(
          {
            action: status,
            comment,
            bugId: dbBug.id ?? "",
            operatorId: resolvedOperatorId || "",
          },
          { transaction: t },
        );

        response.data = Bug.builder()
          .setId(dbBug.id)
          .setStatus(dbBug.status)
          .build();
      });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }
}
