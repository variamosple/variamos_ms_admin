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
  getIssues(repo: string, token: string): Promise<any[] | null>;
}
