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
          logComment: "Bug submitted locally by guest.",
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
    expect(mockIssueTracker.createIssue).toHaveBeenCalledWith(
      "VariaMos/VariaMosAdmin",
      "GitHub Issue Bug",
      "Test Desc\n\n---\n*Reported directly by Admin*\n*Priority: high*\n*Category: Model*",
      ["bug", "model", "high"],
      "github-token-abc",
    );
    expect(mockBugRepository.createBug).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "GitHub Issue Bug",
          status: "open",
          gitIssueNumber: 42,
          githubHtmlUrl: "https://github.com/VariaMos/VariaMosAdmin/issues/42",
          logComment: "Bug submitted directly to GitHub by admin.",
        }),
      }),
    );
  });

  it("should return error if request data is missing", async () => {
    const req = new RequestModel<{
      title: string;
      description: string;
      priority: "low" | "medium" | "high";
      category: string;
    }>("tx-1");
    const res = await useCase.createBug(req);
    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toBe("Request data is required.");
  });

  it("should return error if title, description, or category is missing", async () => {
    const req = new RequestModel("tx-1", {
      title: "",
      description: "Desc",
      category: "Editor",
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);
    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toBe("Title, description and category are required.");
  });

  it("should return error if priority format is invalid", async () => {
    const invalidPriority: string = "critical";
    const req = new RequestModel("tx-1", {
      title: "Title",
      description: "Desc",
      category: "Editor",
      priority: invalidPriority as "low" | "medium" | "high",
      reporterEmail: "test@test.com",
    });
    const res = await useCase.createBug(req);
    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toBe("Bug priority must be either 'low', 'medium', or 'high'.");
  });

  it("should return error if category is invalid", async () => {
    const req = new RequestModel("tx-1", {
      title: "Title",
      description: "Desc",
      category: "InvalidCategory",
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);
    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toContain("Invalid category selected");
  });

  it("should return error if reporter email is missing for guest", async () => {
    const req = new RequestModel("tx-1", {
      title: "Title",
      description: "Desc",
      category: "Editor",
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);
    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toBe("An email address is required for guest bug submissions.");
  });

  it("should return error if reporter email cannot be resolved for admin", async () => {
    mockUserRepository.findSessionUser.mockResolvedValue(
      new ResponseModel<User>("tx-1").withResponse(null),
    );

    const req = new RequestModel("tx-1", {
      title: "Title",
      description: "Desc",
      category: "Editor",
      createdById: "admin-123",
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);
    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toBe("Reporter email could not be resolved.");
  });

  it("should return error if GitHub token resolution fails", async () => {
    const adminUser = User.builder()
      .setId("admin-123")
      .setEmail("admin@test.com")
      .setUser("admin")
      .setName("Admin User")
      .build();

    mockUserRepository.findSessionUser.mockResolvedValue(
      new ResponseModel<User>("tx-1").withResponse(adminUser),
    );
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("");

    const req = new RequestModel("tx-1", {
      title: "Title",
      description: "Desc",
      category: "Editor",
      createdById: "admin-123",
      githubRepo: "VariaMos/VariaMosAdmin",
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);
    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toBe("GitHub integration token is not configured.");
  });

  it("should return error if pushing to GitHub fails", async () => {
    const adminUser = User.builder()
      .setId("admin-123")
      .setEmail("admin@test.com")
      .setUser("admin")
      .setName("Admin User")
      .build();

    mockUserRepository.findSessionUser.mockResolvedValue(
      new ResponseModel<User>("tx-1").withResponse(adminUser),
    );
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
    mockIssueTracker.createIssue.mockResolvedValue(null);

    const req = new RequestModel("tx-1", {
      title: "Title",
      description: "Desc",
      category: "Editor",
      createdById: "admin-123",
      githubRepo: "VariaMos/VariaMosAdmin",
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);
    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toContain("Failed to push bug to GitHub repository");
  });

  it("should handle bug creation with file attachments", async () => {
    const adminUser = User.builder()
      .setId("admin-123")
      .setEmail("admin@test.com")
      .setUser("admin")
      .setName("Admin User")
      .build();

    mockUserRepository.findSessionUser.mockResolvedValue(
      new ResponseModel<User>("tx-1").withResponse(adminUser),
    );
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
    mockIssueTracker.createIssue.mockResolvedValue(100);
    mockGithubConfig.getApiBaseUrl = jest.fn().mockReturnValue("http://localhost:4000");

    const bug = Bug.builder().setId("bug-file").build();
    mockBugRepository.createBug.mockResolvedValue(new ResponseModel<Bug>("tx-1").withResponse(bug));

    const req = new RequestModel("tx-1", {
      title: "Bug Title",
      description: "Desc",
      category: "Editor",
      createdById: "admin-123",
      githubRepo: "VariaMos/VariaMosAdmin",
      file: { filename: "test.png", mimetype: "image/png" },
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);

    expect(res.data).toBe(bug);
    expect(mockIssueTracker.createIssue).toHaveBeenCalledWith(
      "VariaMos/VariaMosAdmin",
      "Bug Title",
      expect.stringContaining("http://localhost:4000/uploads/test.png"),
      expect.any(Array),
      "token",
    );
  });

  it("should handle bug creation with file attachments when getApiBaseUrl is not configured, defaulting to localhost:4000", async () => {
    const adminUser = User.builder()
      .setId("admin-123")
      .setEmail("admin@test.com")
      .setUser("admin")
      .setName("Admin User")
      .build();

    mockUserRepository.findSessionUser.mockResolvedValue(
      new ResponseModel<User>("tx-1").withResponse(adminUser),
    );
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
    mockIssueTracker.createIssue.mockResolvedValue(100);
    // getApiBaseUrl returns undefined or is not present
    mockGithubConfig.getApiBaseUrl = undefined;

    const bug = Bug.builder().setId("bug-file-default").build();
    mockBugRepository.createBug.mockResolvedValue(new ResponseModel<Bug>("tx-1").withResponse(bug));

    const req = new RequestModel("tx-1", {
      title: "Bug Title",
      description: "Desc",
      category: "Editor",
      createdById: "admin-123",
      githubRepo: "VariaMos/VariaMosAdmin",
      file: { filename: "test.png", mimetype: "image/png" },
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);

    expect(res.data).toBe(bug);
    expect(mockIssueTracker.createIssue).toHaveBeenCalledWith(
      "VariaMos/VariaMosAdmin",
      "Bug Title",
      expect.stringContaining("http://localhost:4000/uploads/test.png"),
      expect.any(Array),
      "token",
    );
  });

  it("should handle local submission by an admin user when githubRepo is not provided", async () => {
    const adminUser = User.builder()
      .setId("admin-123")
      .setEmail("admin@test.com")
      .setUser("admin")
      .setName("Admin User")
      .build();

    mockUserRepository.findSessionUser.mockResolvedValue(
      new ResponseModel<User>("tx-1").withResponse(adminUser),
    );

    const bug = Bug.builder().setId("bug-local-admin").build();
    mockBugRepository.createBug.mockResolvedValue(new ResponseModel<Bug>("tx-1").withResponse(bug));

    const req = new RequestModel("tx-1", {
      title: "Bug Title",
      description: "Desc",
      category: "Editor",
      createdById: "admin-123",
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);

    expect(res.data).toBe(bug);
    expect(mockBugRepository.createBug).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending",
          logComment: "Bug submitted locally by user.",
        }),
      }),
    );
  });

  it("should handle bug submission when priority is not specified", async () => {
    const adminUser = User.builder()
      .setId("admin-123")
      .setEmail("admin@test.com")
      .setUser("admin")
      .setName("Admin User")
      .build();

    mockUserRepository.findSessionUser.mockResolvedValue(
      new ResponseModel<User>("tx-1").withResponse(adminUser),
    );
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
    mockIssueTracker.createIssue.mockResolvedValue(101);
    mockGithubConfig.getApiBaseUrl = jest.fn().mockReturnValue("http://localhost:4000");

    const bug = Bug.builder().setId("bug-no-priority").build();
    mockBugRepository.createBug.mockResolvedValue(new ResponseModel<Bug>("tx-1").withResponse(bug));

    const reqData: {
      title: string;
      description: string;
      category: string;
      createdById: string;
      githubRepo: string;
      priority?: "low" | "medium" | "high";
    } = {
      title: "Bug Title",
      description: "Desc",
      category: "Editor",
      createdById: "admin-123",
      githubRepo: "VariaMos/VariaMosAdmin",
      priority: undefined,
    };

    const req = new RequestModel(
      "tx-1",
      reqData as {
        title: string;
        description: string;
        priority: "low" | "medium" | "high";
        category: string;
        githubRepo?: string;
        createdById?: string;
      },
    );
    const res = await useCase.createBug(req);

    expect(res.data).toBe(bug);
    expect(mockIssueTracker.createIssue).toHaveBeenCalledWith(
      "VariaMos/VariaMosAdmin",
      "Bug Title",
      "Desc\n\n---\n*Reported directly by Admin*\n*Category: Editor*",
      ["bug", "editor"],
      "token",
    );
  });
});
