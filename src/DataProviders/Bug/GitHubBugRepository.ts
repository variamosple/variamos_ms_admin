import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Op } from "sequelize";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Bug } from "@src/Domain/Bug/Entity/Bug";
import { BugFilter } from "@src/Domain/Bug/Entity/BugFilter";
import { GitHubBugModel } from "./GitHubBug";
import logger from "jet-logger";
import { IIssueTrackerRepository } from "@src/Domain/Bug/Repository/IIssueTrackerRepository";

export class GitHubBugRepositoryImpl implements IIssueTrackerRepository {
  async queryBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>> {
    const response = new ResponseModel<Bug[]>(request.transactionId);
    try {
      const filter = request.data || new BugFilter();
      const whereClause: any = {};
      if (filter.repo) whereClause.githubRepo = filter.repo;
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

      const dbBugs = await GitHubBugModel.findAll({
        where: whereClause,
        order: [["createdAt", "DESC"]],
      });

      response.data = dbBugs.map((dbBug) =>
        Bug.builder()
          .setId(dbBug.id)
          .setTitle(dbBug.title)
          .setDescription(dbBug.description)
          .setPriority(dbBug.priority)
          .setStatus(dbBug.status)
          .setGithubRepo(dbBug.githubRepo)
          .setGitIssueNumber(dbBug.gitIssueNumber)
          .setGithubCreator(dbBug.githubCreator)
          .setGithubHtmlUrl(dbBug.githubHtmlUrl)
          .setGithubAssignee(dbBug.githubAssignee || undefined)
          .setCreatedAt(dbBug.createdAt)
          .setUpdatedAt(dbBug.updatedAt)
          .build(),
      );
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
      const [dbBug, created] = await GitHubBugModel.findOrCreate({
        where: {
          githubRepo: bug.githubRepo,
          gitIssueNumber: bug.gitIssueNumber,
        },
        defaults: {
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
          createdAt: bug.createdAt,
          updatedAt: bug.updatedAt,
        },
      });

      let updated = false;
      if (!created) {
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

        if (changed) {
          await dbBug.save();
          updated = true;
        }
      }

      response.data = { created, updated };
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
      const { id, status } = request.data!;
      const dbBug = await GitHubBugModel.findByPk(id);
      if (!dbBug) {
        return response.withError(
          HttpStatusCodes.NOT_FOUND,
          "GitHub bug not found",
        );
      }

      dbBug.status = status;
      await dbBug.save();

      response.data = Bug.builder()
        .setId(dbBug.id)
        .setGithubRepo(dbBug.githubRepo)
        .setGitIssueNumber(dbBug.gitIssueNumber)
        .setStatus(dbBug.status)
        .build();
    } catch (error) {
      logger.err(error);
      response.withError(HttpStatusCodes.INTERNAL_SERVER_ERROR, error.message);
    }
    return response;
  }
}

export const GitHubBugRepositoryInstance = new GitHubBugRepositoryImpl();
