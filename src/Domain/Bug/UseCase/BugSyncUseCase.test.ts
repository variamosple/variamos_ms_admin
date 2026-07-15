import { mock, MockProxy } from "jest-mock-extended";
import { BugSyncUseCase } from "./BugSyncUseCase";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import {
  IIssueTrackerService,
  GitHubIssueLabel,
} from "@src/Domain/Core/Service/IIssueTrackerService";
import { IBugTrackerConfig } from "@src/Domain/Bug/Config/IBugTrackerConfig";
import { GitHubTokenResolver } from "@src/Domain/Bug/Service/GitHubTokenResolver";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import logger from "jet-logger";

describe("BugSyncUseCase", () => {
  let useCase: BugSyncUseCase;
  let mockBugRepository: MockProxy<IBugRepository>;
  let mockIssueTracker: MockProxy<IIssueTrackerService>;
  let mockGithubConfig: MockProxy<IBugTrackerConfig>;
  let mockTokenResolver: MockProxy<GitHubTokenResolver>;

  beforeEach(() => {
    mockBugRepository = mock<IBugRepository>();
    mockIssueTracker = mock<IIssueTrackerService>();
    mockGithubConfig = mock<IBugTrackerConfig>();
    mockTokenResolver = mock<GitHubTokenResolver>();
    useCase = new BugSyncUseCase(
      mockBugRepository,
      mockIssueTracker,
      mockGithubConfig,
      mockTokenResolver,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should sync bugs successfully from GitHub issues", async () => {
    mockGithubConfig.getGitHubAppId = jest.fn().mockReturnValue("app-id");
    mockGithubConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("private-key");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["VariaMos/VariaMosAdmin"]);

    mockTokenResolver.resolveGitHubToken.mockResolvedValue("mock-token");
    mockIssueTracker.getIssues.mockResolvedValue([
      {
        number: 5,
        title: "Test Issue",
        body: "Test Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        user: { login: "user" },
      },
    ]);

    mockBugRepository.saveOrUpdateBug.mockResolvedValue(
      new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
        created: true,
        updated: false,
      }),
    );

    const loggerInfoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

    const req = new RequestModel<void>("tx-1");
    const res = await useCase.syncBugs(req);

    expect(res.errorCode).toBeUndefined();
    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      "Starting bugs sync for repos: VariaMos/VariaMosAdmin",
    );
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      "Synchronization finished: Created 1 and Updated 0 bugs.",
    );
  });

  it("should return error if github token/app configs are not defined", async () => {
    mockGithubConfig.getGitHubAppId = jest.fn().mockReturnValue(undefined);
    mockGithubConfig.getGitHubPrivateKey = jest.fn().mockReturnValue(undefined);
    mockGithubConfig.getGitHubToken.mockReturnValue("");

    const req = new RequestModel<void>("tx-1");
    const res = await useCase.syncBugs(req);

    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toBe("GitHub Sync is not configured.");
  });

  it("should fail validation if credentials contain only whitespace", async () => {
    // Test appId with whitespace only
    mockGithubConfig.getGitHubAppId = jest.fn().mockReturnValue("   ");
    mockGithubConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("private-key");
    mockGithubConfig.getGitHubToken.mockReturnValue("");
    let res = await useCase.syncBugs(new RequestModel<void>("tx-1"));
    expect(res.errorCode).toBe("INVALID_INPUT");

    // Test privateKey with whitespace only
    mockGithubConfig.getGitHubAppId = jest.fn().mockReturnValue("app-id");
    mockGithubConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("   ");
    mockGithubConfig.getGitHubToken.mockReturnValue("");
    res = await useCase.syncBugs(new RequestModel<void>("tx-1"));
    expect(res.errorCode).toBe("INVALID_INPUT");

    // Test patToken with whitespace only
    mockGithubConfig.getGitHubAppId = jest.fn().mockReturnValue("");
    mockGithubConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("");
    mockGithubConfig.getGitHubToken.mockReturnValue("   ");
    res = await useCase.syncBugs(new RequestModel<void>("tx-1"));
    expect(res.errorCode).toBe("INVALID_INPUT");
  });

  it("should fail validation if only one of appId or privateKey is provided", async () => {
    // AppId provided, privateKey missing
    mockGithubConfig.getGitHubAppId = jest.fn().mockReturnValue("app-id");
    mockGithubConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("");
    mockGithubConfig.getGitHubToken.mockReturnValue("");
    let res = await useCase.syncBugs(new RequestModel<void>("tx-1"));
    expect(res.errorCode).toBe("INVALID_INPUT");

    // PrivateKey provided, appId missing
    mockGithubConfig.getGitHubAppId = jest.fn().mockReturnValue("");
    mockGithubConfig.getGitHubPrivateKey = jest.fn().mockReturnValue("private-key");
    mockGithubConfig.getGitHubToken.mockReturnValue("");
    res = await useCase.syncBugs(new RequestModel<void>("tx-1"));
    expect(res.errorCode).toBe("INVALID_INPUT");
  });

  it("should skip repo if token could not be resolved", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["Repo1", "Repo2"]);
    mockTokenResolver.resolveGitHubToken.mockResolvedValueOnce("").mockResolvedValueOnce("token2");

    mockIssueTracker.getIssues.mockResolvedValue([]);
    const loggerWarnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

    const req = new RequestModel<void>("tx-1");
    await useCase.syncBugs(req);

    expect(mockTokenResolver.resolveGitHubToken).toHaveBeenCalledTimes(2);
    expect(mockIssueTracker.getIssues).toHaveBeenCalledTimes(1); // called only for Repo2
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      "GitHub token could not be resolved for repo: Repo1. Skipping.",
    );
  });

  it("should skip issues that are pull requests", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["Repo1"]);
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

    mockIssueTracker.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "Normal Issue",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        pull_request: undefined,
      },
      {
        number: 2,
        title: "Pull Request",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        pull_request: {},
      },
    ]);

    mockBugRepository.saveOrUpdateBug.mockResolvedValue(
      new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
        created: true,
        updated: false,
      }),
    );

    await useCase.syncBugs(new RequestModel<void>("tx-1"));

    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalledTimes(1);
    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gitIssueNumber: 1,
        }),
      }),
    );
  });

  it("should handle issues with no labels or non-array labels gracefully", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["Repo1"]);
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

    mockIssueTracker.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "No labels",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        labels: undefined,
      },
      {
        number: 2,
        title: "Non-array labels",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        // Pass a truthy object that is not an array to kill the && -> || mutant on line 57
        labels: {} as GitHubIssueLabel[],
      },
    ]);

    mockBugRepository.saveOrUpdateBug.mockResolvedValue(
      new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
        created: true,
        updated: false,
      }),
    );

    const res = await useCase.syncBugs(new RequestModel<void>("tx-1"));

    expect(res.errorCode).toBeUndefined();
    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalledTimes(2);
    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          priority: "medium",
        }),
      }),
    );
    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          priority: "medium",
        }),
      }),
    );
  });

  it("should map all high and low priority labels correctly", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["Repo1"]);
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

    const labelsToTest = [
      { labels: [{ name: "high" }, { name: "other-label" }], expectedPriority: "high" },
      { labels: [{ name: "p1" }, { name: "other-label" }], expectedPriority: "high" },
      { labels: [{ name: "critical" }, { name: "other-label" }], expectedPriority: "high" },
      { labels: [{ name: "urg" }, { name: "other-label" }], expectedPriority: "high" },
      { labels: [{ name: "important" }, { name: "other-label" }], expectedPriority: "high" },
      { labels: [{ name: "low" }, { name: "other-label" }], expectedPriority: "low" },
      { labels: [{ name: "p3" }, { name: "other-label" }], expectedPriority: "low" },
      { labels: [{ name: "minor" }, { name: "other-label" }], expectedPriority: "low" },
      { labels: [{ name: "unknown-label" }, { name: "other-label" }], expectedPriority: "medium" },
    ];

    mockIssueTracker.getIssues.mockResolvedValue(
      labelsToTest.map((item, index) => ({
        number: index + 1,
        title: `Bug ${index}`,
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        labels: item.labels,
      })),
    );

    mockBugRepository.saveOrUpdateBug.mockResolvedValue(
      new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
        created: true,
        updated: false,
      }),
    );

    await useCase.syncBugs(new RequestModel<void>("tx-1"));

    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalledTimes(labelsToTest.length);
    labelsToTest.forEach((item, index) => {
      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          data: expect.objectContaining({
            priority: item.expectedPriority,
          }),
        }),
      );
    });
  });

  it("should map high/low priority labels and category correctly with multiple labels and case insensitivity", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["Repo1"]);
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

    mockIssueTracker.getIssues.mockResolvedValue([
      {
        number: 10,
        title: "High Bug with multiple labels",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        // 'critical' is high priority. 'eDiToR' (mixed case) should map to 'Editor'
        // We include 'other-label' to kill some -> every mutant (since length > 1)
        labels: [{ name: "critical" }, { name: "eDiToR" }, { name: "other-label" }],
      },
      {
        number: 11,
        title: "Low Bug with multiple labels",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        // 'minor' is low priority. We include 'other-label' to kill some -> every
        labels: [{ name: "minor" }, { name: "other-label" }],
      },
    ]);

    mockBugRepository.saveOrUpdateBug.mockResolvedValue(
      new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
        created: true,
        updated: false,
      }),
    );

    const req = new RequestModel<void>("tx-1");
    await useCase.syncBugs(req);

    // Verify first bug has high priority and Editor category
    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          priority: "high",
          category: "Editor",
        }),
      }),
    );

    // Verify second bug has low priority and undefined category
    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          priority: "low",
          category: undefined,
        }),
      }),
    );
  });

  it("should map issue state to open or closed status correctly", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["Repo1"]);
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

    mockIssueTracker.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "Closed Bug",
        body: "Body",
        state: "closed",
        created_at: "2026-07-13T00:00:00Z",
      },
      {
        number: 2,
        title: "Open Bug",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
      },
    ]);

    mockBugRepository.saveOrUpdateBug.mockResolvedValue(
      new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
        created: true,
        updated: false,
      }),
    );

    await useCase.syncBugs(new RequestModel<void>("tx-1"));

    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status: "closed",
        }),
      }),
    );

    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: "open",
        }),
      }),
    );
  });

  it("should set creator to Github login or default to System", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["Repo1"]);
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

    mockIssueTracker.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "Bug with user",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        user: { login: "github-user" },
      },
      {
        number: 2,
        title: "Bug without user",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        user: undefined,
      },
    ]);

    mockBugRepository.saveOrUpdateBug.mockResolvedValue(
      new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
        created: true,
        updated: false,
      }),
    );

    await useCase.syncBugs(new RequestModel<void>("tx-1"));

    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          githubCreator: "github-user",
        }),
      }),
    );

    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          githubCreator: "System",
        }),
      }),
    );
  });

  it("should set assignee login or undefined", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["Repo1"]);
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

    mockIssueTracker.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "Bug with assignee",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        assignee: { login: "assignee-user" },
      },
      {
        number: 2,
        title: "Bug without assignee",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        assignee: undefined,
      },
    ]);

    mockBugRepository.saveOrUpdateBug.mockResolvedValue(
      new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
        created: true,
        updated: false,
      }),
    );

    await useCase.syncBugs(new RequestModel<void>("tx-1"));

    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          githubAssignee: "assignee-user",
        }),
      }),
    );

    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          githubAssignee: undefined,
        }),
      }),
    );
  });

  it("should fall back to created_at or empty string for updatedAt", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["Repo1"]);
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

    mockIssueTracker.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "Bug with updated_at",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        updated_at: "2026-07-14T00:00:00Z",
      },
      {
        number: 2,
        title: "Bug without updated_at",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
        updated_at: undefined,
      },
      {
        number: 3,
        title: "Bug without dates",
        body: "Body",
        state: "open",
        created_at: undefined,
        updated_at: undefined,
      },
    ]);

    mockBugRepository.saveOrUpdateBug.mockResolvedValue(
      new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
        created: true,
        updated: false,
      }),
    );

    const loggerErrSpy = jest.spyOn(logger, "err").mockImplementation(() => {});

    await useCase.syncBugs(new RequestModel<void>("tx-1"));

    expect(loggerErrSpy).not.toHaveBeenCalled();

    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          updatedAt: new Date("2026-07-14T00:00:00Z"),
        }),
      }),
    );

    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          updatedAt: new Date("2026-07-13T00:00:00Z"),
        }),
      }),
    );

    const calls = mockBugRepository.saveOrUpdateBug.mock.calls;
    expect(calls.length).toBe(3);
    const thirdCall = calls[2];
    if (!thirdCall || !thirdCall[0] || !thirdCall[0].data) {
      throw new Error("Expected third call to have data");
    }
    const updatedAt = thirdCall[0].data.updatedAt;
    expect(updatedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(updatedAt.getTime())).toBe(true);
  });

  it("should accurately count created and updated bugs in the summary log", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockReturnValue(["Repo1"]);
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

    mockIssueTracker.getIssues.mockResolvedValue([
      {
        number: 1,
        title: "Bug 1",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
      },
      {
        number: 2,
        title: "Bug 2",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
      },
      {
        number: 3,
        title: "Bug 3",
        body: "Body",
        state: "open",
        created_at: "2026-07-13T00:00:00Z",
      },
    ]);

    mockBugRepository.saveOrUpdateBug
      .mockResolvedValueOnce(
        new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
          created: true,
          updated: false,
        }),
      )
      .mockResolvedValueOnce(
        new ResponseModel<{ created: boolean; updated: boolean }>("tx-1").withResponse({
          created: false,
          updated: true,
        }),
      )
      .mockResolvedValueOnce(new ResponseModel<{ created: boolean; updated: boolean }>("tx-1"));

    const loggerInfoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

    await useCase.syncBugs(new RequestModel<void>("tx-1"));

    expect(loggerInfoSpy).toHaveBeenCalledWith(
      "Synchronization finished: Created 1 and Updated 1 bugs.",
    );
  });

  it("should return SYSTEM_ERROR if synchronization throws an exception", async () => {
    mockGithubConfig.getGitHubToken.mockReturnValue("pat-token");
    mockGithubConfig.getGitHubManagedRepos.mockImplementation(() => {
      throw new Error("Disk read error");
    });

    const req = new RequestModel<void>("tx-1");
    const res = await useCase.syncBugs(req);

    expect(res.errorCode).toBe("SYSTEM_ERROR");
    expect(res.message).toBe("Disk read error");
  });
});
