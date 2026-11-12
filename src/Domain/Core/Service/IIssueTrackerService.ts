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

/** What an issue opened from a bug says. */
export interface IssueContent {
  title: string;
  body: string;
  labels: string[];
}

export interface IIssueTrackerService {
  createIssue(
    repo: string,
    issue: IssueContent,
    token: string,
  ): Promise<number | null>;
  closeIssue(
    repo: string,
    issueNumber: number,
    token: string,
  ): Promise<boolean>;
  reopenIssue(
    repo: string,
    issueNumber: number,
    token: string,
  ): Promise<boolean>;
  addLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
    token: string,
  ): Promise<boolean>;
  /** Succeeds when the label is already absent. */
  removeLabel(
    repo: string,
    issueNumber: number,
    label: string,
    token: string,
  ): Promise<boolean>;
  getIssues(repo: string, token: string): Promise<GitHubIssue[] | null>;
}
