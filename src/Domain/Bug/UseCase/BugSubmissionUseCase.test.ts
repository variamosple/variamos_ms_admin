import { type MockProxy, mock } from "vitest-mock-extended";
import type { IBugTrackerConfig } from "#src/Domain/Bug/Config/IBugTrackerConfig.js";
import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import type { IBugRepository } from "#src/Domain/Bug/Repository/IBugRepository.js";
import type { GitHubTokenResolver } from "#src/Domain/Bug/Service/GitHubTokenResolver.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IIssueTrackerService } from "#src/Domain/Core/Service/IIssueTrackerService.js";
import type { IStorageService } from "#src/Domain/Core/Service/IStorageService.js";
import { User } from "#src/Domain/User/Entity/User.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import { BugSubmissionUseCase } from "./BugSubmissionUseCase.js";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const HTML_BYTES = new TextEncoder().encode("<html><script>alert(1)</script>");

describe("BugSubmissionUseCase", () => {
  let useCase: BugSubmissionUseCase;
  let mockBugRepository: MockProxy<IBugRepository>;
  let mockUserRepository: MockProxy<IUserRepository>;
  let mockIssueTracker: MockProxy<IIssueTrackerService>;
  let mockGithubConfig: MockProxy<IBugTrackerConfig>;
  let mockTokenResolver: MockProxy<GitHubTokenResolver>;
  let mockStorageService: MockProxy<IStorageService>;

  beforeEach(() => {
    mockBugRepository = mock<IBugRepository>();
    mockUserRepository = mock<IUserRepository>();
    mockIssueTracker = mock<IIssueTrackerService>();
    mockGithubConfig = mock<IBugTrackerConfig>();
    mockTokenResolver = mock<GitHubTokenResolver>();
    mockStorageService = mock<IStorageService>();
    mockStorageService.saveFile.mockResolvedValue("/uploads/generated.png");
    useCase = new BugSubmissionUseCase(
      mockBugRepository,
      mockUserRepository,
      mockIssueTracker,
      mockGithubConfig,
      mockTokenResolver,
      mockStorageService,
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

    mockBugRepository.createBug.mockResolvedValue(
      new ResponseModel<Bug>("tx-1").withResponse(bug),
    );

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
    mockGithubConfig.getApiBaseUrl = vi
      .fn()
      .mockReturnValue("http://localhost:4000");

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

    mockBugRepository.createBug.mockResolvedValue(
      new ResponseModel<Bug>("tx-1").withResponse(bug),
    );

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
    expect(mockTokenResolver.resolveGitHubToken).toHaveBeenCalledWith(
      "VariaMos/VariaMosAdmin",
    );
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

  it("writes a critical severity and the component in the issue, and stores them", async () => {
    mockUserRepository.findSessionUser.mockResolvedValue(
      new ResponseModel<User>("tx-1").withResponse(
        User.builder().setId("admin-123").setEmail("admin@test.com").build(),
      ),
    );
    mockTokenResolver.resolveGitHubToken.mockResolvedValue("github-token-abc");
    mockIssueTracker.createIssue.mockResolvedValue(42);
    mockBugRepository.createBug.mockResolvedValue(
      new ResponseModel<Bug>("tx-1").withResponse(
        Bug.builder().setTitle("Crash").build(),
      ),
    );

    await useCase.createBug(
      new RequestModel("tx-1", {
        title: "Crash",
        description: "On save",
        priority: "critical" as const,
        category: "Model",
        component: "admin",
        createdById: "admin-123",
        githubRepo: "VariaMos/VariaMosAdmin",
      }),
    );

    expect(mockIssueTracker.createIssue).toHaveBeenCalledWith(
      "VariaMos/VariaMosAdmin",
      "Crash",
      "On save\n\n---\n*Reported directly by Admin*\n*Priority: critical*\n*Category: Model*\n*Component: Administration interface*",
      ["bug", "model", "critical"],
      "github-token-abc",
    );
    expect(mockBugRepository.createBug).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: "critical",
          component: "admin",
        }),
      }),
    );
  });

  it("refuses a component outside the list before anything is stored", async () => {
    const res = await useCase.createBug(
      new RequestModel("tx-1", {
        title: "Crash",
        description: "On save",
        priority: "high" as const,
        category: "Model",
        component: "kernel",
        reporterEmail: "guest@test.com",
      }),
    );

    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toBe(
      "Bug component must be one of: language, model, microservice, admin, other.",
    );
    expect(mockBugRepository.createBug).not.toHaveBeenCalled();
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
    const invalidPriority: string = "urgent";
    const req = new RequestModel("tx-1", {
      title: "Title",
      description: "Desc",
      category: "Editor",
      priority: invalidPriority as "low" | "medium" | "high",
      reporterEmail: "test@test.com",
    });
    const res = await useCase.createBug(req);
    expect(res.errorCode).toBe("INVALID_INPUT");
    expect(res.message).toBe(
      "Bug priority must be one of: low, medium, high, critical.",
    );
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
    expect(res.message).toBe(
      "An email address is required for guest bug submissions.",
    );
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
    mockGithubConfig.getApiBaseUrl = vi
      .fn()
      .mockReturnValue("http://localhost:4000");

    const bug = Bug.builder().setId("bug-file").build();
    mockBugRepository.createBug.mockResolvedValue(
      new ResponseModel<Bug>("tx-1").withResponse(bug),
    );

    const req = new RequestModel("tx-1", {
      title: "Bug Title",
      description: "Desc",
      category: "Editor",
      createdById: "admin-123",
      githubRepo: "VariaMos/VariaMosAdmin",
      file: { content: PNG_BYTES, originalName: "test.png" },
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);

    expect(res.data).toBe(bug);
    expect(mockIssueTracker.createIssue).toHaveBeenCalledWith(
      "VariaMos/VariaMosAdmin",
      "Bug Title",
      expect.stringContaining(
        "[Attachment](http://localhost:4000/uploads/generated.png) (Type: image/png)",
      ),
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
    mockBugRepository.createBug.mockResolvedValue(
      new ResponseModel<Bug>("tx-1").withResponse(bug),
    );

    const req = new RequestModel("tx-1", {
      title: "Bug Title",
      description: "Desc",
      category: "Editor",
      createdById: "admin-123",
      githubRepo: "VariaMos/VariaMosAdmin",
      file: { content: PNG_BYTES, originalName: "test.png" },
      priority: "medium" as const,
    });
    const res = await useCase.createBug(req);

    expect(res.data).toBe(bug);
    expect(mockIssueTracker.createIssue).toHaveBeenCalledWith(
      "VariaMos/VariaMosAdmin",
      "Bug Title",
      expect.stringContaining(
        "[Attachment](http://localhost:4000/uploads/generated.png) (Type: image/png)",
      ),
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
    mockBugRepository.createBug.mockResolvedValue(
      new ResponseModel<Bug>("tx-1").withResponse(bug),
    );

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
    mockGithubConfig.getApiBaseUrl = vi
      .fn()
      .mockReturnValue("http://localhost:4000");

    const bug = Bug.builder().setId("bug-no-priority").build();
    mockBugRepository.createBug.mockResolvedValue(
      new ResponseModel<Bug>("tx-1").withResponse(bug),
    );

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

  describe("file attachments", () => {
    const adminUser = User.builder()
      .setId("admin-123")
      .setEmail("admin@test.com")
      .setUser("admin")
      .setName("Admin User")
      .build();

    const requestWithFile = (
      file: { content: Uint8Array; originalName: string },
      githubRepo?: string,
    ) =>
      new RequestModel("tx-1", {
        title: "Bug Title",
        description: "Desc",
        category: "Editor",
        createdById: "admin-123",
        githubRepo,
        file,
        priority: "medium" as const,
      });

    beforeEach(() => {
      mockUserRepository.findSessionUser.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(adminUser),
      );
    });

    it("should store the file with the detected type and record its path", async () => {
      mockBugRepository.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(
          Bug.builder().setId("bug-file").build(),
        ),
      );

      await useCase.createBug(
        requestWithFile({ content: PNG_BYTES, originalName: "page.html" }),
      );

      expect(mockStorageService.saveFile).toHaveBeenCalledWith(
        PNG_BYTES,
        "png",
      );
      expect(mockBugRepository.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resolvedFile: {
              filePath: "/uploads/generated.png",
              fileType: "image/png",
            },
          }),
        }),
      );
      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
    });

    it("should refuse an unsupported file type before storing anything", async () => {
      const res = await useCase.createBug(
        requestWithFile({ content: HTML_BYTES, originalName: "image.png" }),
      );

      expect(res.errorCode).toBe("INVALID_INPUT");
      expect(res.message).toBe(
        "Unsupported file type. Allowed: PNG, JPEG, GIF, WebP, PDF, TXT, LOG.",
      );
      expect(mockStorageService.saveFile).not.toHaveBeenCalled();
      expect(mockBugRepository.createBug).not.toHaveBeenCalled();
    });

    it("should not store the file when the request is otherwise invalid", async () => {
      const res = await useCase.createBug(
        new RequestModel("tx-1", {
          title: "Title",
          description: "Desc",
          category: "Editor",
          priority: "medium" as const,
          file: { content: PNG_BYTES, originalName: "test.png" },
        }),
      );

      expect(res.errorCode).toBe("INVALID_INPUT");
      expect(mockStorageService.saveFile).not.toHaveBeenCalled();
    });

    it("should delete the stored file when the GitHub push fails", async () => {
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(null);

      const res = await useCase.createBug(
        requestWithFile(
          { content: PNG_BYTES, originalName: "test.png" },
          "VariaMos/VariaMosAdmin",
        ),
      );

      expect(res.errorCode).toBe("INVALID_INPUT");
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        "/uploads/generated.png",
      );
    });

    it("should delete the stored file when the bug cannot be recorded", async () => {
      mockBugRepository.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withError(
          DomainErrorCodes.SYSTEM_ERROR,
          "Database down",
        ),
      );

      const res = await useCase.createBug(
        requestWithFile({ content: PNG_BYTES, originalName: "test.png" }),
      );

      expect(res.errorCode).toBe("SYSTEM_ERROR");
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        "/uploads/generated.png",
      );
    });

    it("should delete the stored file and rethrow when recording throws", async () => {
      mockBugRepository.createBug.mockRejectedValue(
        new Error("Connection lost"),
      );

      await expect(
        useCase.createBug(
          requestWithFile({ content: PNG_BYTES, originalName: "test.png" }),
        ),
      ).rejects.toThrow("Connection lost");
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        "/uploads/generated.png",
      );
    });
  });
});
