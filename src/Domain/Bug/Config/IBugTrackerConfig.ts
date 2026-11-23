export interface IBugTrackerConfig {
  getGitHubToken(): string;
  getGitHubManagedRepos(): string[];
  getGitHubAppId?(): string;
  getGitHubPrivateKey?(): string;
}
