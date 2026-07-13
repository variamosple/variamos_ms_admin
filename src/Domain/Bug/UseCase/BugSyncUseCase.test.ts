import { mock, MockProxy } from "jest-mock-extended";
import { BugSyncUseCase } from "./BugSyncUseCase";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import { IIssueTrackerService } from "@src/Domain/Core/Service/IIssueTrackerService";
import { IBugTrackerConfig } from "@src/Domain/Bug/Config/IBugTrackerConfig";
import { GitHubTokenResolver } from "@src/Domain/Bug/Service/GitHubTokenResolver";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";

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

    const req = new RequestModel<void>("tx-1");
    const res = await useCase.syncBugs(req);

    expect(res.errorCode).toBeUndefined();
    expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalled();
  });
});
