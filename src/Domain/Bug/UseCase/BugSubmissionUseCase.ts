import type { IBugTrackerConfig } from "#src/Domain/Bug/Config/IBugTrackerConfig.js";
import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import {
  BUG_COMPONENT_LABELS,
  type BugComponentValue,
} from "#src/Domain/Bug/Entity/BugComponent.js";
import type { BugPriorityValue } from "#src/Domain/Bug/Entity/BugPriority.js";
import type { IBugRepository } from "#src/Domain/Bug/Repository/IBugRepository.js";
import type { IGitHubTokenProvider } from "#src/Domain/Bug/Service/IGitHubTokenProvider.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  ALLOWED_FILE_TYPES_LABEL,
  detectAllowedFileType,
} from "#src/Domain/Core/File/AllowedFileType.js";
import type { UploadedFile } from "#src/Domain/Core/File/UploadedFile.js";
import type { IIssueTrackerService } from "#src/Domain/Core/Service/IIssueTrackerService.js";
import type { IStorageService } from "#src/Domain/Core/Service/IStorageService.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import { ALLOWED_CATEGORIES } from "./BugQueryUseCase.js";

interface BugSubmissionData {
  title: string;
  description: string;
  priority: BugPriorityValue;
  category: string;
  // Optional: the global report form does not send it
  component?: string;
  githubRepo?: string;
  createdById?: string;
  reporterEmail?: string;
  file?: UploadedFile | null;
}

interface StoredFile {
  filePath: string;
  fileType: string;
}

export class BugSubmissionUseCase {
  public constructor(
    private readonly bugRepository: IBugRepository,
    private readonly userRepository: Pick<IUserRepository, "findSessionUser">,
    private readonly issueTrackerService: IIssueTrackerService,
    private readonly githubConfig: IBugTrackerConfig,
    private readonly tokenResolver: IGitHubTokenProvider,
    private readonly storageService: IStorageService,
  ) {}

  public async createBug(
    request: RequestModel<BugSubmissionData>,
  ): Promise<ResponseModel<Bug>> {
    const data = request.data;
    if (!data) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Request data is required.",
      );
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
        .setComponent(data.component)
        .build();
    } catch (error) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        (error as Error).message,
      );
    }

    if (!ALLOWED_CATEGORIES.includes(data.category)) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        `Invalid category selected. Allowed: ${ALLOWED_CATEGORIES.join(", ")}`,
      );
    }

    const fileType = data.file
      ? detectAllowedFileType(data.file.content, data.file.originalName)
      : null;
    if (data.file && !fileType) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        `Unsupported file type. Allowed: ${ALLOWED_FILE_TYPES_LABEL}.`,
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
    let resolvedCreatedById: string | undefined = data.createdById;

    if (data.createdById) {
      const userResponse = await this.userRepository.findSessionUser(
        new RequestModel(request.transactionId, data.createdById),
      );
      if (userResponse.data?.email) {
        reporterEmail = userResponse.data.email;
      } else {
        resolvedCreatedById = undefined;
      }
    }

    if (!reporterEmail) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Reporter email could not be resolved.",
      );
    }

    // The file is written only once the request is valid, and removed again
    // if the bug cannot be recorded.
    let resolvedFile: StoredFile | undefined;
    if (data.file && fileType) {
      const filePath = await this.storageService.saveFile(
        data.file.content,
        fileType.extension,
      );
      resolvedFile = { filePath, fileType: fileType.mimeType };
    }

    try {
      const response = await this.submitBug(
        request.transactionId,
        data,
        reporterEmail,
        resolvedCreatedById,
        resolvedFile,
      );
      if (response.errorCode && resolvedFile) {
        await this.storageService.deleteFile(resolvedFile.filePath);
      }
      return response;
    } catch (error) {
      if (resolvedFile) {
        await this.storageService.deleteFile(resolvedFile.filePath);
      }
      throw error;
    }
  }

  private async submitBug(
    transactionId: string | undefined,
    data: BugSubmissionData,
    reporterEmail: string,
    resolvedCreatedById: string | undefined,
    resolvedFile: StoredFile | undefined,
  ): Promise<ResponseModel<Bug>> {
    let status = "pending";
    let gitIssueNumber: number | undefined;
    let githubHtmlUrl: string | undefined;

    if (data.githubRepo && data.createdById) {
      const gitHubToken = await this.tokenResolver.resolveGitHubToken(
        data.githubRepo,
      );
      if (gitHubToken) {
        let issueBody = data.description || "No description provided.";
        issueBody += "\n\n---\n*Reported directly by Admin*";
        if (data.priority) {
          issueBody += `\n*Priority: ${data.priority}*`;
        }
        issueBody += `\n*Category: ${data.category}*`;
        if (data.component) {
          issueBody += `\n*Component: ${BUG_COMPONENT_LABELS[data.component as BugComponentValue]}*`;
        }
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
          const response = new ResponseModel<Bug>(transactionId);
          return response.withErrorPromise(
            DomainErrorCodes.INVALID_INPUT,
            "Failed to push bug to GitHub repository. Please verify repository existence and permissions.",
          );
        }
      } else {
        const response = new ResponseModel<Bug>(transactionId);
        return response.withErrorPromise(
          DomainErrorCodes.INVALID_INPUT,
          "GitHub integration token is not configured.",
        );
      }
    }

    return this.bugRepository.createBug(
      new RequestModel(transactionId, {
        title: data.title,
        description: data.description,
        priority: data.priority,
        category: data.category,
        component: (data.component || undefined) as
          | BugComponentValue
          | undefined,
        githubRepo: data.githubRepo,
        createdById: resolvedCreatedById || "",
        resolvedFile,
        reporterEmail,
        status,
        logComment: resolvedCreatedById
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
