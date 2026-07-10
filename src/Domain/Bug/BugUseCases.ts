import { RequestModel } from "../Core/Entity/RequestModel";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { Bug } from "./Entity/Bug";
import { BugStatusLog } from "./Entity/BugStatusLog";
import { BugFilter } from "./Entity/BugFilter";
import { BugNote } from "./Entity/BugNote";
import { BugAttachment } from "./Entity/BugAttachment";
import logger from "jet-logger";
import { IIssueTrackerService } from "../Core/Service/IIssueTrackerService";
import { IStorageService } from "../Core/Service/IStorageService";
import { IBugRepository } from "./Repository/IBugRepository";
import { IUserRepository } from "./Repository/IUserRepository";
import { IBugTrackerConfig } from "./Config/IBugTrackerConfig";
import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";
import crypto from "crypto";
import axios from "axios";

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
  public constructor(
    private readonly issueTrackerService: IIssueTrackerService,
    private readonly storageService: IStorageService,
    private readonly bugRepository: IBugRepository,
    private readonly userRepository: IUserRepository,
    private readonly githubConfig: IBugTrackerConfig,
  ) {}

  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  private async resolveGitHubToken(repo: string): Promise<string> {
    const appId = this.githubConfig.getGitHubAppId?.()?.trim();
    const privateKey = this.githubConfig.getGitHubPrivateKey?.()?.trim();

    if (appId && privateKey) {
      try {
        const cached = this.tokenCache.get(repo);
        if (cached && cached.expiresAt > Date.now() + 120000) {
          return cached.token;
        }

        const jwt = this.generateAppJwt(appId, privateKey);

        const installUrl = `https://api.github.com/repos/${repo}/installation`;
        const installResponse = await axios.get<{ id: number }>(installUrl, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "VariaMos-MS-Admin",
          },
        });
        const installationId = installResponse.data.id;

        const tokenUrl = `https://api.github.com/app/installations/${installationId}/access_tokens`;
        const tokenResponse = await axios.post<{ token: string; expires_at: string }>(
          tokenUrl,
          {},
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "VariaMos-MS-Admin",
            },
          },
        );

        const token = tokenResponse.data.token;
        const expiresAt = new Date(tokenResponse.data.expires_at).getTime();

        this.tokenCache.set(repo, { token, expiresAt });
        return token;
      } catch (error) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        logger.err(
          `Failed to resolve GitHub App token for ${repo}: ` +
            (err.response?.data?.message || err.message || "Unknown error"),
        );
      }
    }

    return this.githubConfig.getGitHubToken()?.trim() || "";
  }

  private generateAppJwt(appId: string, privateKey: string): string {
    // cspell:disable-next-line
    const header = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9"; // base64url for {"alg":"RS256","typ":"JWT"}
    const now = Math.floor(Date.now() / 1000) - 60; // 1 min clock skew
    const payload = Buffer.from(
      JSON.stringify({
        iat: now,
        exp: now + 600, // 10 minutes
        iss: appId,
      }),
    ).toString("base64url");

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${header}.${payload}`);
    const formattedKey = privateKey.replace(/\\n/g, "\n");
    const signature = sign.sign(formattedKey, "base64url");

    return `${header}.${payload}.${signature}`;
  }

  public queryBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>> {
    const filter = request.data || new BugFilter();
    if (!filter.repo) {
      (filter as { managedRepos?: string[] }).managedRepos =
        this.githubConfig.getGitHubManagedRepos();
    }
    return this.bugRepository.queryBugs(new RequestModel(request.transactionId, filter));
  }

  public queryLocalBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>> {
    return this.bugRepository.queryLocalBugs(request);
  }

  public async createBug(
    request: RequestModel<{
      title: string;
      description: string;
      priority: "low" | "medium" | "high";
      category: string;
      githubRepo?: string;
      createdById?: string;
      reporterEmail?: string;
      file?: {
        filename: string;
        mimetype: string;
      } | null;
    }>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data;
    if (!data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Request data is required.");
    }

    if (!data.title || !data.description || !data.category) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Title, description and category are required.",
      );
    }
    if (!ALLOWED_CATEGORIES.includes(data.category)) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        `Invalid category selected. Allowed: ${ALLOWED_CATEGORIES.join(", ")}`,
      );
    }

    if (!data.createdById && !data.reporterEmail) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
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
        DomainErrorCodes.INVALID_INPUT,
        "Reporter email could not be resolved.",
      );
    }

    let resolvedFile: { filePath: string; fileType: string } | undefined = undefined;
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
      const gitHubToken = await this.resolveGitHubToken(data.githubRepo);
      if (gitHubToken) {
        let issueBody = data.description || "No description provided.";
        issueBody += "\n\n---\n*Reported directly by Admin*";
        if (data.priority) {
          issueBody += `\n*Priority: ${data.priority}*`;
        }
        issueBody += `\n*Category: ${data.category}*`;
        if (resolvedFile) {
          const fileUrl = `${this.githubConfig.getApiBaseUrl?.() || "http://localhost:4000"}${resolvedFile.filePath}`;
          issueBody += `\n\n### Attachments\n- [Attachment](${fileUrl}) (Type: ${resolvedFile.fileType})`;
        }

        const labels = ["bug", data.category.toLowerCase()];
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
            DomainErrorCodes.INVALID_INPUT,
            "Failed to push bug to GitHub repository. Please verify repository existence and permissions.",
          );
        }
      } else {
        const response = new ResponseModel<Bug>(request.transactionId);
        return response.withErrorPromise(
          DomainErrorCodes.INVALID_INPUT,
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

  public queryHistory(request: RequestModel<string>): Promise<ResponseModel<BugStatusLog[]>> {
    return this.bugRepository.queryHistory(request);
  }

  public async updateStatus(
    request: RequestModel<{
      id: string;
      status: string;
      comment?: string;
      adminId: string;
      adminEmail?: string;
      title?: string;
      description?: string;
      priority?: "low" | "medium" | "high";
      category?: string;
      githubRepo?: string;
    }>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data;
    if (!data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Request data is required.");
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
      return response.withErrorPromise(DomainErrorCodes.ENTITY_NOT_FOUND, "Bug not found.");
    }

    const bug = bugResponse.data;

    // Apply optional edits if supplied (allowing admins to review and correct details)
    const modifiedFields: string[] = [];
    if (data.title && data.title !== bug.title) {
      modifiedFields.push(`* Title: "${bug.title}" -> "${data.title}"`);
    }
    if (data.description && data.description !== bug.description) {
      modifiedFields.push(`* Description: "${bug.description}" -> "${data.description}"`);
    }
    if (data.category && data.category !== bug.category) {
      modifiedFields.push(`* Category: "${bug.category || "None"}" -> "${data.category}"`);
    }
    if (data.priority && data.priority !== bug.priority) {
      modifiedFields.push(`* Priority: "${bug.priority || "medium"}" -> "${data.priority}"`);
    }
    if (data.githubRepo && data.githubRepo !== bug.githubRepo) {
      modifiedFields.push(`* Target repository set to "${data.githubRepo}"`);
    }

    if (data.title) bug.title = data.title;
    if (data.description) bug.description = data.description;
    if (data.priority) bug.priority = data.priority;
    if (data.category) bug.category = data.category;
    if (data.githubRepo) bug.githubRepo = data.githubRepo;

    let gitIssueNumber: number | undefined = undefined;
    let githubHtmlUrl: string | undefined = undefined;

    if (data.status === "open" && !bug.gitIssueNumber && bug.githubRepo) {
      const gitHubToken = await this.resolveGitHubToken(bug.githubRepo);
      if (gitHubToken) {
        let issueBody = bug.description || "No description provided.";
        issueBody += `\n\n---\n*Reported locally by: ${bug.reporterEmail || "Guest"}*`;
        if (data.adminEmail) {
          const approvalComment = data.comment ? ` (Comment: "${data.comment}")` : "";
          issueBody += `\n*Approved and pushed to GitHub by: ${data.adminEmail}${approvalComment}*`;
        }
        if (bug.priority) {
          issueBody += `\n*Priority: ${bug.priority}*`;
        }
        if (bug.category) {
          issueBody += `\n*Category: ${bug.category}*`;
        }

        const attachments = bug.attachments as
          { filePath?: string; fileType?: string }[] | undefined;
        if (attachments && attachments.length > 0) {
          issueBody += "\n\n### Attachments\n";
          for (const attachment of attachments) {
            if (attachment.filePath && attachment.filePath !== "/purged") {
              const fileUrl = `${this.githubConfig.getApiBaseUrl?.() || "http://localhost:4000"}${attachment.filePath}`;
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
            DomainErrorCodes.INVALID_INPUT,
            "Failed to push bug to GitHub repository. Please verify repository existence and permissions.",
          );
        }
      } else {
        const response = new ResponseModel<Bug>(request.transactionId);
        return response.withErrorPromise(
          DomainErrorCodes.INVALID_INPUT,
          "GitHub integration token is not configured.",
        );
      }
    }

    const approvalCommentStr = data.comment ? `\n\nAdmin Comment: "${data.comment}"` : "";

    if (data.status === "open" && modifiedFields.length > 0) {
      const auditBody = `[Audit] The administrator modified the following fields:\n${modifiedFields.join("\n")}${approvalCommentStr}`;
      await this.bugRepository.createNote(
        new RequestModel(request.transactionId, {
          bugId: bug.id,
          body: auditBody,
        }),
      );
    } else if (data.status === "open") {
      await this.bugRepository.createNote(
        new RequestModel(request.transactionId, {
          bugId: bug.id,
          body: `[Audit] The bug was approved and sent to GitHub. The fields were not modified by the administrator.${approvalCommentStr}`,
        }),
      );
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

    if (dbResponse.data && bug.githubRepo && (bug.gitIssueNumber || gitIssueNumber)) {
      const gitHubToken = await this.resolveGitHubToken(bug.githubRepo);
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

  public async rejectBug(
    request: RequestModel<{ id: string; adminId: string }>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data;
    if (!data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Request data is required.");
    }

    if (!data.id) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Bug ID is required.");
    }

    const bugResponse = await this.bugRepository.findById(
      new RequestModel(request.transactionId, data.id),
    );

    if (!bugResponse.data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(DomainErrorCodes.ENTITY_NOT_FOUND, "Local bug not found.");
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
    const data = request.data;
    if (!data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Request data is required.");
    }

    if (!data.id) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Bug ID is required.");
    }

    const bugResponse = await this.bugRepository.findById(
      new RequestModel(request.transactionId, data.id),
    );

    if (!bugResponse.data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(DomainErrorCodes.ENTITY_NOT_FOUND, "Local bug not found.");
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
      thresholdDate.setDate(thresholdDate.getDate() - 7);

      const transactionId = "purgeExpiredBugs";
      const expiredResponse = await this.bugRepository.findExpiredRejectedBugs(
        new RequestModel(transactionId, thresholdDate),
      );

      const expiredBugs = expiredResponse.data || [];
      if (expiredBugs.length === 0) return;
      logger.info(`Found ${expiredBugs.length} expired rejected bugs to purge.`);

      for (const bug of expiredBugs) {
        let hasAttachments = false;
        const attachments = bug.attachments as
          { id: number; filePath?: string; fileType?: string }[] | undefined;
        if (attachments && Array.isArray(attachments)) {
          for (const attachment of attachments) {
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
      const err = error as Error;
      logger.err(`Failed to purge expired rejected bugs: ${err.message}`);
    }
  }

  public queryBugRepos(request: RequestModel<void>): Promise<ResponseModel<string[]>> {
    const response = new ResponseModel<string[]>(request.transactionId);
    try {
      response.data = [...this.githubConfig.getGitHubManagedRepos()];
    } catch (error) {
      const err = error as Error;
      logger.err(err);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, err.message);
    }
    return Promise.resolve(response);
  }

  public queryCategories(request: RequestModel<void>): Promise<ResponseModel<string[]>> {
    const response = new ResponseModel<string[]>(request.transactionId);
    response.data = ALLOWED_CATEGORIES;
    return Promise.resolve(response);
  }

  public async syncBugs(request: RequestModel<void>): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const appId = this.githubConfig.getGitHubAppId?.()?.trim();
      const privateKey = this.githubConfig.getGitHubPrivateKey?.()?.trim();
      const patToken = this.githubConfig.getGitHubToken()?.trim();

      const hasAppConfig = !!(appId && privateKey);
      const hasPatConfig = !!patToken;

      if (!hasAppConfig && !hasPatConfig) {
        logger.warn(
          "GitHub token is not defined in environment variables. Synchronization aborted.",
        );
        return response.withError(DomainErrorCodes.INVALID_INPUT, "GitHub Sync is not configured.");
      }

      const repos = this.githubConfig.getGitHubManagedRepos();
      logger.info(`Starting bugs sync for repos: ${repos.join(", ")}`);

      let totalCreated = 0;
      let totalUpdated = 0;

      for (const repo of repos) {
        const token = await this.resolveGitHubToken(repo);
        if (!token) {
          logger.warn(`GitHub token could not be resolved for repo: ${repo}. Skipping.`);
          continue;
        }
        const issues = await this.issueTrackerService.getIssues(repo, token);
        if (!issues) continue;

        for (const issue of issues) {
          if (issue.pull_request) continue;

          let priority: "low" | "medium" | "high" = "medium";
          let category: string | undefined = undefined;
          if (issue.labels && Array.isArray(issue.labels)) {
            const labelNames = issue.labels.map((l) => l.name.toLowerCase());
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
                (n: string) => n.includes("low") || n.includes("p3") || n.includes("minor"),
              )
            ) {
              priority = "low";
            }

            for (const label of labelNames) {
              const matchedCategory = ALLOWED_CATEGORIES.find((cat) => cat.toLowerCase() === label);
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
            .setCreatedAt(new Date(issue.created_at || ""))
            .setUpdatedAt(new Date(issue.updated_at || issue.created_at || ""))
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
      const err = error as Error;
      logger.err(err);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, err.message);
    }
    return response;
  }

  public async addAttachment(
    request: RequestModel<{
      bugId: string;
      file: {
        filename: string;
        mimetype: string;
      } | null;
    }>,
  ): Promise<ResponseModel<BugAttachment>> {
    const data = request.data;
    const response = new ResponseModel<BugAttachment>(request.transactionId);
    if (!data) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Request data is required.");
    }
    if (!data.file) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "File is required.");
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

  public async deleteAttachment(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const id = request.data;
    const response = new ResponseModel<void>(request.transactionId);
    if (!id) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Attachment ID is required.",
      );
    }
    const attachmentResp = await this.bugRepository.findAttachmentById(
      new RequestModel(request.transactionId, id),
    );
    if (!attachmentResp.data) {
      return response.withErrorPromise(DomainErrorCodes.ENTITY_NOT_FOUND, "Attachment not found.");
    }
    const filePath = attachmentResp.data.filePath;
    if (filePath && filePath !== "/purged") {
      try {
        await this.storageService.deleteFile(filePath);
      } catch {
        logger.warn(`Failed to delete physical file: ${filePath}`);
      }
    }
    return this.bugRepository.deleteAttachment(request);
  }

  public createNote(
    request: RequestModel<{ bugId: string; body: string; authorId?: string }>,
  ): Promise<ResponseModel<BugNote>> {
    return this.bugRepository.createNote(request);
  }

  public queryNotes(request: RequestModel<string>): Promise<ResponseModel<BugNote[]>> {
    return this.bugRepository.queryNotes(request);
  }
}
