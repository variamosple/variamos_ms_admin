/**
 * Gives the token to call GitHub for a repository: an App installation token
 * when the App is configured, else the configured personal token, else "".
 * Implemented in Infrastructure, where the HTTP client lives (T-18 lot 3a).
 */
export interface IGitHubTokenProvider {
  resolveGitHubToken(repo: string): Promise<string>;
}
