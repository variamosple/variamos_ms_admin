import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Bug } from "@src/Domain/Bug/Entity/Bug";
import { BugStatusLog } from "@src/Domain/Bug/Entity/BugStatusLog";
import { BugFilter } from "@src/Domain/Bug/Entity/BugFilter";
import { LocalBugModel } from "./LocalBug";
import { LocalBugAttachmentModel } from "./LocalBugAttachment";
import { LocalBugLogModel } from "./LocalBugLog";
import { UserModel } from "../User/User";
import { Op } from "sequelize";
import logger from "jet-logger";
import { ILocalBugRepository } from "@src/Domain/Bug/Repository/ILocalBugRepository";

export class LocalBugRepositoryImpl implements ILocalBugRepository {
  async queryLocalBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>> {
    const response = new ResponseModel<Bug[]>(request.transactionId);
    try {
      const filter = request.data || new BugFilter();
      const whereClause: any = {};
      if (filter.status) {
        whereClause.status = filter.status;
      }

      const dbBugs = await LocalBugModel.findAll({
        where: whereClause,
        include: [
          { model: LocalBugAttachmentModel, as: "attachments" },
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
          .setCategory(dbBug.category)
          .setStatus(dbBug.status)
          .setGithubRepo(dbBug.githubRepo || undefined)
          .setCreatedById(dbBug.createdById || undefined)
          .setReporterEmail(dbBug.reporterEmail)
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
      const dbBug = await LocalBugModel.findByPk(id, {
        include: [
          { model: LocalBugAttachmentModel, as: "attachments" },
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
        .setCategory(dbBug.category)
        .setStatus(dbBug.status)
        .setGithubRepo(dbBug.githubRepo || undefined)
        .setCreatedById(dbBug.createdById || undefined)
        .setReporterEmail(dbBug.reporterEmail)
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

  async rejectBug(
    request: RequestModel<{ id: string; adminId: string; logComment: string }>,
  ): Promise<ResponseModel<Bug>> {
    const response = new ResponseModel<Bug>(request.transactionId);
    try {
      const { id, adminId, logComment } = request.data!;
      const dbBug = await LocalBugModel.findByPk(id);

      if (!dbBug) {
        return response.withError(
          HttpStatusCodes.NOT_FOUND,
          "Local bug not found",
        );
      }

      // Update status to rejected
      dbBug.status = "rejected";
      await dbBug.save();

      // Log action
      await LocalBugLogModel.create({
        action: "reject",
        comment: logComment,
        localBugId: dbBug.id!,
        operatorId: adminId,
      });

      response.data = Bug.builder()
        .setId(dbBug.id)
        .setStatus(dbBug.status)
        .build();
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
      const dbBug = await LocalBugModel.findByPk(id);

      if (!dbBug) {
        return response.withError(
          HttpStatusCodes.NOT_FOUND,
          "Local bug not found",
        );
      }

      // Restore status to pending
      dbBug.status = "pending";
      await dbBug.save();

      // Log action
      await LocalBugLogModel.create({
        action: "restore",
        comment: logComment,
        localBugId: dbBug.id!,
        operatorId: adminId,
      });

      response.data = Bug.builder()
        .setId(dbBug.id)
        .setStatus(dbBug.status)
        .build();
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
      const dbBugs = await LocalBugModel.findAll({
        where: {
          status: "rejected",
          updatedAt: {
            [Op.lt]: thresholdDate,
          },
        },
        include: [{ model: LocalBugAttachmentModel, as: "attachments" }],
      });

      response.data = dbBugs.map((dbBug) =>
        Bug.builder()
          .setId(dbBug.id)
          .setTitle(dbBug.title)
          .setDescription(dbBug.description)
          .setPriority(dbBug.priority)
          .setCategory(dbBug.category)
          .setStatus(dbBug.status)
          .setGithubRepo(dbBug.githubRepo)
          .setCreatedById(dbBug.createdById)
          .setReporterEmail(dbBug.reporterEmail)
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
      await LocalBugAttachmentModel.update({ filePath }, { where: { id } });
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
      localBugId: string;
      operatorId?: string;
    }>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const { action, comment, localBugId, operatorId } = request.data!;
      await LocalBugLogModel.create({
        action,
        comment,
        localBugId,
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
      } = request.data!;

      const dbBug = await LocalBugModel.create({
        title,
        description,
        priority,
        category,
        status,
        githubRepo,
        reporterEmail,
        createdById: createdById || undefined,
      });

      if (resolvedFile) {
        await LocalBugAttachmentModel.create({
          filePath: resolvedFile.filePath,
          fileType: resolvedFile.fileType,
          localBugId: dbBug.id!,
        });
      }

      await LocalBugLogModel.create({
        action: "create",
        comment: logComment,
        localBugId: dbBug.id!,
        operatorId: createdById,
      });

      const freshBug = await LocalBugModel.findByPk(dbBug.id!, {
        include: [
          { model: LocalBugAttachmentModel, as: "attachments" },
          { model: UserModel, as: "createdBy", attributes: ["name", "email"] },
        ],
      });

      response.data = Bug.builder()
        .setId(freshBug!.id)
        .setTitle(freshBug!.title)
        .setDescription(freshBug!.description)
        .setPriority(freshBug!.priority)
        .setCategory(freshBug!.category)
        .setStatus(freshBug!.status)
        .setGithubRepo(freshBug!.githubRepo || undefined)
        .setCreatedById(freshBug!.createdById || undefined)
        .setReporterEmail(freshBug!.reporterEmail)
        .setCreatedAt(freshBug!.createdAt)
        .setCreatedBy(
          (freshBug as any).createdBy
            ? {
                id: freshBug!.createdById || "",
                name: (freshBug as any).createdBy.name,
                email:
                  (freshBug as any).createdBy.email || freshBug!.reporterEmail,
              }
            : undefined,
        )
        .setAttachments((freshBug as any).attachments)
        .build();
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
      const localBugId = request.data!;
      const logs = await LocalBugLogModel.findAll({
        where: { localBugId },
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
          .setBugId(l.localBugId)
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
    }>,
  ): Promise<ResponseModel<Bug>> {
    const response = new ResponseModel<Bug>(request.transactionId);
    try {
      const { id, status, comment, adminId } = request.data!;
      const dbBug = await LocalBugModel.findByPk(id);
      if (!dbBug) {
        return response.withError(HttpStatusCodes.NOT_FOUND, "Bug not found");
      }

      dbBug.status = status;
      await dbBug.save();

      await LocalBugLogModel.create({
        action: status,
        comment,
        localBugId: dbBug.id!,
        operatorId: adminId,
      });

      response.data = Bug.builder()
        .setId(dbBug.id)
        .setStatus(dbBug.status)
        .build();
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }
}

export const LocalBugRepositoryInstance = new LocalBugRepositoryImpl();
