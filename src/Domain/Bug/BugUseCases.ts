import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Bug } from "./Entity/Bug";
import { BugStatusLog } from "./Entity/BugStatusLog";
import { BugFilter } from "./Entity/BugFilter";
import logger from "jet-logger";
import { IIssueTrackerService } from "../Core/Service/IIssueTrackerService";
import { IStorageService } from "../Core/Service/IStorageService";
import { IIssueTrackerRepository } from "./Repository/IIssueTrackerRepository";
import { ILocalBugRepository } from "./Repository/ILocalBugRepository";
import { IUserRepository } from "./Repository/IUserRepository";
import { IBugTrackerConfig } from "./Config/IBugTrackerConfig";
import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";

export const ALLOWED_CATEGORIES = [
  "Editor",
  "Model",
  "Language",
  "Project",
  "Simulation",
  "Account/Security",
  "Other",
];

export class BugUseCases {
  constructor(
    private readonly issueTrackerService: IIssueTrackerService,
    private readonly storageService: IStorageService,
    private readonly gitHubBugRepository: IIssueTrackerRepository,
    private readonly localBugRepository: ILocalBugRepository,
    private readonly userRepository: IUserRepository,
    private readonly githubConfig: IBugTrackerConfig,
  ) {}

  queryBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>> {
    return this.gitHubBugRepository.queryBugs(request);
  }

  queryLocalBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>> {
    return this.localBugRepository.queryLocalBugs(request);
  }

  async createBug(
    request: RequestModel<{
      title: string;
      description: string;
      priority: "low" | "medium" | "high";
      category: string;
      githubRepo?: string;
      createdById?: string;
      reporterEmail?: string;
      file?: any;
    }>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data!;
    if (!data.title || !data.description || !data.category) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.BAD_REQUEST,
        "Title, description and category are required.",
      );
    }
    if (!ALLOWED_CATEGORIES.includes(data.category)) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.BAD_REQUEST,
        `Invalid category selected. Allowed: ${ALLOWED_CATEGORIES.join(", ")}`,
      );
    }

    if (!data.createdById && !data.reporterEmail) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.BAD_REQUEST,
        "An email address is required for guest bug submissions.",
      );
    }

    let reporterEmail = data.reporterEmail;
    if (data.createdById) {
      const userResponse = await this.userRepository.findSessionUser(
        new RequestModel(request.transactionId, data.createdById),
      );
      if (userResponse.data && userResponse.data.email) {
        reporterEmail = userResponse.data.email;
      }
    }

    if (!reporterEmail) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.BAD_REQUEST,
        "Reporter email could not be resolved.",
      );
    }

    let resolvedFile: { filePath: string; fileType: string } | undefined =
      undefined;
    if (data.file) {
      resolvedFile = {
        filePath: `/uploads/${data.file.filename}`,
        fileType: data.file.mimetype,
      };
    }

    return this.localBugRepository.createBug(
      new RequestModel(request.transactionId, {
        title: data.title,
        description: data.description,
        priority: data.priority,
        category: data.category,
        githubRepo: data.githubRepo,
        createdById: data.createdById || "",
        resolvedFile,
        reporterEmail,
        status: "pending",
        logComment: data.createdById
          ? "Bug submitted locally by user."
          : "Bug submitted locally by guest.",
      }),
    );
  }

  queryHistory(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugStatusLog[]>> {
    return this.localBugRepository.queryHistory(request);
  }

  async updateStatus(
    request: RequestModel<{
      id: string;
      status: string;
      comment?: string;
      adminId: string;
    }>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data!;
    if (!data.id || !data.status) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.BAD_REQUEST,
        "Bug ID and status are required.",
      );
    }
    const gitHubToken = this.githubConfig.getGitHubToken();
    if (data.id.startsWith("gh-")) {
      const dbResponse = await this.gitHubBugRepository.updateStatus(request);
      if (dbResponse.data && gitHubToken) {
        const bug = dbResponse.data;
        if (bug.githubRepo && bug.gitIssueNumber) {
          if (data.status === "closed") {
            await this.issueTrackerService.closeIssue(
              bug.githubRepo,
              bug.gitIssueNumber,
              gitHubToken,
            );
          } else if (data.status === "open") {
            await this.issueTrackerService.reopenIssue(
              bug.githubRepo,
              bug.gitIssueNumber,
              gitHubToken,
            );
          }
        }
      }
      return dbResponse;
    } else {
      return this.localBugRepository.updateStatus(request);
    }
  }

  async rejectBug(
    request: RequestModel<{ id: string; adminId: string }>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data!;
    if (!data.id) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.BAD_REQUEST,
        "Bug ID is required.",
      );
    }

    const bugResponse = await this.localBugRepository.findById(
      new RequestModel(request.transactionId, data.id),
    );

    if (!bugResponse.data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.NOT_FOUND,
        "Local bug not found.",
      );
    }

    if (bugResponse.data.status !== "pending") {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.BAD_REQUEST,
        "Only pending bugs can be rejected.",
      );
    }

    return this.localBugRepository.rejectBug(
      new RequestModel(request.transactionId, {
        id: data.id,
        adminId: data.adminId,
        logComment: "Bug rejected.",
      }),
    );
  }

  async restoreBug(
    request: RequestModel<{ id: string; adminId: string }>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data!;
    if (!data.id) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.BAD_REQUEST,
        "Bug ID is required.",
      );
    }

    const bugResponse = await this.localBugRepository.findById(
      new RequestModel(request.transactionId, data.id),
    );

    if (!bugResponse.data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.NOT_FOUND,
        "Local bug not found.",
      );
    }

    if (bugResponse.data.status !== "rejected") {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.BAD_REQUEST,
        "Only rejected bugs can be restored.",
      );
    }

    return this.localBugRepository.restoreBug(
      new RequestModel(request.transactionId, {
        id: data.id,
        adminId: data.adminId,
        logComment: "Bug restored.",
      }),
    );
  }

  async purgeExpiredRejectedBugs(): Promise<void> {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - 7);

      const transactionId = "purgeExpiredBugs";
      const expiredResponse =
        await this.localBugRepository.findExpiredRejectedBugs(
          new RequestModel(transactionId, thresholdDate),
        );

      const expiredBugs = expiredResponse.data || [];
      if (expiredBugs.length === 0) return;
      logger.info(
        `Found ${expiredBugs.length} expired rejected bugs to purge.`,
      );

      for (const bug of expiredBugs) {
        let hasAttachments = false;
        if (bug.attachments && Array.isArray(bug.attachments)) {
          for (const attachment of bug.attachments) {
            if (attachment.filePath && attachment.filePath !== "/purged") {
              hasAttachments = true;
              await this.storageService.deleteFile(attachment.filePath);
              await this.localBugRepository.updateAttachmentPath(
                new RequestModel(transactionId, {
                  id: attachment.id,
                  filePath: "/purged",
                }),
              );
            }
          }
        }

        await this.localBugRepository.updateStatus(
          new RequestModel(transactionId, {
            id: bug.id,
            status: "purged",
            adminId: "",
          }),
        );

        await this.localBugRepository.createLog(
          new RequestModel(transactionId, {
            action: "purge",
            comment: hasAttachments
              ? "Bug status changed to purged. Physical attachments deleted due to retention policy."
              : "Bug status changed to purged. No attachments to delete.",
            localBugId: bug.id,
          }),
        );
      }
      logger.info("Expired rejected bugs purging complete.");
    } catch (error) {
      logger.err(`Failed to purge expired rejected bugs: ${error.message}`);
    }
  }

  async queryBugRepos(
    request: RequestModel<void>,
  ): Promise<ResponseModel<string[]>> {
    const response = new ResponseModel<string[]>(request.transactionId);
    try {
      response.data = [...this.githubConfig.getGitHubManagedRepos()];
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, error.message);
    }
    return response;
  }

  async syncBugs(request: RequestModel<void>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const token = this.githubConfig.getGitHubToken();
      if (!token) {
        logger.warn(
          "GitHub token is not defined in environment variables. Synchronization aborted.",
        );
        return response.withError(
          DomainErrorCodes.BAD_REQUEST,
          "GitHub Sync is not configured.",
        );
      }

      const repos = this.githubConfig.getGitHubManagedRepos();
      logger.info(`Starting bugs sync for repos: ${repos.join(", ")}`);

      let totalCreated = 0;
      let totalUpdated = 0;

      for (const repo of repos) {
        const issues = await this.issueTrackerService.getIssues(repo, token);
        if (!issues) continue;

        for (const issue of issues) {
          if (issue.pull_request) continue;

          let priority: "low" | "medium" | "high" = "medium";
          if (issue.labels && Array.isArray(issue.labels)) {
            const labelNames = issue.labels.map((l: any) =>
              l.name.toLowerCase(),
            );
            if (
              labelNames.some(
                (n: string) =>
                  n.includes("high") ||
                  n.includes("p1") ||
                  n.includes("critical") ||
                  n.includes("urg"),
              )
            ) {
              priority = "high";
            } else if (
              labelNames.some(
                (n: string) =>
                  n.includes("low") || n.includes("p3") || n.includes("minor"),
              )
            ) {
              priority = "low";
            }
          }

          const bugId = `gh-${repo.replace("/", "-")}-${issue.number}`;

          const bugEntity = Bug.builder()
            .setId(bugId)
            .setTitle(issue.title)
            .setDescription(issue.body || "No description provided.")
            .setPriority(priority)
            .setStatus(issue.state === "closed" ? "closed" : "open")
            .setGithubRepo(repo)
            .setGitIssueNumber(issue.number)
            .setGithubCreator(issue.user?.login || "System")
            .setGithubHtmlUrl(issue.html_url || "")
            .setGithubAssignee(issue.assignee?.login || undefined)
            .setCreatedAt(new Date(issue.created_at))
            .setUpdatedAt(new Date(issue.updated_at || issue.created_at))
            .build();

          const saveResponse = await this.gitHubBugRepository.saveOrUpdateBug(
            new RequestModel(request.transactionId, bugEntity),
          );

          if (saveResponse.data) {
            if (saveResponse.data.created) totalCreated++;
            if (saveResponse.data.updated) totalUpdated++;
          }
        }
      }

      logger.info(
        `Synchronization finished: Created ${totalCreated} and Updated ${totalUpdated} bugs.`,
      );
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.INTERNAL_ERROR, error.message);
    }
    return response;
  }
}
