import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import type { IBugTrackerConfig } from "#src/Domain/Bug/Config/IBugTrackerConfig.js";
import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import { BugFilter } from "#src/Domain/Bug/Entity/BugFilter.js";
import type { BugPriorityValue } from "#src/Domain/Bug/Entity/BugPriority.js";
import { statusFromGitHub } from "#src/Domain/Bug/Entity/BugStatus.js";
import type { BugRepositories } from "#src/Domain/Bug/Repository/BugRepositories.js";
import type { IGitHubTokenProvider } from "#src/Domain/Bug/Service/IGitHubTokenProvider.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { INTERNAL_ERROR_MESSAGE } from "#src/Domain/Core/Error/InternalErrorMessage.js";
import type {
  GitHubIssue,
  IIssueTrackerService,
} from "#src/Domain/Core/Service/IIssueTrackerService.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { ALLOWED_CATEGORIES } from "./BugQueryUseCase.js";

/** Bugs created and updated by the synchronization of one repository. */
interface SyncCounts {
  created: number;
  updated: number;
}

// A repository skipped saves nothing
const NOTHING_SAVED: Readonly<SyncCounts> = { created: 0, updated: 0 };

// The first group a label falls in gives the priority; "critical" is a
// priority of its own since EV-84 lot 5: read back as "high", it would be
// downgraded at every sync
const PRIORITY_LABELS: readonly [BugPriorityValue, readonly string[]][] = [
  ["critical", ["critical", "p0", "blocker"]],
  ["high", ["high", "p1", "urg", "important"]],
  ["low", ["low", "p3", "minor"]],
];

const priorityOf = (labels: string[]): BugPriorityValue =>
  PRIORITY_LABELS.find(([, words]) =>
    labels.some((label) => words.some((word) => label.includes(word))),
  )?.[0] ?? "medium";

// The first label that names a known category
const categoryOf = (labels: string[]): string | undefined => {
  for (const label of labels) {
    const category = ALLOWED_CATEGORIES.find(
      (allowed) => allowed.toLowerCase() === label,
    );
    if (category) return category;
  }
  return undefined;
};

/** The bug a GitHub issue stands for, keeping its local status. */
const bugOfIssue = (
  issue: GitHubIssue,
  repo: string,
  localStatus: string | undefined,
): Bug => {
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((label) => label.name.toLowerCase())
    : [];
  return Bug.builder()
    .setTitle(issue.title)
    .setDescription(issue.body || "No description provided.")
    .setPriority(priorityOf(labels))
    .setCategory(categoryOf(labels))
    .setStatus(statusFromGitHub(issue.state, localStatus))
    .setGithubRepo(repo)
    .setGitIssueNumber(issue.number)
    .setGithubCreator(issue.user?.login || "System")
    .setGithubHtmlUrl(issue.html_url || "")
    .setGithubAssignee(issue.assignee?.login || undefined)
    .setCreatedAt(new Date(issue.created_at || ""))
    .setUpdatedAt(new Date(issue.updated_at || issue.created_at || ""))
    .build();
};

/** What the GitHub sync of the bugs reads and writes. */
export interface BugSyncUseCaseDependencies {
  repositories: Pick<BugRepositories, "bugs" | "queries">;
  issueTrackerService: IIssueTrackerService;
  githubConfig: IBugTrackerConfig;
  tokenResolver: IGitHubTokenProvider;
  logger: ILogger;
  journal: IActivityJournal;
}

export class BugSyncUseCase {
  private running: Promise<ResponseModel<void>> | null = null;

  private readonly repositories: Pick<BugRepositories, "bugs" | "queries">;
  private readonly issueTrackerService: IIssueTrackerService;
  private readonly githubConfig: IBugTrackerConfig;
  private readonly tokenResolver: IGitHubTokenProvider;
  private readonly logger: ILogger;
  private readonly journal: IActivityJournal;

  public constructor(dependencies: BugSyncUseCaseDependencies) {
    const {
      repositories,
      issueTrackerService,
      githubConfig,
      tokenResolver,
      logger,
      journal,
    } = dependencies;
    this.repositories = repositories;
    this.issueTrackerService = issueTrackerService;
    this.githubConfig = githubConfig;
    this.tokenResolver = tokenResolver;
    this.logger = logger;
    this.journal = journal;
  }

  /**
   * One synchronization at a time (EV-18): a call made while one runs, from
   * the schedule or the sync button, gets the result of the running one
   * rather than reading GitHub a second time and creating the same bugs.
   * A synchronization asked by an administrator is recorded in the activity
   * journal; the scheduled one, with no actor, is not.
   */
  public syncBugs(request: RequestModel<void>): Promise<ResponseModel<void>> {
    this.running ??= this.synchronize(request).finally(() => {
      this.running = null;
    });
    const running = this.running;
    if (!request.actorId) return running;
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "bug.sync",
        entityType: "bug",
        transactionId: request.transactionId,
      },
      () => running,
    );
  }

  private async synchronize(
    request: RequestModel<void>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      if (!this.isConfigured()) {
        this.logger.warn(
          "GitHub token is not defined in environment variables. Synchronization aborted.",
        );
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "GitHub Sync is not configured.",
        );
      }

      const repos = this.githubConfig.getGitHubManagedRepos();
      this.logger.info(`Starting bugs sync for repos: ${repos.join(", ")}`);

      let totalCreated = 0;
      let totalUpdated = 0;
      for (const repo of repos) {
        const counts = await this.synchronizeRepo(repo, request.transactionId);
        totalCreated += counts.created;
        totalUpdated += counts.updated;
      }

      this.logger.info(
        `Synchronization finished: Created ${totalCreated} and Updated ${totalUpdated} bugs.`,
      );
    } catch (error) {
      this.logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  // A GitHub App, or else a personal token
  private isConfigured(): boolean {
    const appId = this.githubConfig.getGitHubAppId?.()?.trim();
    const privateKey = this.githubConfig.getGitHubPrivateKey?.()?.trim();
    const patToken = this.githubConfig.getGitHubToken()?.trim();
    return Boolean(appId && privateKey) || Boolean(patToken);
  }

  /** Saves the issues of one repository; a repository that fails is skipped. */
  private async synchronizeRepo(
    repo: string,
    transactionId: string | undefined,
  ): Promise<SyncCounts> {
    const token = await this.tokenResolver.resolveGitHubToken(repo);
    if (!token) {
      this.logger.warn(
        `GitHub token could not be resolved for repo: ${repo}. Skipping.`,
      );
      return NOTHING_SAVED;
    }
    const issues = await this.issueTrackerService.getIssues(repo, token);
    if (!issues) return NOTHING_SAVED;

    // Without the local statuses, a synchronization would bring In
    // Progress or Resolved back to open or closed: the repository waits
    const localStatuses = await this.localStatusesOf(repo, transactionId);
    if (!localStatuses) {
      this.logger.warn(
        `Local bugs of ${repo} could not be read. Skipping its synchronization.`,
      );
      return NOTHING_SAVED;
    }

    let created = 0;
    let updated = 0;
    for (const issue of issues) {
      if (issue.pull_request) continue;
      const bug = bugOfIssue(issue, repo, localStatuses.get(issue.number));
      const saveResponse = await this.repositories.bugs.saveOrUpdateBug(
        new RequestModel(transactionId, bug),
      );
      if (saveResponse.data?.created) created++;
      if (saveResponse.data?.updated) updated++;
    }
    return { created, updated };
  }

  private async localStatusesOf(
    repo: string,
    transactionId: string | undefined,
  ): Promise<Map<number, string> | null> {
    const response = await this.repositories.queries.queryBugs(
      new RequestModel(
        transactionId,
        new BugFilter({
          repo,
        }),
      ),
    );
    if (response.errorCode || !response.data) return null;
    const statuses = new Map<number, string>();
    for (const bug of response.data) {
      if (bug.gitIssueNumber) statuses.set(bug.gitIssueNumber, bug.status);
    }
    return statuses;
  }
}
