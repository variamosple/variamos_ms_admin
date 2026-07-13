import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import { IUserRepository } from "@src/Domain/Bug/Repository/IUserRepository";
import { IIssueTrackerService } from "@src/Domain/Core/Service/IIssueTrackerService";
import { IBugTrackerConfig } from "@src/Domain/Bug/Config/IBugTrackerConfig";
import { GitHubTokenResolver } from "@src/Domain/Bug/Service/GitHubTokenResolver";
import { Bug } from "@src/Domain/Bug/Entity/Bug";
import { ALLOWED_CATEGORIES } from "./BugQueryUseCase";

export class BugSubmissionUseCase {
  public constructor(
    private readonly bugRepository: IBugRepository,
    private readonly userRepository: IUserRepository,
    private readonly issueTrackerService: IIssueTrackerService,
    private readonly githubConfig: IBugTrackerConfig,
    private readonly tokenResolver: GitHubTokenResolver,
  ) {}

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

    try {
      Bug.builder()
        .setTitle(data.title)
        .setDescription(data.description)
        .setPriority(data.priority)
        .build();
    } catch (error) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, (error as Error).message);
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
      const gitHubToken = await this.tokenResolver.resolveGitHubToken(data.githubRepo);
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
}
