import type { IBugTrackerConfig } from "#src/Domain/Bug/Config/IBugTrackerConfig.js";
import {
  isManagedRepository,
  UNMANAGED_REPOSITORY_MESSAGE,
} from "#src/Domain/Bug/Config/ManagedRepository.js";
import type { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import {
  IN_PROGRESS_LABEL,
  isIssueOpen,
} from "#src/Domain/Bug/Entity/BugStatus.js";
import type { IGitHubTokenProvider } from "#src/Domain/Bug/Service/IGitHubTokenProvider.js";
import type { IIssueTrackerService } from "#src/Domain/Core/Service/IIssueTrackerService.js";
import { approvedIssueOf } from "./bugApproval.js";

/** The issue an approved bug opened on GitHub. */
export interface PublishedIssue {
  gitIssueNumber: number;
  githubHtmlUrl: string;
}

/** What the issue side of a bug needs: the managed repositories and their tokens. */
export interface BugIssueSyncDependencies {
  githubConfig: IBugTrackerConfig;
  tokenResolver: IGitHubTokenProvider;
  issueTrackerService: IIssueTrackerService;
}

/** The GitHub issue of a bug: opened on approval, then kept in step with its status. */
export class BugIssueSync {
  private readonly githubConfig: IBugTrackerConfig;
  private readonly tokenResolver: IGitHubTokenProvider;
  private readonly issueTrackerService: IIssueTrackerService;

  public constructor(dependencies: BugIssueSyncDependencies) {
    this.githubConfig = dependencies.githubConfig;
    this.tokenResolver = dependencies.tokenResolver;
    this.issueTrackerService = dependencies.issueTrackerService;
  }

  /** Opens the issue of an approved bug; a string tells why it failed. */
  public async publishApproved(
    bug: Bug,
    repo: string,
    comment: string | undefined,
  ): Promise<PublishedIssue | string> {
    if (!isManagedRepository(this.githubConfig, repo)) {
      return UNMANAGED_REPOSITORY_MESSAGE;
    }
    const gitHubToken = await this.tokenResolver.resolveGitHubToken(repo);
    if (!gitHubToken) return "GitHub integration token is not configured.";
    const apiBaseUrl =
      this.githubConfig.getApiBaseUrl?.() || "http://localhost:4000";
    const issueNum = await this.issueTrackerService.createIssue(
      repo,
      approvedIssueOf(bug, comment, apiBaseUrl),
      gitHubToken,
    );
    if (!issueNum) {
      return "Failed to push bug to GitHub repository. Please verify repository existence and permissions.";
    }
    return {
      gitIssueNumber: issueNum,
      githubHtmlUrl: `https://github.com/${repo}/issues/${issueNum}`,
    };
  }

  /** Closes, reopens and labels the issue as the status moves; false on failure. */
  public async applyStatusOnGitHub(
    repo: string,
    issueNumber: number,
    from: string,
    to: string,
  ): Promise<boolean> {
    const token = await this.tokenResolver.resolveGitHubToken(repo);
    if (!token) return false;

    const wasOpen = isIssueOpen(from);
    const willBeOpen = isIssueOpen(to);
    if (wasOpen && !willBeOpen) {
      if (
        !(await this.issueTrackerService.closeIssue(repo, issueNumber, token))
      )
        return false;
    } else if (
      !wasOpen &&
      willBeOpen &&
      !(await this.issueTrackerService.reopenIssue(repo, issueNumber, token))
    ) {
      return false;
    }

    // The label only refines an open issue: a failure is logged by the
    // service and does not block the status
    if (to === "in_progress") {
      await this.issueTrackerService.addLabels(
        repo,
        issueNumber,
        [IN_PROGRESS_LABEL],
        token,
      );
    } else if (from === "in_progress") {
      await this.issueTrackerService.removeLabel(
        repo,
        issueNumber,
        IN_PROGRESS_LABEL,
        token,
      );
    }
    return true;
  }
}
