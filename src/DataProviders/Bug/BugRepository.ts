import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Bug } from "@src/Domain/Bug/Entity/Bug";
import { BugStatusLog } from "@src/Domain/Bug/Entity/BugStatusLog";
import { BugFilter } from "@src/Domain/Bug/Entity/BugFilter";
import { BugModel } from "./Bug";
import { BugAttachmentModel } from "./BugAttachment";
import { BugLogModel } from "./BugLog";
import { BugNoteModel } from "./BugNote";
import { UserModel } from "../User/User";
import { Op } from "sequelize";
import logger from "jet-logger";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM";
import { BugNote } from "@src/Domain/Bug/Entity/BugNote";

export class BugRepositoryImpl implements IBugRepository {
  async queryBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>> {
    const response = new ResponseModel<Bug[]>(request.transactionId);
    try {
      const filter = request.data || new BugFilter();
      const whereClause: any = {
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
      if (filter.search) {
        const orConditions: any[] = [
          { title: { [Op.iLike]: `%${filter.search}%` } },
          { description: { [Op.iLike]: `%${filter.search}%` } },
        ];

        const numericSearch = Number(filter.search);
        if (!isNaN(numericSearch)) {
          orConditions.push({ gitIssueNumber: numericSearch });
        }

        whereClause[Op.or] = orConditions;
      }

      const dbBugs = await BugModel.findAll({
        where: whereClause,
        include: [
          { model: BugAttachmentModel, as: "attachments" },
          { model: UserModel, as: "createdBy", attributes: ["name", "email"] },
        ],
        order: [["createdAt", "DESC"]],
      });

      response.data = dbBugs.map((dbBug) =>
        Bug.builder()
          .setId(dbBug.id)
          .setTitle(dbBug.title)
          .setDescription(dbBug.description)
          .setPriority(dbBug.priority)
          .setCategory(dbBug.category || undefined)
          .setStatus(dbBug.status)
          .setGithubRepo(dbBug.githubRepo || undefined)
          .setGitIssueNumber(dbBug.gitIssueNumber || undefined)
          .setGithubCreator(dbBug.githubCreator || undefined)
          .setGithubHtmlUrl(dbBug.githubHtmlUrl || undefined)
          .setGithubAssignee(dbBug.githubAssignee || undefined)
          .setCreatedById(dbBug.createdById || undefined)
          .setReporterEmail(dbBug.reporterEmail || undefined)
          .setCreatedAt(dbBug.createdAt)
          .setUpdatedAt(dbBug.updatedAt)
          .setCreatedBy(
            (dbBug as any).createdBy
              ? {
                  id: dbBug.createdById || "",
                  name: (dbBug as any).createdBy.name,
                  email: (dbBug as any).createdBy.email || dbBug.reporterEmail,
                }
              : undefined,
          )
          .setAttachments((dbBug as any).attachments)
          .build(),
      );
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async queryLocalBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>> {
    const response = new ResponseModel<Bug[]>(request.transactionId);
    try {
      const filter = request.data || new BugFilter();
      const whereClause: any = {
        reporterEmail: { [Op.ne]: null },
      };
      if (filter.status) {
        whereClause.status = filter.status;
      }
      if (filter.priority) {
        whereClause.priority = filter.priority;
      }
      if (filter.repo) {
        whereClause.githubRepo = filter.repo;
      }
      if (filter.search) {
        const orConditions: any[] = [
          { title: { [Op.iLike]: `%${filter.search}%` } },
          { description: { [Op.iLike]: `%${filter.search}%` } },
          { reporterEmail: { [Op.iLike]: `%${filter.search}%` } },
        ];
        whereClause[Op.or] = orConditions;
      }

      const dbBugs = await BugModel.findAll({
        where: whereClause,
        include: [
          { model: BugAttachmentModel, as: "attachments" },
          { model: UserModel, as: "createdBy", attributes: ["name", "email"] },
        ],
        order: [["createdAt", "DESC"]],
      });

      response.data = dbBugs.map((dbBug) => {
        return Bug.builder()
          .setId(dbBug.id)
          .setTitle(dbBug.title)
          .setDescription(dbBug.description)
          .setPriority(dbBug.priority)
          .setCategory(dbBug.category || undefined)
          .setStatus(dbBug.status)
          .setGithubRepo(dbBug.githubRepo || undefined)
          .setGitIssueNumber(dbBug.gitIssueNumber || undefined)
          .setCreatedById(dbBug.createdById || undefined)
          .setReporterEmail(dbBug.reporterEmail || undefined)
          .setCreatedAt(dbBug.createdAt)
          .setCreatedBy(
            (dbBug as any).createdBy
              ? {
                  id: dbBug.createdById || "",
                  name: (dbBug as any).createdBy.name,
                  email: (dbBug as any).createdBy.email || dbBug.reporterEmail,
                }
              : undefined,
          )
          .setAttachments((dbBug as any).attachments)
          .build();
      });
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async findById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<Bug | null>> {
    const response = new ResponseModel<Bug | null>(request.transactionId);
    try {
      const id = request.data!;
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

      response.data = Bug.builder()
        .setId(dbBug.id)
        .setTitle(dbBug.title)
        .setDescription(dbBug.description)
        .setPriority(dbBug.priority)
        .setCategory(dbBug.category || undefined)
        .setStatus(dbBug.status)
        .setGithubRepo(dbBug.githubRepo || undefined)
        .setGitIssueNumber(dbBug.gitIssueNumber || undefined)
        .setCreatedById(dbBug.createdById || undefined)
        .setReporterEmail(dbBug.reporterEmail || undefined)
        .setCreatedAt(dbBug.createdAt)
        .setCreatedBy(
          (dbBug as any).createdBy
            ? {
                id: dbBug.createdById || "",
                name: (dbBug as any).createdBy.name,
                email: (dbBug as any).createdBy.email || dbBug.reporterEmail,
              }
            : undefined,
        )
        .setAttachments((dbBug as any).attachments)
        .build();
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async saveOrUpdateBug(
    request: RequestModel<Bug>,
  ): Promise<ResponseModel<{ created: boolean; updated: boolean }>> {
    const response = new ResponseModel<{ created: boolean; updated: boolean }>(
      request.transactionId,
    );
    try {
      const bug = request.data!;
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
        });
        response.data = { created: true, updated: false };
      } else {
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
        if (
          dbBug.githubCreatedAt?.toISOString() !== bug.createdAt?.toISOString()
        ) {
          dbBug.githubCreatedAt = bug.createdAt;
          changed = true;
        }

        if (changed) {
          await dbBug.save();
          response.data = { created: false, updated: true };
        } else {
          response.data = { created: false, updated: false };
        }
      }
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async rejectBug(
    request: RequestModel<{ id: string; adminId: string; logComment: string }>,
  ): Promise<ResponseModel<Bug>> {
    const response = new ResponseModel<Bug>(request.transactionId);
    try {
      const { id, adminId, logComment } = request.data!;
      await VARIAMOS_ORM.transaction(async (t) => {
        const dbBug = await BugModel.findByPk(id, { transaction: t });

        if (!dbBug) {
          response.withError(HttpStatusCodes.NOT_FOUND, "Local bug not found");
          return;
        }

        dbBug.status = "rejected";
        await dbBug.save({ transaction: t });

        const resolvedOperatorId = await this.resolveOperatorId(adminId, t);

        await BugLogModel.create(
          {
            action: "reject",
            comment: logComment,
            bugId: dbBug.id!,
            operatorId: resolvedOperatorId,
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
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async restoreBug(
    request: RequestModel<{ id: string; adminId: string; logComment: string }>,
  ): Promise<ResponseModel<Bug>> {
    const response = new ResponseModel<Bug>(request.transactionId);
    try {
      const { id, adminId, logComment } = request.data!;
      await VARIAMOS_ORM.transaction(async (t) => {
        const dbBug = await BugModel.findByPk(id, { transaction: t });

        if (!dbBug) {
          response.withError(HttpStatusCodes.NOT_FOUND, "Local bug not found");
          return;
        }

        dbBug.status = "pending";
        await dbBug.save({ transaction: t });

        const resolvedOperatorId = await this.resolveOperatorId(adminId, t);

        await BugLogModel.create(
          {
            action: "restore",
            comment: logComment,
            bugId: dbBug.id!,
            operatorId: resolvedOperatorId,
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
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async findExpiredRejectedBugs(
    request: RequestModel<Date>,
  ): Promise<ResponseModel<Bug[]>> {
    const response = new ResponseModel<Bug[]>(request.transactionId);
    try {
      const thresholdDate = request.data!;
      const dbBugs = await BugModel.findAll({
        where: {
          status: "rejected",
          updatedAt: {
            [Op.lt]: thresholdDate,
          },
        },
        include: [{ model: BugAttachmentModel, as: "attachments" }],
      });

      response.data = dbBugs.map((dbBug) =>
        Bug.builder()
          .setId(dbBug.id)
          .setTitle(dbBug.title)
          .setDescription(dbBug.description)
          .setPriority(dbBug.priority)
          .setCategory(dbBug.category || undefined)
          .setStatus(dbBug.status)
          .setGithubRepo(dbBug.githubRepo || undefined)
          .setCreatedById(dbBug.createdById || undefined)
          .setReporterEmail(dbBug.reporterEmail || undefined)
          .setCreatedAt(dbBug.createdAt)
          .setAttachments((dbBug as any).attachments)
          .build(),
      );
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async updateAttachmentPath(
    request: RequestModel<{ id: number; filePath: string }>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const { id, filePath } = request.data!;
      await BugAttachmentModel.update({ filePath }, { where: { id } });
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async createLog(
    request: RequestModel<{
      action: string;
      comment: string;
      bugId: string;
      operatorId?: string;
    }>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const { action, comment, bugId, operatorId } = request.data!;
      await BugLogModel.create({
        action,
        comment,
        bugId,
        operatorId,
      });
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async createBug(
    request: RequestModel<{
      title: string;
      description: string;
      priority: "low" | "medium" | "high";
      category: string;
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
      const {
        title,
        description,
        priority,
        category,
        githubRepo,
        createdById,
        resolvedFile,
        reporterEmail,
        status,
        logComment,
        gitIssueNumber,
        githubHtmlUrl,
      } = request.data!;

      await VARIAMOS_ORM.transaction(async (t) => {
        const dbBug = await BugModel.create(
          {
            title,
            description,
            priority,
            category,
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
              bugId: dbBug.id!,
            },
            { transaction: t },
          );
        }

        await BugLogModel.create(
          {
            action: "create",
            comment: logComment,
            bugId: dbBug.id!,
            operatorId: createdById,
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

        response.data = Bug.builder()
          .setId(freshBug!.id)
          .setTitle(freshBug!.title)
          .setDescription(freshBug!.description)
          .setPriority(freshBug!.priority)
          .setCategory(freshBug!.category || undefined)
          .setStatus(freshBug!.status)
          .setGithubRepo(freshBug!.githubRepo || undefined)
          .setCreatedById(freshBug!.createdById || undefined)
          .setReporterEmail(freshBug!.reporterEmail || undefined)
          .setCreatedAt(freshBug!.createdAt)
          .setCreatedBy(
            (freshBug as any).createdBy
              ? {
                  id: freshBug!.createdById || "",
                  name: (freshBug as any).createdBy.name,
                  email:
                    (freshBug as any).createdBy.email ||
                    freshBug!.reporterEmail,
                }
              : undefined,
          )
          .setAttachments((freshBug as any).attachments)
          .build();
      });
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async queryHistory(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugStatusLog[]>> {
    const response = new ResponseModel<BugStatusLog[]>(request.transactionId);
    try {
      const bugId = request.data!;
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

      response.data = logs.map((l) =>
        BugStatusLog.builder()
          .setId(l.id)
          .setStatus(l.action)
          .setComment(l.comment)
          .setChangedAt(l.createdAt)
          .setBugId(l.bugId)
          .setChangedById(l.operatorId || "")
          .setChangedBy((l as any).changedBy)
          .build(),
      );
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async updateStatus(
    request: RequestModel<{
      id: string;
      status: string;
      comment?: string;
      adminId: string;
      gitIssueNumber?: number;
      githubHtmlUrl?: string;
      title?: string;
      description?: string;
      priority?: "low" | "medium" | "high";
      category?: string;
      githubRepo?: string;
    }>,
  ): Promise<ResponseModel<Bug>> {
    const response = new ResponseModel<Bug>(request.transactionId);
    try {
      const {
        id,
        status,
        comment,
        adminId,
        gitIssueNumber,
        githubHtmlUrl,
        title,
        description,
        priority,
        category,
        githubRepo,
      } = request.data!;
      await VARIAMOS_ORM.transaction(async (t) => {
        const dbBug = await BugModel.findByPk(id, { transaction: t });
        if (!dbBug) {
          response.withError(HttpStatusCodes.NOT_FOUND, "Bug not found");
          return;
        }

        dbBug.status = status;
        if (gitIssueNumber !== undefined) {
          dbBug.gitIssueNumber = gitIssueNumber;
        }
        if (githubHtmlUrl !== undefined) {
          dbBug.githubHtmlUrl = githubHtmlUrl;
        }
        if (title !== undefined) {
          dbBug.title = title;
        }
        if (description !== undefined) {
          dbBug.description = description;
        }
        if (priority !== undefined) {
          dbBug.priority = priority;
        }
        if (category !== undefined) {
          dbBug.category = category;
        }
        if (githubRepo !== undefined) {
          dbBug.githubRepo = githubRepo;
        }
        await dbBug.save({ transaction: t });

        const resolvedOperatorId = await this.resolveOperatorId(adminId, t);

        await BugLogModel.create(
          {
            action: status,
            comment,
            bugId: dbBug.id!,
            operatorId: resolvedOperatorId,
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
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async createAttachment(
    request: RequestModel<{
      filePath: string;
      fileType: string;
      bugId: string;
    }>,
  ): Promise<ResponseModel<any>> {
    const response = new ResponseModel<any>(request.transactionId);
    try {
      const { filePath, fileType, bugId } = request.data!;
      const attachment = await BugAttachmentModel.create({
        filePath,
        fileType,
        bugId,
      });
      response.data = attachment;
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async deleteAttachment(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const id = request.data!;
      await BugAttachmentModel.destroy({ where: { id } });
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async findAttachmentById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<any | null>> {
    const response = new ResponseModel<any | null>(request.transactionId);
    try {
      const id = request.data!;
      const attachment = await BugAttachmentModel.findByPk(id);
      response.data = attachment || null;
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  private async resolveOperatorId(
    adminId?: string,
    transaction?: any,
  ): Promise<string | undefined> {
    if (!adminId) return undefined;
    const userExists = await UserModel.findByPk(adminId, { transaction });
    return userExists ? adminId : undefined;
  }

  async createNote(
    request: RequestModel<{ bugId: string; body: string; authorId?: string }>,
  ): Promise<ResponseModel<BugNote>> {
    const response = new ResponseModel<BugNote>(request.transactionId);
    try {
      const { bugId, body, authorId } = request.data!;

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
    } catch (error: any) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }

  async queryNotes(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugNote[]>> {
    const response = new ResponseModel<BugNote[]>(request.transactionId);
    try {
      const bugId = request.data!;
      const dbNotes = await BugNoteModel.findAll({
        where: { bugId },
        include: [{ model: UserModel, as: "author", attributes: ["name"] }],
        order: [["createdAt", "ASC"]],
      });

      response.data = dbNotes.map((dbNote) =>
        BugNote.builder()
          .setId(dbNote.id)
          .setBugId(dbNote.bugId)
          .setBody(dbNote.body)
          .setAuthorId(dbNote.authorId || "")
          .setAuthor({ name: (dbNote as any).author?.name || "System" })
          .setCreatedAt(dbNote.createdAt)
          .build(),
      );
    } catch (error: any) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }
}

export const BugRepositoryInstance = new BugRepositoryImpl();
