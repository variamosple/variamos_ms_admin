import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Bug } from "./Entity/Bug";
import { BugStatusLog } from "./Entity/BugStatusLog";
import { BugFilter } from "./Entity/BugFilter";
import logger from "jet-logger";
import { IIssueTrackerService } from "../Core/Service/IIssueTrackerService";
import { IStorageService } from "../Core/Service/IStorageService";
import { IBugRepository } from "./Repository/IBugRepository";
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
    private readonly bugRepository: IBugRepository,
    private readonly userRepository: IUserRepository,
    private readonly githubConfig: IBugTrackerConfig,
  ) {}

  queryBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>> {
    const filter = request.data || new BugFilter();
    if (!filter.repo) {
      (filter as any).managedRepos = this.githubConfig.getGitHubManagedRepos();
    }
    return this.bugRepository.queryBugs(
      new RequestModel(request.transactionId, filter),
    );
  }

  queryLocalBugs(
    request: RequestModel<BugFilter>,
  ): Promise<ResponseModel<Bug[]>> {
    return this.bugRepository.queryLocalBugs(request);
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

    let status = "pending";
    let gitIssueNumber: number | undefined = undefined;
    let githubHtmlUrl: string | undefined = undefined;

    if (data.githubRepo && data.createdById) {
      const gitHubToken = this.githubConfig.getGitHubToken();
      if (gitHubToken) {
        let issueBody = data.description || "No description provided.";
        issueBody += "\n\n---\n*Reported directly by Admin*";
        if (data.priority) {
          issueBody += `\n*Priority: ${data.priority}*`;
        }
        if (data.category) {
          issueBody += `\n*Category: ${data.category}*`;
        }
        if (resolvedFile) {
          const fileUrl = `${process.env.API_BASE_URL || "http://localhost:4000"}${resolvedFile.filePath}`;
          issueBody += `\n\n### Attachments\n- [Attachment](${fileUrl}) (Type: ${resolvedFile.fileType})`;
        }

        const labels = ["bug"];
        if (data.category) {
          labels.push(data.category.toLowerCase());
        }
        if (data.priority) {
          labels.push(data.priority.toLowerCase());
        }

        const issueNum = await this.issueTrackerService.createIssue(
          data.githubRepo,
          data.title,
          issueBody,
          labels,
          gitHubToken,
        );
        if (issueNum) {
          status = "open";
          gitIssueNumber = issueNum;
          githubHtmlUrl = `https://github.com/${data.githubRepo}/issues/${issueNum}`;
        } else {
          const response = new ResponseModel<Bug>(request.transactionId);
          return response.withErrorPromise(
            DomainErrorCodes.BAD_REQUEST,
            "Failed to push bug to GitHub repository. Please verify repository existence and permissions.",
          );
        }
      } else {
        const response = new ResponseModel<Bug>(request.transactionId);
        return response.withErrorPromise(
          DomainErrorCodes.BAD_REQUEST,
          "GitHub integration token is not configured.",
        );
      }
    }

    return this.bugRepository.createBug(
      new RequestModel(request.transactionId, {
        title: data.title,
        description: data.description,
        priority: data.priority,
        category: data.category,
        githubRepo: data.githubRepo,
        createdById: data.createdById || "",
        resolvedFile,
        reporterEmail,
        status,
        logComment: data.createdById
          ? status === "open"
            ? "Bug submitted directly to GitHub by admin."
            : "Bug submitted locally by user."
          : "Bug submitted locally by guest.",
        gitIssueNumber,
        githubHtmlUrl,
      }),
    );
  }

  queryHistory(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugStatusLog[]>> {
    return this.bugRepository.queryHistory(request);
  }

  async updateStatus(
    request: RequestModel<{
      id: string;
      status: string;
      comment?: string;
      adminId: string;
      title?: string;
      description?: string;
      priority?: "low" | "medium" | "high";
      category?: string;
      githubRepo?: string;
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

    const bugResponse = await this.bugRepository.findById(
      new RequestModel(request.transactionId, data.id),
    );

    if (!bugResponse.data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.NOT_FOUND,
        "Bug not found.",
      );
    }

    const bug = bugResponse.data;

    // Apply optional edits if supplied (allowing admins to review and correct details)
    if (data.title) bug.title = data.title;
    if (data.description) bug.description = data.description;
    if (data.priority) bug.priority = data.priority;
    if (data.category) bug.category = data.category;
    if (data.githubRepo) bug.githubRepo = data.githubRepo;

    let gitIssueNumber: number | undefined = undefined;
    let githubHtmlUrl: string | undefined = undefined;

    if (data.status === "open" && !bug.gitIssueNumber && bug.githubRepo) {
      const gitHubToken = this.githubConfig.getGitHubToken();
      if (gitHubToken) {
        let issueBody = bug.description || "No description provided.";
        issueBody += `\n\n---\n*Reported locally by: ${bug.reporterEmail || "Guest"}*`;
        if (bug.priority) {
          issueBody += `\n*Priority: ${bug.priority}*`;
        }
        if (bug.category) {
          issueBody += `\n*Category: ${bug.category}*`;
        }

        if (bug.attachments && bug.attachments.length > 0) {
          issueBody += "\n\n### Attachments\n";
          for (const attachment of bug.attachments) {
            if (attachment.filePath && attachment.filePath !== "/purged") {
              const fileUrl = `${process.env.API_BASE_URL || "http://localhost:4000"}${attachment.filePath}`;
              issueBody += `- [Attachment](${fileUrl}) (Type: ${attachment.fileType || "unknown"})\n`;
            }
          }
        }

        // Construct labels including priority and category
        const labels = ["bug"];
        if (bug.category) {
          labels.push(bug.category.toLowerCase());
        }
        if (bug.priority) {
          labels.push(bug.priority.toLowerCase());
        }

        const issueNum = await this.issueTrackerService.createIssue(
          bug.githubRepo,
          bug.title,
          issueBody,
          labels,
          gitHubToken,
        );

        if (issueNum) {
          gitIssueNumber = issueNum;
          githubHtmlUrl = `https://github.com/${bug.githubRepo}/issues/${issueNum}`;

          // Note: Physical attachments are retained locally so links on GitHub remain valid.
        } else {
          const response = new ResponseModel<Bug>(request.transactionId);
          return response.withErrorPromise(
            DomainErrorCodes.BAD_REQUEST,
            "Failed to push bug to GitHub repository. Please verify repository existence and permissions.",
          );
        }
      } else {
        const response = new ResponseModel<Bug>(request.transactionId);
        return response.withErrorPromise(
          DomainErrorCodes.BAD_REQUEST,
          "GitHub integration token is not configured.",
        );
      }
    }

    const dbResponse = await this.bugRepository.updateStatus(
      new RequestModel(request.transactionId, {
        id: data.id,
        status: data.status,
        comment: data.comment,
        adminId: data.adminId,
        gitIssueNumber,
        githubHtmlUrl,
        title: data.title,
        description: data.description,
        priority: data.priority,
        category: data.category,
        githubRepo: data.githubRepo,
      }),
    );

    if (
      dbResponse.data &&
      bug.githubRepo &&
      (bug.gitIssueNumber || gitIssueNumber)
    ) {
      const gitHubToken = this.githubConfig.getGitHubToken();
      const resolvedIssueNumber = bug.gitIssueNumber || gitIssueNumber;
      if (gitHubToken && resolvedIssueNumber) {
        if (data.status === "closed") {
          await this.issueTrackerService.closeIssue(
            bug.githubRepo,
            resolvedIssueNumber,
            gitHubToken,
          );
        } else if (data.status === "open" && bug.gitIssueNumber) {
          // Only call reopen if it was already on GitHub previously (avoid double open call on new creation)
          await this.issueTrackerService.reopenIssue(
            bug.githubRepo,
            resolvedIssueNumber,
            gitHubToken,
          );
        }
      }
    }
    return dbResponse;
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

    const bugResponse = await this.bugRepository.findById(
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

    return this.bugRepository.rejectBug(
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

    const bugResponse = await this.bugRepository.findById(
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

    return this.bugRepository.restoreBug(
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
      const expiredResponse = await this.bugRepository.findExpiredRejectedBugs(
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
              await this.bugRepository.updateAttachmentPath(
                new RequestModel(transactionId, {
                  id: attachment.id,
                  filePath: "/purged",
                }),
              );
            }
          }
        }

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

  async queryCategories(
    request: RequestModel<void>,
  ): Promise<ResponseModel<string[]>> {
    const response = new ResponseModel<ResponseModel<string[]>>(
      request.transactionId,
    ) as any;
    response.data = ALLOWED_CATEGORIES;
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
          let category: string | undefined = undefined;
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
                  n.includes("urg") ||
                  n.includes("important"),
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

            for (const label of labelNames) {
              const matchedCategory = ALLOWED_CATEGORIES.find(
                (cat) => cat.toLowerCase() === label,
              );
              if (matchedCategory) {
                category = matchedCategory;
                break;
              }
            }
          }

          const bugEntity = Bug.builder()
            .setTitle(issue.title)
            .setDescription(issue.body || "No description provided.")
            .setPriority(priority)
            .setCategory(category)
            .setStatus(issue.state === "closed" ? "closed" : "open")
            .setGithubRepo(repo)
            .setGitIssueNumber(issue.number)
            .setGithubCreator(issue.user?.login || "System")
            .setGithubHtmlUrl(issue.html_url || "")
            .setGithubAssignee(issue.assignee?.login || undefined)
            .setCreatedAt(new Date(issue.created_at))
            .setUpdatedAt(new Date(issue.updated_at || issue.created_at))
            .build();

          const saveResponse = await this.bugRepository.saveOrUpdateBug(
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

  async addAttachment(
    request: RequestModel<{ bugId: string; file: any }>,
  ): Promise<ResponseModel<any>> {
    const data = request.data!;
    const response = new ResponseModel<any>(request.transactionId);
    if (!data.file) {
      return response.withErrorPromise(
        DomainErrorCodes.BAD_REQUEST,
        "File is required.",
      );
    }
    const resolvedFile = {
      filePath: `/uploads/${data.file.filename}`,
      fileType: data.file.mimetype,
    };
    return this.bugRepository.createAttachment(
      new RequestModel(request.transactionId, {
        filePath: resolvedFile.filePath,
        fileType: resolvedFile.fileType,
        bugId: data.bugId,
      }),
    );
  }

  async deleteAttachment(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const id = request.data!;
    const response = new ResponseModel<void>(request.transactionId);
    const attachmentResp = await this.bugRepository.findAttachmentById(
      new RequestModel(request.transactionId, id),
    );
    if (!attachmentResp.data) {
      return response.withErrorPromise(
        DomainErrorCodes.NOT_FOUND,
        "Attachment not found.",
      );
    }
    const filePath = attachmentResp.data.filePath;
    if (filePath && filePath !== "/purged") {
      try {
        await this.storageService.deleteFile(filePath);
      } catch (err) {
        logger.warn(`Failed to delete physical file: ${filePath}`);
      }
    }
    return this.bugRepository.deleteAttachment(request);
  }
}
