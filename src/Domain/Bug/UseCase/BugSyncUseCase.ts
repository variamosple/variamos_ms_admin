import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import { IIssueTrackerService } from "@src/Domain/Core/Service/IIssueTrackerService";
import { IBugTrackerConfig } from "@src/Domain/Bug/Config/IBugTrackerConfig";
import { GitHubTokenResolver } from "@src/Domain/Bug/Service/GitHubTokenResolver";
import { Bug } from "@src/Domain/Bug/Entity/Bug";
import { ALLOWED_CATEGORIES } from "./BugQueryUseCase";
import logger from "jet-logger";

export class BugSyncUseCase {
  public constructor(
    private readonly bugRepository: IBugRepository,
    private readonly issueTrackerService: IIssueTrackerService,
    private readonly githubConfig: IBugTrackerConfig,
    private readonly tokenResolver: GitHubTokenResolver,
  ) {}

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
        const token = await this.tokenResolver.resolveGitHubToken(repo);
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
}
