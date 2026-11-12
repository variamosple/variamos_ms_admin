import { Op } from "sequelize";
import logger from "#src/common/logger.js";
import type { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import { BugFilter } from "#src/Domain/Bug/Entity/BugFilter.js";
import { BugStatusLog } from "#src/Domain/Bug/Entity/BugStatusLog.js";
import type { IBugQueryRepository } from "#src/Domain/Bug/Repository/IBugQueryRepository.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { INTERNAL_ERROR_MESSAGE } from "#src/Domain/Core/Error/InternalErrorMessage.js";
import { UserModel } from "../User/User.js";
import { BugModel } from "./Bug.js";
import { BugAttachmentModel } from "./BugAttachment.js";
import { BugLogModel } from "./BugLog.js";
import {
  assigneesOf,
  type BugWhere,
  bugFromRow,
  bugIdsAssignedTo,
  findPage,
} from "./bugRows.js";

/** Reads bugs and their status history. */
export class BugQueryRepositoryImpl implements IBugQueryRepository {
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
          [Op.in]: await bugIdsAssignedTo(filter.assigneeId),
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
      const assignees = await assigneesOf(
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

      const assignees = await assigneesOf([id]);
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
}
