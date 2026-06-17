export interface IBugTrackerConfig {
  getGitHubToken(): string;
  getGitHubManagedRepos(): string[];
}
