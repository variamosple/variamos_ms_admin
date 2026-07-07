export interface GitHubIssueLabel {
  name: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  state?: string;
  html_url?: string | null;
  pull_request?: object | null;
  labels?: GitHubIssueLabel[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  user?: { login?: string } | null;
  assignee?: { login?: string } | null;
}

export interface IIssueTrackerService {
  createIssue(
    repo: string,
    title: string,
    body: string,
    labels: string[],
    token: string,
  ): Promise<number | null>;
  updateIssue(
    repo: string,
    issueNumber: number,
    title: string,
    body: string,
    labels: string[],
    token: string,
  ): Promise<boolean>;
  closeIssue(repo: string, issueNumber: number, token: string): Promise<boolean>;
  reopenIssue(repo: string, issueNumber: number, token: string): Promise<boolean>;
  getIssues(repo: string, token: string): Promise<GitHubIssue[] | null>;
}
