import { createPrivateKey } from "node:crypto";

/**
 * The private key of the GitHub App as the environment holds it: the line
 * breaks may come escaped (`\n`) from a one-line variable.
 */
export function formatGitHubPrivateKey(privateKey: string): string {
  return privateKey.trim().replace(/\\n/g, "\n");
}

/** True when the key can sign the tokens of the GitHub App. */
export function isReadableGitHubPrivateKey(privateKey: string): boolean {
  try {
    createPrivateKey(formatGitHubPrivateKey(privateKey));
    return true;
  } catch {
    return false;
  }
}
