import { mock, MockProxy } from "jest-mock-extended";
import { GitHubTokenResolver } from "./GitHubTokenResolver";
import { IBugTrackerConfig } from "../Config/IBugTrackerConfig";
import axios from "axios";
import crypto from "crypto";
import logger from "jet-logger";

jest.mock("axios");
jest.mock("jet-logger");
jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return {
    ...actual,
    createSign: jest.fn(),
  };
});

describe("GitHubTokenResolver - Unit Tests", () => {
  let resolver: GitHubTokenResolver;
  let mockConfig: MockProxy<IBugTrackerConfig>;
  let mockSign: { update: jest.Mock; sign: jest.Mock };
  let dateSpy: jest.SpyInstance;
  const mockNow = 1711800000000; // Fixed timestamp: 1711800000 seconds

  beforeEach(() => {
    jest.clearAllMocks();
    dateSpy = jest.spyOn(Date, "now").mockReturnValue(mockNow);
    mockConfig = mock<IBugTrackerConfig>();
    resolver = new GitHubTokenResolver(mockConfig);

    mockSign = {
      update: jest.fn(),
      sign: jest.fn().mockReturnValue("mock-signature"),
    };
    (crypto.createSign as jest.Mock).mockReturnValue(mockSign);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  describe("resolveGitHubToken", () => {
    it("should return the cached token if it is valid and not close to expiry", async () => {
      mockConfig.getGitHubAppId = jest.fn().mockReturnValue("12345");
      mockConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("mock-key");

      resolver.tokenCache.set("VariaMos/VariaMosAdmin", {
        token: "cached-token",
        expiresAt: Date.now() + 300000, // 5 minutes in future (> 120s skew)
      });

      const token = await resolver.resolveGitHubToken("VariaMos/VariaMosAdmin");
      expect(token).toBe("cached-token");
      expect(axios.get).not.toHaveBeenCalled();
    });

    it("should fetch new token using GitHub App JWT and update cache on miss", async () => {
      mockConfig.getGitHubAppId = jest.fn().mockReturnValue("  12345  ");
      // Passing private key with \n to test replace logic and spaces to test trim
      mockConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("  mock\\nkey  ");

      (axios.get as jest.Mock).mockResolvedValue({
        data: { id: 987 },
      });
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          token: "new-app-token",
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      });

      const token = await resolver.resolveGitHubToken("VariaMos/VariaMosAdmin");
      expect(token).toBe("new-app-token");

      // Verify crypto.createSign was called with "RSA-SHA256" to kill SL mutant at line 76
      expect(crypto.createSign).toHaveBeenCalledWith("RSA-SHA256");

      // Expected iat & exp based on mockNow
      const expectedIat = Math.floor(mockNow / 1000) - 60; // 1711799940
      const expectedExp = expectedIat + 600; // 1711800540

      const expectedPayloadB64 = Buffer.from(
        JSON.stringify({
          iat: expectedIat,
          exp: expectedExp,
          iss: "12345",
        }),
      ).toString("base64url");

      // cspell:disable-next-line
      const expectedHeaderB64 = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9";
      const expectedJwt = `${expectedHeaderB64}.${expectedPayloadB64}.mock-signature`;

      // Verify sign.update was called with exact header and payload to kill SL mutant at line 77
      expect(mockSign.update).toHaveBeenCalledWith(`${expectedHeaderB64}.${expectedPayloadB64}`);

      // Verify sign.sign was called with formatted private key to kill SL mutant at line 78
      expect(mockSign.sign).toHaveBeenCalledWith("mock\nkey", "base64url");

      // Verify exact call parameters for axios.get to kill ObjectLiteral & StringLiteral mutants
      expect(axios.get).toHaveBeenCalledWith(
        "https://api.github.com/repos/VariaMos/VariaMosAdmin/installation",
        {
          headers: {
            Authorization: `Bearer ${expectedJwt}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "VariaMos-MS-Admin",
          },
        },
      );

      // Verify exact call parameters for axios.post to kill ObjectLiteral & StringLiteral mutants
      expect(axios.post).toHaveBeenCalledWith(
        "https://api.github.com/app/installations/987/access_tokens",
        {},
        {
          headers: {
            Authorization: `Bearer ${expectedJwt}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "VariaMos-MS-Admin",
          },
        },
      );

      // Verify second call hits cache
      (axios.get as jest.Mock).mockClear();
      const token2 = await resolver.resolveGitHubToken("VariaMos/VariaMosAdmin");
      expect(token2).toBe("new-app-token");
      expect(axios.get).not.toHaveBeenCalled();
    });

    it("should fetch new token if cached token is close to expiry (skew check for ArithmeticOperator mutant)", async () => {
      mockConfig.getGitHubAppId = jest.fn().mockReturnValue("12345");
      mockConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("mock-key");

      // Set token that expires in 60s (less than the 120s skew limit)
      resolver.tokenCache.set("VariaMos/VariaMosAdmin", {
        token: "about-to-expire",
        expiresAt: Date.now() + 60000,
      });

      (axios.get as jest.Mock).mockResolvedValue({
        data: { id: 987 },
      });
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          token: "refreshed-token",
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      });

      const token = await resolver.resolveGitHubToken("VariaMos/VariaMosAdmin");
      expect(token).toBe("refreshed-token");
      expect(axios.get).toHaveBeenCalled();
    });

    it("should fall back to personal github token if app credentials are missing", async () => {
      mockConfig.getGitHubAppId = jest.fn().mockReturnValue(undefined);
      mockConfig.getGitHubPrivateKey = jest.fn().mockReturnValue(undefined);
      mockConfig.getGitHubToken.mockReturnValue("  personal-token  ");

      const token = await resolver.resolveGitHubToken("VariaMos/VariaMosAdmin");
      expect(token).toBe("personal-token");
    });

    it("should return empty string and not crash if both app credentials and personal token are missing (kills optional chaining mutant)", async () => {
      mockConfig.getGitHubAppId = jest.fn().mockReturnValue(undefined);
      mockConfig.getGitHubPrivateKey = jest.fn().mockReturnValue(undefined);

      const getUndefinedToken = (): string | undefined => undefined;
      mockConfig.getGitHubToken.mockReturnValue(getUndefinedToken() as string);

      const token = await resolver.resolveGitHubToken("VariaMos/VariaMosAdmin");
      expect(token).toBe("");
    });

    it("should gracefully handle axios HTTP errors, log error details, and fall back to personal token", async () => {
      mockConfig.getGitHubAppId = jest.fn().mockReturnValue("12345");
      mockConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("mock-key");
      mockConfig.getGitHubToken.mockReturnValue("fallback-token");

      (axios.get as jest.Mock).mockRejectedValue({
        response: { data: { message: "Not Found" } },
      });

      const token = await resolver.resolveGitHubToken("VariaMos/VariaMosAdmin");
      expect(token).toBe("fallback-token");

      // Verify logger.err details to kill logging mutants (lines 52, 55, 56)
      expect(logger.err).toHaveBeenCalledWith(
        "Failed to resolve GitHub App token for VariaMos/VariaMosAdmin: Not Found",
      );
    });

    it("should gracefully handle errors without response data, log generic error message, and fall back to personal token", async () => {
      mockConfig.getGitHubAppId = jest.fn().mockReturnValue("12345");
      mockConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("mock-key");
      mockConfig.getGitHubToken.mockReturnValue("fallback-token");

      (axios.get as jest.Mock).mockRejectedValue(new Error("Network Error"));

      const token = await resolver.resolveGitHubToken("VariaMos/VariaMosAdmin");
      expect(token).toBe("fallback-token");

      // Verify logger.err details to kill logging mutants (lines 52, 55, 56)
      expect(logger.err).toHaveBeenCalledWith(
        "Failed to resolve GitHub App token for VariaMos/VariaMosAdmin: Network Error",
      );
    });
  });
});
