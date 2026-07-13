import { IBugTrackerConfig } from "../Config/IBugTrackerConfig";
import crypto from "crypto";
import axios from "axios";
import logger from "jet-logger";

export class GitHubTokenResolver {
  public readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  public constructor(private readonly githubConfig: IBugTrackerConfig) {}

  public async resolveGitHubToken(repo: string): Promise<string> {
    const appId = this.githubConfig.getGitHubAppId?.()?.trim();
    const privateKey = this.githubConfig.getGitHubPrivateKey?.()?.trim();

    if (appId && privateKey) {
      try {
        const cached = this.tokenCache.get(repo);
        if (cached && cached.expiresAt > Date.now() + 120000) {
          return cached.token;
        }

        const jwt = this.generateAppJwt(appId, privateKey);

        const installUrl = `https://api.github.com/repos/${repo}/installation`;
        const installResponse = await axios.get<{ id: number }>(installUrl, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "VariaMos-MS-Admin",
          },
        });
        const installationId = installResponse.data.id;

        const tokenUrl = `https://api.github.com/app/installations/${installationId}/access_tokens`;
        const tokenResponse = await axios.post<{ token: string; expires_at: string }>(
          tokenUrl,
          {},
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "VariaMos-MS-Admin",
            },
          },
        );

        const token = tokenResponse.data.token;
        const expiresAt = new Date(tokenResponse.data.expires_at).getTime();

        this.tokenCache.set(repo, { token, expiresAt });
        return token;
      } catch (error) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        logger.err(
          `Failed to resolve GitHub App token for ${repo}: ` +
            (err.response?.data?.message || err.message || "Unknown error"),
        );
      }
    }

    return this.githubConfig.getGitHubToken()?.trim() || "";
  }

  private generateAppJwt(appId: string, privateKey: string): string {
    // cspell:disable-next-line
    const header = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9"; // base64url for {"alg":"RS256","typ":"JWT"}
    const now = Math.floor(Date.now() / 1000) - 60; // 1 min clock skew
    const payload = Buffer.from(
      JSON.stringify({
        iat: now,
        exp: now + 600, // 10 minutes
        iss: appId,
      }),
    ).toString("base64url");

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${header}.${payload}`);
    const formattedKey = privateKey.replace(/\\n/g, "\n");
    const signature = sign.sign(formattedKey, "base64url");

    return `${header}.${payload}.${signature}`;
  }
}
