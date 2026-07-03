import axios from "axios";
import { IIssueTrackerService } from "@src/Domain/Core/Service/IIssueTrackerService";

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
      const response = await axios.post(
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
      console.error(
        `GitHub error [createIssue] on ${repo}:`,
        error.response?.data || error.message,
      );
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
      console.error(
        `GitHub error [updateIssue] on ${repo}:`,
        error.response?.data || error.message,
      );
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
        { state: "closed" },
        { headers: this.getHeaders(token) },
      );
      return true;
    } catch (error) {
      console.error(
        `GitHub error [closeIssue] on ${repo}:`,
        error.response?.data || error.message,
      );
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
      console.error(
        `GitHub error [reopenIssue] on ${repo}:`,
        error.response?.data || error.message,
      );
      return false;
    }
  }

  public async getIssues(repo: string, token: string): Promise<any[] | null> {
    const url = `https://api.github.com/repos/${repo}/issues?state=all&per_page=100`;

    try {
      const response = await axios.get(url, {
        headers: this.getHeaders(token),
      });
      return response.data;
    } catch (error) {
      console.error(
        `GitHub error [getIssues] on ${repo}:`,
        error.response?.data || error.message,
      );
      return null;
    }
  }
}

export const GitHubIssuesServiceInstance = new GitHubIssuesService();
