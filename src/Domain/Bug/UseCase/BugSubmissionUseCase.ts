import type { IBugTrackerConfig } from "#src/Domain/Bug/Config/IBugTrackerConfig.js";
import {
  isManagedRepository,
  UNMANAGED_REPOSITORY_MESSAGE,
} from "#src/Domain/Bug/Config/ManagedRepository.js";
import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import {
  BUG_COMPONENT_LABELS,
  isBugComponent,
} from "#src/Domain/Bug/Entity/BugComponent.js";
import type { BugPriorityValue } from "#src/Domain/Bug/Entity/BugPriority.js";
import type { IBugRepository } from "#src/Domain/Bug/Repository/IBugRepository.js";
import type { IGitHubTokenProvider } from "#src/Domain/Bug/Service/IGitHubTokenProvider.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import {
  ALLOWED_FILE_TYPES_LABEL,
  detectAllowedFileType,
} from "#src/Domain/Core/File/AllowedFileType.js";
import type { UploadedFile } from "#src/Domain/Core/File/UploadedFile.js";
import type { IIssueTrackerService } from "#src/Domain/Core/Service/IIssueTrackerService.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IStorageService } from "#src/Domain/Core/Service/IStorageService.js";
import { refuseClosedAccount } from "#src/Domain/User/Entity/AccountAccess.js";
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

/** A bug to submit, with its reporter and stored attachment. */
export interface BugSubmission {
  transactionId: string | undefined;
  data: BugSubmissionData;
  reporterEmail: string;
  resolvedCreatedById: string | undefined;
  resolvedFile: StoredFile | undefined;
}

/** What the submission of a bug reads and writes. */
export interface BugSubmissionUseCaseDependencies {
  bugRepository: IBugRepository;
  userRepository: Pick<IUserRepository, "findSessionUser">;
  issueTrackerService: IIssueTrackerService;
  githubConfig: IBugTrackerConfig;
  tokenResolver: IGitHubTokenProvider;
  storageService: IStorageService;
  logger: ILogger;
}

/** The log comment of a submission: by an admin, a user or a guest. */
const submissionComment = (createdById: string | undefined, status: string) => {
  if (!createdById) return "Bug submitted locally by guest.";
  return status === "open"
    ? "Bug submitted directly to GitHub by admin."
    : "Bug submitted locally by user.";
};

export class BugSubmissionUseCase {
  private readonly bugRepository: IBugRepository;
  private readonly userRepository: Pick<IUserRepository, "findSessionUser">;
  private readonly issueTrackerService: IIssueTrackerService;
  private readonly githubConfig: IBugTrackerConfig;
  private readonly tokenResolver: IGitHubTokenProvider;
  private readonly storageService: IStorageService;
  private readonly logger: ILogger;

  public constructor(dependencies: BugSubmissionUseCaseDependencies) {
    const {
      bugRepository,
      userRepository,
      issueTrackerService,
      githubConfig,
      tokenResolver,
      storageService,
      logger,
    } = dependencies;
    this.bugRepository = bugRepository;
    this.userRepository = userRepository;
    this.issueTrackerService = issueTrackerService;
    this.githubConfig = githubConfig;
    this.tokenResolver = tokenResolver;
    this.storageService = storageService;
    this.logger = logger;
  }

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
        errorMessage(error),
      );
    }

    if (!ALLOWED_CATEGORIES.includes(data.category)) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        `Invalid category selected. Allowed: ${ALLOWED_CATEGORIES.join(", ")}`,
      );
    }

    if (
      data.githubRepo &&
      !isManagedRepository(this.githubConfig, data.githubRepo)
    ) {
      const response = new ResponseModel<Bug>(request.transactionId);
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        UNMANAGED_REPOSITORY_MESSAGE,
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
      // A closed account reports as a guest would
      const userResponse = refuseClosedAccount(
        await this.userRepository.findSessionUser(
          new RequestModel(request.transactionId, data.createdById),
        ),
        DomainErrorCodes.INVALID_INPUT,
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
      const response = await this.submitBug({
        transactionId: request.transactionId,
        data,
        reporterEmail,
        resolvedCreatedById,
        resolvedFile,
      });
      if (response.errorCode && resolvedFile) {
        await this.storageService.deleteFile(resolvedFile.filePath);
      }
      if (!response.errorCode) {
        // Ids and status only: never the description or the reporter's address
        const author = resolvedCreatedById
          ? `user ${resolvedCreatedById}`
          : "a guest";
        this.logger.info(
          `Bug ${response.data?.id} submitted (${response.data?.status}) by ${author}.`,
        );
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
    submission: BugSubmission,
  ): Promise<ResponseModel<Bug>> {
    const {
      transactionId,
      data,
      reporterEmail,
      resolvedCreatedById,
      resolvedFile,
    } = submission;
    // Checked by build() in createBug
    const component =
      data.component && isBugComponent(data.component)
        ? data.component
        : undefined;
    let status = "pending";
    let gitIssueNumber: number | undefined;
    let githubHtmlUrl: string | undefined;

    // Only a session tied to an existing account publishes directly; the
    // other reports wait for an administrator's approval
    if (data.githubRepo && resolvedCreatedById) {
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
        if (component) {
          issueBody += `\n*Component: ${BUG_COMPONENT_LABELS[component]}*`;
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
          { title: data.title, body: issueBody, labels: labels },
          gitHubToken,
        );
        if (issueNum) {
          status = "open";
          gitIssueNumber = issueNum;
          githubHtmlUrl = `https://github.com/${data.githubRepo}/issues/${issueNum}`;
        } else {
          this.logger.warn(
            `Bug submission refused: the issue could not be created on ${data.githubRepo}.`,
          );
          const response = new ResponseModel<Bug>(transactionId);
          return response.withErrorPromise(
            DomainErrorCodes.INVALID_INPUT,
            "Failed to push bug to GitHub repository. Please verify repository existence and permissions.",
          );
        }
      } else {
        this.logger.warn(
          `Bug submission refused: no GitHub token for ${data.githubRepo}.`,
        );
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
        component,
        githubRepo: data.githubRepo,
        createdById: resolvedCreatedById || "",
        resolvedFile,
        reporterEmail,
        status,
        logComment: submissionComment(resolvedCreatedById, status),
        gitIssueNumber,
        githubHtmlUrl,
      }),
    );
  }
}
