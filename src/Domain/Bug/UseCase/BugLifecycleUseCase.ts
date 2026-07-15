import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import { IIssueTrackerService } from "@src/Domain/Core/Service/IIssueTrackerService";
import { IBugTrackerConfig } from "@src/Domain/Bug/Config/IBugTrackerConfig";
import { GitHubTokenResolver } from "@src/Domain/Bug/Service/GitHubTokenResolver";
import { IStorageService } from "@src/Domain/Core/Service/IStorageService";
import { Bug } from "@src/Domain/Bug/Entity/Bug";
import logger from "jet-logger";

export class BugLifecycleUseCase {
  public constructor(
    private readonly bugRepository: IBugRepository,
    private readonly issueTrackerService: IIssueTrackerService,
    private readonly storageService: IStorageService,
    private readonly githubConfig: IBugTrackerConfig,
    private readonly tokenResolver: GitHubTokenResolver,
  ) {}

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

    try {
      Bug.builder()
        .setTitle(data.title !== undefined ? data.title : bug.title)
        .setDescription(data.description !== undefined ? data.description : bug.description)
        .setPriority(data.priority !== undefined ? data.priority : bug.priority)
        .build();
    } catch (error) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, (error as Error).message);
    }

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
      const gitHubToken = await this.tokenResolver.resolveGitHubToken(bug.githubRepo);
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
      const gitHubToken = await this.tokenResolver.resolveGitHubToken(bug.githubRepo);
      const resolvedIssueNumber = bug.gitIssueNumber || gitIssueNumber;
      if (gitHubToken && resolvedIssueNumber) {
        if (data.status === "closed") {
          await this.issueTrackerService.closeIssue(
            bug.githubRepo,
            resolvedIssueNumber,
            gitHubToken,
          );
        } else if (data.status === "open" && bug.gitIssueNumber) {
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
}
