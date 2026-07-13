import { mock, MockProxy } from "jest-mock-extended";
import { BugSubmissionUseCase } from "./BugSubmissionUseCase";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import { IUserRepository } from "@src/Domain/Bug/Repository/IUserRepository";
import { IIssueTrackerService } from "@src/Domain/Core/Service/IIssueTrackerService";
import { IBugTrackerConfig } from "@src/Domain/Bug/Config/IBugTrackerConfig";
import { GitHubTokenResolver } from "@src/Domain/Bug/Service/GitHubTokenResolver";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Bug } from "@src/Domain/Bug/Entity/Bug";
import { User } from "@src/Domain/User/Entity/User";

describe("BugSubmissionUseCase", () => {
  let useCase: BugSubmissionUseCase;
  let mockBugRepository: MockProxy<IBugRepository>;
  let mockUserRepository: MockProxy<IUserRepository>;
  let mockIssueTracker: MockProxy<IIssueTrackerService>;
  let mockGithubConfig: MockProxy<IBugTrackerConfig>;
  let mockTokenResolver: MockProxy<GitHubTokenResolver>;

  beforeEach(() => {
    mockBugRepository = mock<IBugRepository>();
    mockUserRepository = mock<IUserRepository>();
    mockIssueTracker = mock<IIssueTrackerService>();
    mockGithubConfig = mock<IBugTrackerConfig>();
    mockTokenResolver = mock<GitHubTokenResolver>();
    useCase = new BugSubmissionUseCase(
      mockBugRepository,
      mockUserRepository,
      mockIssueTracker,
      mockGithubConfig,
      mockTokenResolver,
    );
  });

  it("should successfully create a local bug for a guest", async () => {
    const bug = Bug.builder()
      .setId("bug-123")
      .setTitle("Guest Bug")
      .setDescription("Test Desc")
      .setPriority("medium")
      .setCategory("Editor")
      .setStatus("pending")
      .build();

    mockBugRepository.createBug.mockResolvedValue(new ResponseModel<Bug>("tx-1").withResponse(bug));

    const req = new RequestModel("tx-1", {
      title: "Guest Bug",
      description: "Test Desc",
      priority: "medium" as const,
      category: "Editor",
      reporterEmail: "guest@test.com",
    });

    const res = await useCase.createBug(req);

    expect(res.data).toBe(bug);
    expect(mockBugRepository.createBug).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Guest Bug",
          reporterEmail: "guest@test.com",
          status: "pending",
        }),
      }),
    );
  });

  it("should successfully push a bug to GitHub for an admin", async () => {
    const adminUser = User.builder()
      .setId("admin-123")
      .setEmail("admin@test.com")
      .setUser("admin")
      .setName("Admin User")
      .build();

    mockUserRepository.findSessionUser.mockResolvedValue(
      new ResponseModel<User>("tx-1").withResponse(adminUser),
    );
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("github-token-abc");
    mockIssueTracker.createIssue.mockResolvedValue(42);
    mockGithubConfig.getApiBaseUrl = jest.fn().mockReturnValue("http://localhost:4000");

    const bug = Bug.builder()
      .setId("bug-456")
      .setTitle("GitHub Issue Bug")
      .setDescription("Test Desc")
      .setPriority("high")
      .setCategory("Model")
      .setStatus("open")
      .setGitIssueNumber(42)
      .setGithubHtmlUrl("https://github.com/VariaMos/VariaMosAdmin/issues/42")
      .build();

    mockBugRepository.createBug.mockResolvedValue(new ResponseModel<Bug>("tx-1").withResponse(bug));

    const req = new RequestModel("tx-1", {
      title: "GitHub Issue Bug",
      description: "Test Desc",
      priority: "high" as const,
      category: "Model",
      createdById: "admin-123",
      githubRepo: "VariaMos/VariaMosAdmin",
    });

    const res = await useCase.createBug(req);

    expect(res.data).toBe(bug);
    expect(mockTokenResolver.resolveGitHubToken).toHaveBeenCalledWith("VariaMos/VariaMosAdmin");
    expect(mockIssueTracker.createIssue).toHaveBeenCalled();
  });
});
