import axios from "axios";
import { IIssueTrackerService, GitHubIssue } from "@src/Domain/Core/Service/IIssueTrackerService";
import logger from "jet-logger";

interface GitHubError {
  response?: {
    data?: string;
  };
  message?: string;
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

  public async closeIssue(repo: string, issueNumber: number, token: string): Promise<boolean> {
    const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}`;

    try {
      await axios.patch(url, { state: "closed" }, { headers: this.getHeaders(token) });
      return true;
    } catch (error) {
      const err = error as GitHubError;
      logger.err(`GitHub error [closeIssue] on ${repo}:`);
      logger.err(err.response?.data || err.message || "Unknown error");
      return false;
    }
  }

  public async reopenIssue(repo: string, issueNumber: number, token: string): Promise<boolean> {
    const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}`;

    try {
      await axios.patch(url, { state: "open" }, { headers: this.getHeaders(token) });
      return true;
    } catch (error) {
      const err = error as GitHubError;
      logger.err(`GitHub error [reopenIssue] on ${repo}:`);
      logger.err(err.response?.data || err.message || "Unknown error");
      return false;
    }
  }

  public async getIssues(repo: string, token: string): Promise<GitHubIssue[] | null> {
    const url = `https://api.github.com/repos/${repo}/issues?state=all&per_page=100`;

    try {
      const response = await axios.get<GitHubIssue[]>(url, {
        headers: this.getHeaders(token),
      });
      return response.data;
    } catch (error) {
      const err = error as GitHubError;
      logger.err(`GitHub error [getIssues] on ${repo}:`);
      logger.err(err.response?.data || err.message || "Unknown error");
      return null;
    }
  }
}

export const GitHubIssuesServiceInstance = new GitHubIssuesService();
