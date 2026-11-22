import axios, { type AxiosInstance } from "axios";

/**
 * A GitHub that does not answer gives up after 10 s (ADM-N33): it held the
 * approval of a bug and the synchronization for as long as the connection
 * stayed open.
 */
export const GITHUB_TIMEOUT_MS = 10_000;

/** The HTTP client of the GitHub calls, with its time limit. */
export const createGitHubHttp = (
  timeoutMs: number = GITHUB_TIMEOUT_MS,
): AxiosInstance => axios.create({ timeout: timeoutMs });
