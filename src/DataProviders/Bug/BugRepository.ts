import {
  Op,
  QueryTypes,
  type Transaction,
  type WhereAttributeHash,
  type WhereOptions,
} from "sequelize";
import logger from "#src/common/logger.js";
import { Bug, type BugUserRef } from "#src/Domain/Bug/Entity/Bug.js";
import { BugAttachment } from "#src/Domain/Bug/Entity/BugAttachment.js";
import type { BugComponentValue } from "#src/Domain/Bug/Entity/BugComponent.js";
import { BugFilter } from "#src/Domain/Bug/Entity/BugFilter.js";
import { BugNote } from "#src/Domain/Bug/Entity/BugNote.js";
import type { BugPriorityValue } from "#src/Domain/Bug/Entity/BugPriority.js";
import { BugStatusLog } from "#src/Domain/Bug/Entity/BugStatusLog.js";
import type {
  BugStatusUpdate,
  IBugRepository,
} from "#src/Domain/Bug/Repository/IBugRepository.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { INTERNAL_ERROR_MESSAGE } from "#src/Domain/Core/Error/InternalErrorMessage.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "../User/User.js";
import { BugModel } from "./Bug.js";
import { BugAttachmentModel } from "./BugAttachment.js";
import { BugLogModel } from "./BugLog.js";
import { BugNoteModel } from "./BugNote.js";

// Conditions on the bug columns, plus the alternatives of a text search
type BugWhere = WhereAttributeHash & { [Op.or]?: object[] };

/**
 * A bug from its row, with the creator and attachments that the query
 * included; each read adds what it reads besides.
 */
const bugFromRow = (dbBug: BugModel) =>
  Bug.builder()
    .setId(dbBug.id)
    .setTitle(dbBug.title)
    .setDescription(dbBug.description)
    .setPriority(dbBug.priority)
    .setCategory(dbBug.category || undefined)
    .setComponent(dbBug.component || undefined)
    .setStatus(dbBug.status)
    .setGithubRepo(dbBug.githubRepo || undefined)
    .setCreatedById(dbBug.createdById || undefined)
    .setReporterEmail(dbBug.reporterEmail || undefined)
    .setCreatedAt(dbBug.createdAt)
    .setCreatedBy(
      dbBug.createdBy
        ? {
            id: dbBug.createdById || "",
            name: dbBug.createdBy.name,
            email: dbBug.createdBy.email || dbBug.reporterEmail,
          }
        : undefined,
    )
    .setAttachments(dbBug.attachments ?? undefined);

/** Newest first; the id keeps bugs created at the same time on one page. */
const NEWEST_FIRST: [string, string][] = [
  ["createdAt", "DESC"],
  ["id", "DESC"],
];

function pageOf(filter: BugFilter): { limit?: number; offset?: number } {
  if (!filter.pageNumber || !filter.pageSize) return {};
  return {
    limit: filter.pageSize,
    offset: (filter.pageNumber - 1) * filter.pageSize,
  };
}

/** The bugs of the page and, for a page, how many match the filters. */
async function findPage(
  where: WhereOptions,
  filter: BugFilter,
): Promise<{ dbBugs: BugModel[]; totalCount?: number }> {
  const page = pageOf(filter);
  const [dbBugs, totalCount] = await Promise.all([
    BugModel.findAll({
      where,
      include: [
        { model: BugAttachmentModel, as: "attachments" },
        { model: UserModel, as: "createdBy", attributes: ["name", "email"] },
      ],
      order: NEWEST_FIRST,
      ...page,
    }),
    page.limit === undefined ? undefined : BugModel.count({ where }),
  ]);
  return { dbBugs, totalCount: totalCount ?? dbBugs.length };
}

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

export class BugRepositoryImpl implements IBugRepository {
  public async queryBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>> {
    const response = new ResponseModel<Bug[]>(request.transactionId);
    try {
      const filter = request.data || new BugFilter();
      const whereClause: BugWhere = {
        githubRepo: { [Op.ne]: null },
        gitIssueNumber: { [Op.ne]: null },
      };
      if (filter.repo) {
        whereClause.githubRepo = filter.repo;
      } else if (filter.managedRepos && filter.managedRepos.length > 0) {
        whereClause.githubRepo = { [Op.in]: filter.managedRepos };
      }
      if (filter.status) whereClause.status = filter.status;
      if (filter.priority) whereClause.priority = filter.priority;
      if (filter.component) whereClause.component = filter.component;
      if (filter.assigneeId) {
        whereClause.id = {
          [Op.in]: await this.bugIdsAssignedTo(filter.assigneeId),
        };
      }
      if (filter.search) {
        const orConditions: object[] = [
          { title: { [Op.iLike]: `%${filter.search}%` } },
          { description: { [Op.iLike]: `%${filter.search}%` } },
        ];

        const numericSearch = Number(filter.search);
        if (!Number.isNaN(numericSearch)) {
          orConditions.push({ gitIssueNumber: numericSearch });
        }

        whereClause[Op.or] = orConditions;
      }

      const { dbBugs, totalCount } = await findPage(whereClause, filter);
      response.totalCount = totalCount;
      const assignees = await this.assigneesOf(
        dbBugs.map((dbBug) => dbBug.id ?? ""),
      );

      response.data = dbBugs.map((dbBug) => {
        return bugFromRow(dbBug)
          .setGitIssueNumber(dbBug.gitIssueNumber ?? undefined)
          .setGithubCreator(dbBug.githubCreator || undefined)
          .setGithubHtmlUrl(dbBug.githubHtmlUrl || undefined)
          .setGithubAssignee(dbBug.githubAssignee || undefined)
          .setUpdatedAt(dbBug.updatedAt)
          .setAssignedAdmins(assignees.get(dbBug.id ?? "") ?? [])
          .build();
      });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async queryLocalBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>> {
    const response = new ResponseModel<Bug[]>(request.transactionId);
    try {
      const filter = request.data || new BugFilter();
      const whereClause: BugWhere = {
        reporterEmail: { [Op.ne]: null },
      };
      if (filter.status) {
        whereClause.status = filter.status;
      }
      if (filter.priority) {
        whereClause.priority = filter.priority;
      }
      if (filter.component) {
        whereClause.component = filter.component;
      }
      if (filter.repo) {
        whereClause.githubRepo = filter.repo;
      }
      if (filter.search) {
        const orConditions: object[] = [
          { title: { [Op.iLike]: `%${filter.search}%` } },
          { description: { [Op.iLike]: `%${filter.search}%` } },
          { reporterEmail: { [Op.iLike]: `%${filter.search}%` } },
        ];
        whereClause[Op.or] = orConditions;
      }

      const { dbBugs, totalCount } = await findPage(whereClause, filter);
      response.totalCount = totalCount;

      response.data = dbBugs.map((dbBug) => {
        return bugFromRow(dbBug)
          .setGitIssueNumber(dbBug.gitIssueNumber ?? undefined)
          .build();
      });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async findById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<Bug | null>> {
    const response = new ResponseModel<Bug | null>(request.transactionId);
    try {
      const id = request.data;
      if (!id) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Bug ID is required.",
        );
      }
      const dbBug = await BugModel.findByPk(id, {
        include: [
          { model: BugAttachmentModel, as: "attachments" },
          { model: UserModel, as: "createdBy", attributes: ["name", "email"] },
        ],
      });

      if (!dbBug) {
        response.data = null;
        return response;
      }

      const assignees = await this.assigneesOf([id]);
      response.data = bugFromRow(dbBug)
        .setGitIssueNumber(dbBug.gitIssueNumber ?? undefined)
        .setAssignedAdmins(assignees.get(id) ?? [])
        .build();
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

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

  public async rejectBug(
    request: RequestModel<{ id: string; adminId: string; logComment: string }>,
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

        dbBug.status = "rejected";
        await dbBug.save({ transaction: t });

        const resolvedOperatorId = await this.resolveOperatorId(adminId, t);

        await BugLogModel.create(
          {
            action: "reject",
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

  public async restoreBug(
    request: RequestModel<{ id: string; adminId: string; logComment: string }>,
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

        dbBug.status = "pending";
        await dbBug.save({ transaction: t });

        const resolvedOperatorId = await this.resolveOperatorId(adminId, t);

        await BugLogModel.create(
          {
            action: "restore",
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

  public async findExpiredRejectedBugs(
    request: RequestModel<Date>,
  ): Promise<ResponseModel<Bug[]>> {
    const response = new ResponseModel<Bug[]>(request.transactionId);
    try {
      const thresholdDate = request.data;
      if (!thresholdDate) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Threshold date is required.",
        );
      }
      const dbBugs = await BugModel.findAll({
        where: {
          status: "rejected",
          updatedAt: {
            [Op.lt]: thresholdDate,
          },
        },
        include: [{ model: BugAttachmentModel, as: "attachments" }],
      });

      response.data = dbBugs.map((dbBug) => {
        return bugFromRow(dbBug).build();
      });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async updateAttachmentPath(
    request: RequestModel<{ id: number; filePath: string }>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Request data is required.",
        );
      }
      const { id, filePath } = data;
      await BugAttachmentModel.update({ filePath }, { where: { id } });
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

  public async queryHistory(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugStatusLog[]>> {
    const response = new ResponseModel<BugStatusLog[]>(request.transactionId);
    try {
      const bugId = request.data;
      if (!bugId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Bug ID is required.",
        );
      }
      const logs = await BugLogModel.findAll({
        where: { bugId },
        include: [
          {
            model: UserModel,
            as: "changedBy",
            attributes: ["id", "name", "email"],
          },
        ],
        order: [["createdAt", "ASC"]],
      });

      response.data = logs.map((l) => {
        return BugStatusLog.builder()
          .setId(l.id)
          .setStatus(l.action)
          .setComment(l.comment)
          .setChangedAt(l.createdAt)
          .setBugId(l.bugId)
          .setChangedById(l.operatorId || "")
          .setChangedBy(
            l.changedBy
              ? {
                  id: l.changedBy.id ?? "",
                  name: l.changedBy.name,
                  email: l.changedBy.email,
                }
              : undefined,
          )
          .build();
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

        const resolvedOperatorId = await this.resolveOperatorId(adminId, t);

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

  public async createAttachment(
    request: RequestModel<{
      filePath: string;
      fileType: string;
      bugId: string;
    }>,
  ): Promise<ResponseModel<BugAttachment>> {
    const response = new ResponseModel<BugAttachment>(request.transactionId);
    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Attachment data is required.",
        );
      }
      const { filePath, fileType, bugId } = data;
      const attachment = await BugAttachmentModel.create({
        filePath,
        fileType,
        bugId,
      });
      response.data = BugAttachment.builder()
        .setId(attachment.id)
        .setFilePath(attachment.filePath)
        .setFileType(attachment.fileType)
        .setBugId(attachment.bugId)
        .build();
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async deleteAttachment(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const id = request.data;
      if (!id) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Attachment ID is required.",
        );
      }
      await BugAttachmentModel.destroy({ where: { id } });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async findAttachmentById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugAttachment | null>> {
    const response = new ResponseModel<BugAttachment | null>(
      request.transactionId,
    );
    try {
      const id = request.data;
      if (!id) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Attachment ID is required.",
        );
      }
      const attachment = await BugAttachmentModel.findByPk(id);
      response.data = attachment
        ? BugAttachment.builder()
            .setId(attachment.id)
            .setFilePath(attachment.filePath)
            .setFileType(attachment.fileType)
            .setBugId(attachment.bugId)
            .build()
        : null;
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  private async resolveOperatorId(
    adminId?: string,
    transaction?: Transaction,
  ): Promise<string | undefined> {
    if (!adminId) return undefined;
    const userExists = await UserModel.findByPk(adminId, { transaction });
    return userExists ? adminId : undefined;
  }

  public async createNote(
    request: RequestModel<{ bugId: string; body: string; authorId?: string }>,
  ): Promise<ResponseModel<BugNote>> {
    const response = new ResponseModel<BugNote>(request.transactionId);
    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Note data is required.",
        );
      }
      const { bugId, body, authorId } = data;

      // Prevent FK violation by ensuring authorId exists in local user table
      const resolvedAuthorId = authorId
        ? await this.resolveOperatorId(authorId)
        : undefined;

      const dbNote = await BugNoteModel.create({
        bugId,
        body,
        authorId: resolvedAuthorId,
      });

      let authorName = "System";
      if (resolvedAuthorId) {
        const user = await UserModel.findByPk(resolvedAuthorId);
        if (user) authorName = user.name;
      }

      response.data = BugNote.builder()
        .setId(dbNote.id)
        .setBugId(dbNote.bugId)
        .setBody(dbNote.body)
        .setAuthorId(dbNote.authorId || "")
        .setAuthor({ name: authorName })
        .setCreatedAt(dbNote.createdAt)
        .build();
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async queryNotes(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugNote[]>> {
    const response = new ResponseModel<BugNote[]>(request.transactionId);
    try {
      const bugId = request.data;
      if (!bugId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Bug ID is required.",
        );
      }
      const dbNotes = await BugNoteModel.findAll({
        where: { bugId },
        include: [{ model: UserModel, as: "author", attributes: ["name"] }],
        order: [["createdAt", "ASC"]],
      });

      response.data = dbNotes.map((dbNote) => {
        return BugNote.builder()
          .setId(dbNote.id)
          .setBugId(dbNote.bugId)
          .setBody(dbNote.body)
          .setAuthorId(dbNote.authorId || "")
          .setAuthor({ name: dbNote.author?.name || "System" })
          .setCreatedAt(dbNote.createdAt)
          .build();
      });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async setAssignees(
    request: RequestModel<{
      bugId: string;
      userIds: string[];
      assignedBy?: string;
    }>,
  ): Promise<ResponseModel<BugUserRef[]>> {
    const response = new ResponseModel<BugUserRef[]>(request.transactionId);
    try {
      const data = request.data;
      if (!data?.bugId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Bug ID is required.",
        );
      }
      const { bugId, userIds, assignedBy } = data;
      await VARIAMOS_ORM.transaction(async (transaction) => {
        await VARIAMOS_ORM.query(
          userIds.length > 0
            ? `DELETE FROM ${DB_SCHEMA}.bug_assignees
                WHERE bug_id = :bugId AND user_id NOT IN (:userIds)`
            : `DELETE FROM ${DB_SCHEMA}.bug_assignees WHERE bug_id = :bugId`,
          { replacements: { bugId, userIds }, transaction },
        );
        for (const userId of userIds) {
          await VARIAMOS_ORM.query(
            `INSERT INTO ${DB_SCHEMA}.bug_assignees (bug_id, user_id, assigned_by)
             VALUES (:bugId, :userId, :assignedBy)
             ON CONFLICT (bug_id, user_id) DO NOTHING`,
            {
              replacements: { bugId, userId, assignedBy: assignedBy ?? null },
              transaction,
            },
          );
        }
      });
      response.data = (await this.assigneesOf([bugId])).get(bugId) ?? [];
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async queryUsersWithPermission(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugUserRef[]>> {
    const response = new ResponseModel<BugUserRef[]>(request.transactionId);
    try {
      response.data = await VARIAMOS_ORM.query<BugUserRef>(
        `SELECT DISTINCT u.id, u.name
           FROM ${DB_SCHEMA}.user u
           JOIN ${DB_SCHEMA}.user_role ur ON ur.user_id = u.id
           JOIN ${DB_SCHEMA}.role_permission rp ON rp.role_id = ur.role_id
           JOIN ${DB_SCHEMA}.permission p ON p.id = rp.permission_id
          WHERE p.name = :permission AND u.is_enabled AND NOT u.is_deleted
          ORDER BY u.name`,
        {
          replacements: { permission: request.data ?? "" },
          type: QueryTypes.SELECT,
        },
      );
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  // Assignees by bug: id and name only, the list is shown to administrators
  private async assigneesOf(
    bugIds: string[],
  ): Promise<Map<string, BugUserRef[]>> {
    const byBug = new Map<string, BugUserRef[]>();
    if (bugIds.length === 0) return byBug;
    const rows = await VARIAMOS_ORM.query<{
      bugId: string;
      id: string;
      name: string;
    }>(
      `SELECT ba.bug_id AS "bugId", u.id, u.name
         FROM ${DB_SCHEMA}.bug_assignees ba
         JOIN ${DB_SCHEMA}.user u ON u.id = ba.user_id
        WHERE ba.bug_id IN (:bugIds)
        ORDER BY u.name`,
      { replacements: { bugIds }, type: QueryTypes.SELECT },
    );
    for (const { bugId, id, name } of rows) {
      byBug.set(bugId, [...(byBug.get(bugId) ?? []), { id, name }]);
    }
    return byBug;
  }

  private async bugIdsAssignedTo(userId: string): Promise<string[]> {
    const rows = await VARIAMOS_ORM.query<{ bugId: string }>(
      `SELECT bug_id AS "bugId" FROM ${DB_SCHEMA}.bug_assignees
        WHERE user_id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT },
    );
    return rows.map((row) => row.bugId);
  }
}
