import axios from "axios";
import logger from "#src/common/logger.js";
import type {
  GitHubIssue,
  IIssueTrackerService,
} from "#src/Domain/Core/Service/IIssueTrackerService.js";

interface GitHubError {
  response?: {
    data?: string;
  };
  message?: string;
}

// 10,000 issues: a bound against a Link header that never ends
export const MAX_ISSUE_PAGES = 100;

/**
 * URL of the next page in a GitHub Link header, null on the last page. Only
 * a GitHub API URL is followed: the token goes with the request.
 */
export function nextPageOf(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1];
  return next?.startsWith("https://api.github.com/") ? next : null;
}

export class GitHubIssuesService implements IIssueTrackerService {
  private getHeaders(token: string) {
    return {
      "Content-Type": "application/json",
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
    };
  }

  public async createIssue(
    repo: string,
    title: string,
    body: string,
    labels: string[],
    token: string,
  ): Promise<number | null> {
    const url = `https://api.github.com/repos/${repo}/issues`;

    try {
      const response = await axios.post<{ number: number }>(
        url,
        {
          title,
          body,
          labels,
        },
        {
          headers: this.getHeaders(token),
        },
      );
      return response.data.number;
    } catch (error) {
      const err = error as GitHubError;
      logger.err(`GitHub error [createIssue] on ${repo}:`);
      logger.err(err.response?.data || err.message || "Unknown error");
      return null;
    }
  }

  public async updateIssue(
    repo: string,
    issueNumber: number,
    title: string,
    body: string,
    labels: string[],
    token: string,
  ): Promise<boolean> {
    const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}`;

    try {
      await axios.patch(
        url,
        {
          title,
          body,
          labels,
        },
        {
          headers: this.getHeaders(token),
        },
      );
      return true;
    } catch (error) {
      const err = error as GitHubError;
      logger.err(`GitHub error [updateIssue] on ${repo}:`);
      logger.err(err.response?.data || err.message || "Unknown error");
      return false;
    }
  }

  public async closeIssue(
    repo: string,
    issueNumber: number,
    token: string,
  ): Promise<boolean> {
    const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}`;

    try {
      await axios.patch(
        url,
        // A bug is closed once fixed: "not planned" is not used, a rejected
        // bug never reaches GitHub
        { state: "closed", state_reason: "completed" },
        { headers: this.getHeaders(token) },
      );
      return true;
    } catch (error) {
      const err = error as GitHubError;
      logger.err(`GitHub error [closeIssue] on ${repo}:`);
      logger.err(err.response?.data || err.message || "Unknown error");
      return false;
    }
  }

  public async reopenIssue(
    repo: string,
    issueNumber: number,
    token: string,
  ): Promise<boolean> {
    const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}`;

    try {
      await axios.patch(
        url,
        { state: "open" },
        { headers: this.getHeaders(token) },
      );
      return true;
    } catch (error) {
      const err = error as GitHubError;
      logger.err(`GitHub error [reopenIssue] on ${repo}:`);
      logger.err(err.response?.data || err.message || "Unknown error");
      return false;
    }
  }

  public async addLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
    token: string,
  ): Promise<boolean> {
    const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels`;

    try {
      await axios.post(url, { labels }, { headers: this.getHeaders(token) });
      return true;
    } catch (error) {
      const err = error as GitHubError;
      logger.err(`GitHub error [addLabels] on ${repo}:`);
      logger.err(err.response?.data || err.message || "Unknown error");
      return false;
    }
  }

  public async removeLabel(
    repo: string,
    issueNumber: number,
    label: string,
    token: string,
  ): Promise<boolean> {
    const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`;

    try {
      await axios.delete(url, { headers: this.getHeaders(token) });
      return true;
    } catch (error) {
      const err = error as GitHubError & { response?: { status?: number } };
      // 404: the label was not on the issue, which is the expected end state
      if (err.response?.status === 404) return true;
      logger.err(`GitHub error [removeLabel] on ${repo}:`);
      logger.err(err.response?.data || err.message || "Unknown error");
      return false;
    }
  }

  /**
   * Every issue of the repository: GitHub returns 100 per page and gives
   * the next page in the Link header (EV-101, OPT-10). Null when a page
   * cannot be read, so a sync never works on part of the issues.
   */
  public async getIssues(
    repo: string,
    token: string,
  ): Promise<GitHubIssue[] | null> {
    const issues: GitHubIssue[] = [];
    let url: string | null =
      `https://api.github.com/repos/${repo}/issues?state=all&per_page=100`;

    try {
      for (let page = 1; url; page++) {
        if (page > MAX_ISSUE_PAGES) {
          logger.err(
            `GitHub error [getIssues] on ${repo}: more than ${MAX_ISSUE_PAGES} pages`,
          );
          return null;
        }
        const response = await axios.get<GitHubIssue[]>(url, {
          headers: this.getHeaders(token),
        });
        issues.push(...response.data);
        url = nextPageOf(response.headers?.link);
      }
      return issues;
    } catch (error) {
      const err = error as GitHubError;
      logger.err(`GitHub error [getIssues] on ${repo}:`);
      logger.err(err.response?.data || err.message || "Unknown error");
      return null;
    }
  }
}

export const GitHubIssuesServiceInstance = new GitHubIssuesService();
