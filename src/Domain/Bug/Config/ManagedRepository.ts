import type { IBugTrackerConfig } from "./IBugTrackerConfig.js";

export const UNMANAGED_REPOSITORY_MESSAGE =
  "This repository is not managed by VariaMos.";

/**
 * Issues are written only to the repositories listed in GITHUB_MANAGED_REPOS:
 * the GitHub credentials of the server must not reach any other repository.
 * An empty list publishes nowhere.
 */
export function isManagedRepository(
  config: Pick<IBugTrackerConfig, "getGitHubManagedRepos">,
  repository: string,
): boolean {
  return config.getGitHubManagedRepos().includes(repository);
}
