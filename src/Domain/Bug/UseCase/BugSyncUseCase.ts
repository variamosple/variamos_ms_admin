import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import type { IBugTrackerConfig } from "#src/Domain/Bug/Config/IBugTrackerConfig.js";
import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import { BugFilter } from "#src/Domain/Bug/Entity/BugFilter.js";
import type { BugPriorityValue } from "#src/Domain/Bug/Entity/BugPriority.js";
import { statusFromGitHub } from "#src/Domain/Bug/Entity/BugStatus.js";
import type { IBugRepository } from "#src/Domain/Bug/Repository/IBugRepository.js";
import type { IGitHubTokenProvider } from "#src/Domain/Bug/Service/IGitHubTokenProvider.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { INTERNAL_ERROR_MESSAGE } from "#src/Domain/Core/Error/InternalErrorMessage.js";
import type { IIssueTrackerService } from "#src/Domain/Core/Service/IIssueTrackerService.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { ALLOWED_CATEGORIES } from "./BugQueryUseCase.js";

/** What the GitHub sync of the bugs reads and writes. */
export interface BugSyncUseCaseDependencies {
  bugRepository: IBugRepository;
  issueTrackerService: IIssueTrackerService;
  githubConfig: IBugTrackerConfig;
  tokenResolver: IGitHubTokenProvider;
  logger: ILogger;
  journal: IActivityJournal;
}

export class BugSyncUseCase {
  private running: Promise<ResponseModel<void>> | null = null;

  private readonly bugRepository: IBugRepository;
  private readonly issueTrackerService: IIssueTrackerService;
  private readonly githubConfig: IBugTrackerConfig;
  private readonly tokenResolver: IGitHubTokenProvider;
  private readonly logger: ILogger;
  private readonly journal: IActivityJournal;

  public constructor(dependencies: BugSyncUseCaseDependencies) {
    const {
      bugRepository,
      issueTrackerService,
      githubConfig,
      tokenResolver,
      logger,
      journal,
    } = dependencies;
    this.bugRepository = bugRepository;
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
      const appId = this.githubConfig.getGitHubAppId?.()?.trim();
      const privateKey = this.githubConfig.getGitHubPrivateKey?.()?.trim();
      const patToken = this.githubConfig.getGitHubToken()?.trim();

      const hasAppConfig = Boolean(appId && privateKey);
      const hasPatConfig = Boolean(patToken);

      if (!hasAppConfig && !hasPatConfig) {
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
        const token = await this.tokenResolver.resolveGitHubToken(repo);
        if (!token) {
          this.logger.warn(
            `GitHub token could not be resolved for repo: ${repo}. Skipping.`,
          );
          continue;
        }
        const issues = await this.issueTrackerService.getIssues(repo, token);
        if (!issues) continue;

        // Without the local statuses, a synchronization would bring In
        // Progress or Resolved back to open or closed: the repository waits
        const localStatuses = await this.localStatusesOf(
          repo,
          request.transactionId,
        );
        if (!localStatuses) {
          this.logger.warn(
            `Local bugs of ${repo} could not be read. Skipping its synchronization.`,
          );
          continue;
        }

        for (const issue of issues) {
          if (issue.pull_request) continue;

          let priority: BugPriorityValue = "medium";
          let category: string | undefined;
          if (issue.labels && Array.isArray(issue.labels)) {
            const labelNames = issue.labels.map((l) => l.name.toLowerCase());
            // "critical" is a priority of its own since EV-84 lot 5; read
            // back as "high", it would be downgraded at every sync
            if (
              labelNames.some(
                (n: string) =>
                  n.includes("critical") ||
                  n.includes("p0") ||
                  n.includes("blocker"),
              )
            ) {
              priority = "critical";
            } else if (
              labelNames.some(
                (n: string) =>
                  n.includes("high") ||
                  n.includes("p1") ||
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
            .setStatus(
              statusFromGitHub(issue.state, localStatuses.get(issue.number)),
            )
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

      this.logger.info(
        `Synchronization finished: Created ${totalCreated} and Updated ${totalUpdated} bugs.`,
      );
    } catch (error) {
      this.logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  private async localStatusesOf(
    repo: string,
    transactionId: string | undefined,
  ): Promise<Map<number, string> | null> {
    const response = await this.bugRepository.queryBugs(
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
