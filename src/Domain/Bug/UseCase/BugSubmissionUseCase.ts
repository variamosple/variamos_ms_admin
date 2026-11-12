import type { IBugTrackerConfig } from "#src/Domain/Bug/Config/IBugTrackerConfig.js";
import {
  isManagedRepository,
  UNMANAGED_REPOSITORY_MESSAGE,
} from "#src/Domain/Bug/Config/ManagedRepository.js";
import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import {
  BUG_COMPONENT_LABELS,
  type BugComponentValue,
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
  type AllowedFileType,
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

/** The issue a bug opened on GitHub. */
interface PublishedIssue {
  gitIssueNumber: number;
  githubHtmlUrl: string;
}

/** The text of the issue an administrator's report opens. */
const issueBodyOf = (
  data: BugSubmissionData,
  component: BugComponentValue | undefined,
  attachment: { url: string; type: string } | undefined,
) => {
  let issueBody = data.description || "No description provided.";
  issueBody += "\n\n---\n*Reported directly by Admin*";
  if (data.priority) {
    issueBody += `\n*Priority: ${data.priority}*`;
  }
  issueBody += `\n*Category: ${data.category}*`;
  if (component) {
    issueBody += `\n*Component: ${BUG_COMPONENT_LABELS[component]}*`;
  }
  if (attachment) {
    issueBody += `\n\n### Attachments\n- [Attachment](${attachment.url}) (Type: ${attachment.type})`;
  }
  return issueBody;
};

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
    const refuse = (message: string) =>
      new ResponseModel<Bug>(request.transactionId).withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        message,
      );
    const data = request.data;
    if (!data) return refuse("Request data is required.");

    const fileType = data.file
      ? detectAllowedFileType(data.file.content, data.file.originalName)
      : null;
    const refusal = this.refusalOf(data, fileType);
    if (refusal) return refuse(refusal);

    const reporter = await this.reporterOf(request.transactionId, data);
    if (!reporter.email) return refuse("Reporter email could not be resolved.");

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

    return this.submitOrRemoveFile({
      transactionId: request.transactionId,
      data,
      reporterEmail: reporter.email,
      resolvedCreatedById: reporter.createdById,
      resolvedFile,
    });
  }

  /** Why the submission is refused, in the order the form shows it. */
  private refusalOf(
    data: BugSubmissionData,
    fileType: AllowedFileType | null,
  ): string | null {
    if (!data.title || !data.description || !data.category) {
      return "Title, description and category are required.";
    }
    try {
      Bug.builder()
        .setTitle(data.title)
        .setDescription(data.description)
        .setPriority(data.priority)
        .setComponent(data.component)
        .build();
    } catch (error) {
      return errorMessage(error);
    }
    if (!ALLOWED_CATEGORIES.includes(data.category)) {
      return `Invalid category selected. Allowed: ${ALLOWED_CATEGORIES.join(", ")}`;
    }
    if (
      data.githubRepo &&
      !isManagedRepository(this.githubConfig, data.githubRepo)
    ) {
      return UNMANAGED_REPOSITORY_MESSAGE;
    }
    if (data.file && !fileType) {
      return `Unsupported file type. Allowed: ${ALLOWED_FILE_TYPES_LABEL}.`;
    }
    if (!data.createdById && !data.reporterEmail) {
      return "An email address is required for guest bug submissions.";
    }
    return null;
  }

  /**
   * The address and account of the reporter: those of the account when it
   * is open; a closed account reports as a guest would.
   */
  private async reporterOf(
    transactionId: string | undefined,
    data: BugSubmissionData,
  ): Promise<{ email?: string; createdById?: string }> {
    if (!data.createdById) return { email: data.reporterEmail };
    const userResponse = refuseClosedAccount(
      await this.userRepository.findSessionUser(
        new RequestModel(transactionId, data.createdById),
      ),
      DomainErrorCodes.INVALID_INPUT,
    );
    const email = userResponse.data?.email;
    return email
      ? { email, createdById: data.createdById }
      : { email: data.reporterEmail };
  }

  // The stored file is removed when the bug is not recorded
  private async submitOrRemoveFile(
    submission: BugSubmission,
  ): Promise<ResponseModel<Bug>> {
    const { resolvedFile, resolvedCreatedById } = submission;
    try {
      const response = await this.submitBug(submission);
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
    let issue: PublishedIssue | undefined;

    // Only a session tied to an existing account publishes directly; the
    // other reports wait for an administrator's approval
    if (data.githubRepo && resolvedCreatedById) {
      const published = await this.publish({
        repo: data.githubRepo,
        data,
        component,
        resolvedFile,
      });
      if (typeof published === "string") {
        return new ResponseModel<Bug>(transactionId).withErrorPromise(
          DomainErrorCodes.INVALID_INPUT,
          published,
        );
      }
      status = "open";
      issue = published;
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
        gitIssueNumber: issue?.gitIssueNumber,
        githubHtmlUrl: issue?.githubHtmlUrl,
      }),
    );
  }

  /** Opens the GitHub issue of the bug; a string tells why it failed. */
  private async publish(bug: {
    repo: string;
    data: BugSubmissionData;
    component: BugComponentValue | undefined;
    resolvedFile: StoredFile | undefined;
  }): Promise<PublishedIssue | string> {
    const { repo, data, component, resolvedFile } = bug;
    const gitHubToken = await this.tokenResolver.resolveGitHubToken(repo);
    if (!gitHubToken) {
      this.logger.warn(`Bug submission refused: no GitHub token for ${repo}.`);
      return "GitHub integration token is not configured.";
    }
    const attachment = resolvedFile && {
      url: `${this.githubConfig.getApiBaseUrl?.() || "http://localhost:4000"}${resolvedFile.filePath}`,
      type: resolvedFile.fileType,
    };
    const labels = ["bug", data.category.toLowerCase()];
    if (data.priority) {
      labels.push(data.priority.toLowerCase());
    }
    const issueNum = await this.issueTrackerService.createIssue(
      repo,
      {
        title: data.title,
        body: issueBodyOf(data, component, attachment),
        labels,
      },
      gitHubToken,
    );
    if (!issueNum) {
      this.logger.warn(
        `Bug submission refused: the issue could not be created on ${repo}.`,
      );
      return "Failed to push bug to GitHub repository. Please verify repository existence and permissions.";
    }
    return {
      gitIssueNumber: issueNum,
      githubHtmlUrl: `https://github.com/${repo}/issues/${issueNum}`,
    };
  }
}
