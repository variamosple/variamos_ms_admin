import { BugUseCases, ALLOWED_CATEGORIES } from "./BugUseCases";
import { RequestModel } from "../Core/Entity/RequestModel";
import { Bug } from "./Entity/Bug";
import { BugStatusLog } from "./Entity/BugStatusLog";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { IBugTrackerConfig } from "./Config/IBugTrackerConfig";
import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";
import logger from "jet-logger";
import { IIssueTrackerService } from "../Core/Service/IIssueTrackerService";
import { IStorageService } from "../Core/Service/IStorageService";
import { IBugRepository } from "./Repository/IBugRepository";
import { IUserRepository } from "./Repository/IUserRepository";
import axios from "axios";
import crypto from "crypto";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("BugUseCases Unit Tests", () => {
  let bugUseCases: BugUseCases;
  let mockIssueTrackerService: jest.Mocked<IIssueTrackerService>;
  let mockStorageService: jest.Mocked<IStorageService>;
  let mockBugRepository: jest.Mocked<IBugRepository>;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockConfig: IBugTrackerConfig;

  beforeEach(() => {
    mockIssueTrackerService = {
      closeIssue: jest.fn(),
      reopenIssue: jest.fn(),
      getIssues: jest.fn(),
      createIssue: jest.fn(),
    } as unknown as jest.Mocked<IIssueTrackerService>;
    mockStorageService = {
      deleteFile: jest.fn(),
    } as unknown as jest.Mocked<IStorageService>;
    mockBugRepository = {
      queryBugs: jest.fn(),
      queryLocalBugs: jest.fn(),
      findById: jest.fn(),
      saveOrUpdateBug: jest.fn(),
      rejectBug: jest.fn(),
      restoreBug: jest.fn(),
      findExpiredRejectedBugs: jest.fn(),
      updateAttachmentPath: jest.fn(),
      createLog: jest.fn(),
      createBug: jest.fn(),
      queryHistory: jest.fn(),
      updateStatus: jest.fn(),
      createAttachment: jest.fn(),
      deleteAttachment: jest.fn(),
      findAttachmentById: jest.fn(),
      createNote: jest.fn(),
      queryNotes: jest.fn(),
    } as unknown as jest.Mocked<IBugRepository>;
    mockBugRepository.findById.mockResolvedValue(
      new ResponseModel<Bug | null>("tx-id").withResponse(
        Bug.builder().setId("123").setStatus("pending").build(),
      ),
    );
    mockBugRepository.createNote.mockResolvedValue(
      new ResponseModel<any>("tx-id"),
    );
    mockBugRepository.queryNotes.mockResolvedValue(
      new ResponseModel<any[]>("tx-id").withResponse([]),
    );
    mockUserRepository = {
      findSessionUser: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;
    mockConfig = {
      getGitHubToken: jest.fn().mockReturnValue("dummy-token-from-test"),
      getGitHubManagedRepos: () => ["VariaMos/VariaMosAdmin"],
    };

    bugUseCases = new BugUseCases(
      mockIssueTrackerService,
      mockStorageService,
      mockBugRepository,
      mockUserRepository,
      mockConfig,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("queryBugs & queryLocalBugs & queryHistory", () => {
    it("should route queryBugs directly to gitHubBugRepository and not modify repo if provided", async () => {
      mockBugRepository.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([]),
      );
      const filterData = { repo: "VariaMos/VariaMosAdmin" } as any;
      const request = new RequestModel("tx-id", filterData);
      await bugUseCases.queryBugs(request);
      expect(mockBugRepository.queryBugs).toHaveBeenCalledWith(request);
      expect(filterData.managedRepos).toBeUndefined();
    });

    it("should set managedRepos if repo filter is missing in queryBugs", async () => {
      mockBugRepository.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([]),
      );
      const request = new RequestModel("tx-id", {} as any);
      await bugUseCases.queryBugs(request);
      expect(mockBugRepository.queryBugs).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            managedRepos: ["VariaMos/VariaMosAdmin"],
          }),
        }),
      );
    });

    it("should route queryLocalBugs directly to localBugRepository", async () => {
      mockBugRepository.queryLocalBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([]),
      );
      const request = new RequestModel("tx-id", { status: "pending" } as any);
      await bugUseCases.queryLocalBugs(request);
      expect(mockBugRepository.queryLocalBugs).toHaveBeenCalledWith(request);
    });

    it("should route queryHistory directly to localBugRepository", async () => {
      mockBugRepository.queryHistory.mockResolvedValue(
        new ResponseModel<BugStatusLog[]>("tx-id").withResponse([]),
      );
      const request = new RequestModel("tx-id", "bug-123");
      await bugUseCases.queryHistory(request);
      expect(mockBugRepository.queryHistory).toHaveBeenCalledWith(request);
    });
  });

  // Helper to construct a base bug template for testing
  const createMockBug = (id: string, title = "New Bug", status = "pending") => {
    return Bug.builder()
      .setId(id)
      .setTitle(title)
      .setDescription("Detail description")
      .setStatus(status)
      .build();
  };

  describe("createBug", () => {
    it("should successfully create a local bug for a guest", async () => {
      const bugData = {
        title: "New Bug",
        description: "Detail description",
        priority: "medium" as const,
        category: ALLOWED_CATEGORIES[0], // 'Editor'
        reporterEmail: "guest@example.com",
      };

      mockBugRepository.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(createMockBug("100")),
      );

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(mockBugRepository.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "New Bug",
            reporterEmail: "guest@example.com",
            status: "pending",
            createdById: "",
            logComment: "Bug submitted locally by guest.",
          }),
        }),
      );
      expect(response.data?.id).toBe("100");
    });

    it("should successfully create a local bug for a registered user", async () => {
      const bugData = {
        title: "New Bug",
        description: "Detail description",
        priority: "medium" as const,
        category: ALLOWED_CATEGORIES[0],
        createdById: "user-123",
      };

      mockUserRepository.findSessionUser.mockResolvedValue(
        new ResponseModel<any>("tx-1").withResponse({
          email: "user@example.com",
        }),
      );

      mockBugRepository.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(createMockBug("101")),
      );

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(mockUserRepository.findSessionUser).toHaveBeenCalledWith(
        expect.objectContaining({ data: "user-123" }),
      );
      expect(mockBugRepository.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: "user-123",
            reporterEmail: "user@example.com",
            status: "pending",
            logComment: "Bug submitted locally by user.",
          }),
        }),
      );
      expect(response.data?.id).toBe("101");
    });

    it.each([
      {
        desc: "should return error if title is missing",
        data: {
          title: "",
          description: "Detail description",
          priority: "medium" as const,
          category: "Editor",
          reporterEmail: "guest@example.com",
        },
        userResponse: null,
        expectedError: "Title, description and category are required",
      },
      {
        desc: "should return error if category is invalid",
        data: {
          title: "Title",
          description: "Description",
          priority: "medium" as const,
          category: "InvalidCategoryName",
          reporterEmail: "guest@example.com",
        },
        userResponse: null,
        expectedError: "Invalid category selected. Allowed:",
      },
      {
        desc: "should handle registered user with empty email data",
        data: {
          title: "New Bug",
          description: "Detail description",
          priority: "medium" as const,
          category: "Editor",
          createdById: "user-123",
        },
        userResponse: { email: "" },
        expectedError: "Reporter email could not be resolved",
      },
      {
        desc: "should handle registered user when userResponse.data is null",
        data: {
          title: "New Bug",
          description: "Detail description",
          priority: "medium" as const,
          category: "Editor",
          createdById: "user-123",
        },
        userResponse: null,
        expectedError: "Reporter email could not be resolved",
      },
    ])("$desc", async ({ data, userResponse, expectedError }) => {
      if (data.createdById) {
        mockUserRepository.findSessionUser.mockResolvedValue(
          new ResponseModel<any>("tx-1").withResponse(userResponse),
        );
      }
      const request = new RequestModel("tx-1", data as any);
      const response = await bugUseCases.createBug(request);
      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain(expectedError);
    });

    it("should support adding attachments when a file payload is present", async () => {
      const bugData = {
        title: "New Bug",
        description: "Detail description",
        priority: "medium" as const,
        category: ALLOWED_CATEGORIES[0],
        reporterEmail: "user@example.com",
        file: { filename: "screenshot.png", mimetype: "image/png" },
      };

      mockBugRepository.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse({ id: "102" } as Bug),
      );

      const request = new RequestModel("tx-1", bugData);
      await bugUseCases.createBug(request);

      expect(mockBugRepository.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resolvedFile: {
              filePath: "/uploads/screenshot.png",
              fileType: "image/png",
            },
          }),
        }),
      );
    });

    it("should successfully create a bug directly on GitHub when createdById and githubRepo are present", async () => {
      const bugData = {
        title: "Admin Direct GitHub Bug",
        description: "Admin description",
        priority: "high" as const,
        category: ALLOWED_CATEGORIES[0],
        createdById: "admin-123",
        githubRepo: "VariaMos/VariaMosAdmin",
        file: { filename: "doc.pdf", mimetype: "application/pdf" },
      };

      mockUserRepository.findSessionUser.mockResolvedValue(
        new ResponseModel<any>("tx-1").withResponse({
          email: "admin@test.com",
        }),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(456);

      mockBugRepository.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(createMockBug("200")),
      );

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "Admin Direct GitHub Bug",
        expect.stringContaining("*Reported directly by Admin*"),
        ["bug", "editor", "high"],
        "dummy-token-from-test",
      );

      // Verify fields are correctly injected in the body
      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.stringContaining("*Priority: high*"),
        expect.any(Array),
        expect.any(String),
      );
      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.stringContaining("*Category: Editor*"),
        expect.any(Array),
        expect.any(String),
      );
      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.stringContaining(
          "### Attachments\n- [Attachment](http://localhost:4000/uploads/doc.pdf) (Type: application/pdf)",
        ),
        expect.any(Array),
        expect.any(String),
      );

      expect(mockBugRepository.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "open",
            gitIssueNumber: 456,
            githubHtmlUrl:
              "https://github.com/VariaMos/VariaMosAdmin/issues/456",
            logComment: "Bug submitted directly to GitHub by admin.",
          }),
        }),
      );
      expect(response.data?.id).toBe("200");
    });

    it("should successfully create a bug directly on GitHub when priority is missing", async () => {
      const bugData = {
        title: "Admin Bug No Priority",
        description: "No priority description",
        category: ALLOWED_CATEGORIES[0],
        createdById: "admin-123",
        githubRepo: "VariaMos/VariaMosAdmin",
      };

      mockUserRepository.findSessionUser.mockResolvedValue(
        new ResponseModel<any>("tx-1").withResponse({
          email: "admin@test.com",
        }),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(457);

      mockBugRepository.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(createMockBug("201")),
      );

      const request = new RequestModel("tx-1", bugData as any);
      await bugUseCases.createBug(request);

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "Admin Bug No Priority",
        expect.stringContaining("No priority description"),
        ["bug", "editor"],
        "dummy-token-from-test",
      );

      // Verify no priority is appended to prevent undefined
      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.not.stringContaining("Priority:"),
        expect.any(Array),
        expect.any(String),
      );

      // Verify no Attachments section is present
      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.not.stringContaining("### Attachments"),
        expect.any(Array),
        expect.any(String),
      );
    });

    it("should return error if direct GitHub push fails during creation", async () => {
      const bugData = {
        title: "Admin Direct GitHub Bug",
        description: "Admin description",
        priority: "high" as const,
        category: ALLOWED_CATEGORIES[0],
        createdById: "admin-123",
        githubRepo: "VariaMos/VariaMosAdmin",
      };

      mockUserRepository.findSessionUser.mockResolvedValue(
        new ResponseModel<any>("tx-1").withResponse({
          email: "admin@test.com",
        }),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(undefined as any);

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain(
        "Failed to push bug to GitHub repository",
      );
    });

    it("should return error if direct GitHub push lacks token", async () => {
      const noTokenBugUseCases = new BugUseCases(
        mockIssueTrackerService,
        mockStorageService,
        mockBugRepository,
        mockUserRepository,
        { getGitHubToken: () => "", getGitHubManagedRepos: () => [] },
      );

      const bugData = {
        title: "Admin Direct GitHub Bug",
        description: "Admin description",
        priority: "high" as const,
        category: ALLOWED_CATEGORIES[0],
        createdById: "admin-123",
        githubRepo: "VariaMos/VariaMosAdmin",
      };

      mockUserRepository.findSessionUser.mockResolvedValue(
        new ResponseModel<any>("tx-1").withResponse({
          email: "admin@test.com",
        }),
      );

      const request = new RequestModel("tx-1", bugData);
      const response = await noTokenBugUseCases.createBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain(
        "GitHub integration token is not configured",
      );
    });

    it("should return error if both reporterEmail and createdById are missing", async () => {
      const bugData = {
        title: "New Bug",
        description: "Detail description",
        priority: "medium" as const,
        category: ALLOWED_CATEGORIES[0],
      };

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain(
        "An email address is required for guest bug submissions.",
      );
    });
  });

  describe("updateStatus", () => {
    it("should successfully update status of a local bug", async () => {
      const bugId = "123";
      const requestPayload = {
        id: bugId,
        status: "closed",
        adminId: "admin-1",
      };
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse({
          id: bugId,
          status: "closed",
        } as Bug),
      );

      const request = new RequestModel("tx-id", requestPayload);
      const response = await bugUseCases.updateStatus(request);

      expect(mockBugRepository.updateStatus).toHaveBeenCalledWith(request);
      expect(response.data?.status).toBe("closed");
    });

    it("should update status and call closeIssue on GitHub if bug is from GitHub and status is closed", async () => {
      const bugId = "gh-repo-42";
      const requestPayload = {
        id: bugId,
        status: "closed",
        adminId: "admin-1",
      };

      const bugEntity = createMockBug(bugId, "New Bug", "open");
      bugEntity.githubRepo = "VariaMos/VariaMosAdmin";
      bugEntity.gitIssueNumber = 42;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      expect(mockBugRepository.updateStatus).toHaveBeenCalledWith(request);
      expect(mockIssueTrackerService.closeIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        42,
        "dummy-token-from-test",
      );
    });

    it("should update status and call reopenIssue on GitHub if bug is from GitHub and status is open", async () => {
      const bugId = "gh-repo-42";
      const requestPayload = { id: bugId, status: "open", adminId: "admin-1" };

      const bugEntity = createMockBug(bugId, "New Bug", "closed");
      bugEntity.githubRepo = "VariaMos/VariaMosAdmin";
      bugEntity.gitIssueNumber = 42;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      expect(mockBugRepository.updateStatus).toHaveBeenCalledWith(request);
      expect(mockIssueTrackerService.reopenIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        42,
        "dummy-token-from-test",
      );
    });

    it("should bypass github issue call if issue is neither closed nor open", async () => {
      const bugId = "gh-repo-42";
      const requestPayload = {
        id: bugId,
        status: "pending",
        adminId: "admin-1",
      };

      const bugEntity = createMockBug(bugId, "New Bug", "pending");
      bugEntity.githubRepo = "VariaMos/VariaMosAdmin";
      bugEntity.gitIssueNumber = 42;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      expect(mockIssueTrackerService.closeIssue).not.toHaveBeenCalled();
      expect(mockIssueTrackerService.reopenIssue).not.toHaveBeenCalled();
    });

    it("should bypass github issue call if issue metadata is incomplete", async () => {
      const bugId = "gh-repo-42";
      const requestPayload = {
        id: bugId,
        status: "closed",
        adminId: "admin-1",
      };

      // Missing githubRepo or gitIssueNumber
      const bugEntity = Bug.builder().setId(bugId).build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      await bugUseCases.updateStatus(new RequestModel("tx-id", requestPayload));

      expect(mockIssueTrackerService.closeIssue).not.toHaveBeenCalled();
    });

    it("should bypass github issue call if github token is empty", async () => {
      const noTokenBugUseCases = new BugUseCases(
        mockIssueTrackerService,
        mockStorageService,
        mockBugRepository,
        mockUserRepository,
        { getGitHubToken: () => "", getGitHubManagedRepos: () => [] },
      );

      const bugId = "gh-repo-42";
      const bugEntity = Bug.builder()
        .setId(bugId)
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .setGitIssueNumber(42)
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      await noTokenBugUseCases.updateStatus(
        new RequestModel("tx-id", {
          id: bugId,
          status: "closed",
          adminId: "admin-1",
        }),
      );

      expect(mockIssueTrackerService.closeIssue).not.toHaveBeenCalled();
    });

    it("should return error if id or status is missing", async () => {
      const requestPayload = { id: "", status: "", adminId: "admin-1" };
      const request = new RequestModel("tx-id", requestPayload);
      const response = await bugUseCases.updateStatus(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("Bug ID and status are required");
    });

    it("should return error if only id is missing", async () => {
      const requestPayload = { id: "", status: "closed", adminId: "admin-1" };
      const request = new RequestModel("tx-id", requestPayload);
      const response = await bugUseCases.updateStatus(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("Bug ID and status are required");
    });

    it("should return error if only status is missing", async () => {
      const requestPayload = { id: "123", status: "", adminId: "admin-1" };
      const request = new RequestModel("tx-id", requestPayload);
      const response = await bugUseCases.updateStatus(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("Bug ID and status are required");
    });

    it("should not call GitHub closeIssue if githubRepo or gitIssueNumber is missing", async () => {
      const bugId = "gh-repo-42";
      const requestPayload = {
        id: bugId,
        status: "closed",
        adminId: "admin-1",
      };

      const bugEntity = createMockBug(bugId, "New Bug", "open");
      bugEntity.githubRepo = ""; // missing repo
      bugEntity.gitIssueNumber = 42;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      await bugUseCases.updateStatus(new RequestModel("tx-id", requestPayload));

      expect(mockIssueTrackerService.closeIssue).not.toHaveBeenCalled();
    });

    it("should return updateStatus DB result even if bug entity data is missing", async () => {
      const bugId = "gh-repo-42";
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(
          Bug.builder().setId(bugId).build(),
        ),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(null as any),
      );
      const response = await bugUseCases.updateStatus(
        new RequestModel("tx-id", {
          id: bugId,
          status: "closed",
          adminId: "admin-1",
        }),
      );
      expect(response.data).toBeNull();
    });

    it("should return error if bug is not found in database", async () => {
      const bugId = "non-existent-id";
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(null),
      );

      const response = await bugUseCases.updateStatus(
        new RequestModel("tx-id", {
          id: bugId,
          status: "closed",
          adminId: "admin-1",
        }),
      );

      expect(response.errorCode).toBe(DomainErrorCodes.NOT_FOUND);
      expect(response.message).toBe("Bug not found.");
    });

    it("should successfully approve and push a local pending bug to GitHub, applying admin edits", async () => {
      const bugId = "local-10";
      const requestPayload = {
        id: bugId,
        status: "open",
        adminId: "admin-123",
        title: "Revised Admin Title",
        description: "Revised Admin Description",
        priority: "high" as const,
        category: "Other",
        githubRepo: "VariaMos/VariaMosAdmin",
      };

      const bugEntity = Bug.builder()
        .setId(bugId)
        .setTitle("Original Title")
        .setDescription("Original Description")
        .setPriority("low")
        .setCategory("Editor")
        .setStatus("pending")
        .setReporterEmail("user@test.com")
        .setAttachments([
          { filePath: "/uploads/my-file.png", fileType: "image/png" },
        ])
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(777);

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      const response = await bugUseCases.updateStatus(request);

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "Revised Admin Title",
        expect.stringContaining("*Reported locally by: user@test.com*"),
        ["bug", "other", "high"],
        "dummy-token-from-test",
      );

      // Verify fields are present
      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.stringContaining("*Priority: high*"),
        expect.any(Array),
        expect.any(String),
      );
      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.stringContaining("*Category: Other*"),
        expect.any(Array),
        expect.any(String),
      );

      expect(mockBugRepository.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bugId: bugId,
            body:
              "[Audit] The administrator modified the following fields:\n" +
              '* Title: "Original Title" -> "Revised Admin Title"\n' +
              '* Description: "Original Description" -> "Revised Admin Description"\n' +
              '* Category: "Editor" -> "Other"\n' +
              '* Priority: "low" -> "high"\n' +
              '* Target repository set to "VariaMos/VariaMosAdmin"',
          }),
        }),
      );

      expect(mockBugRepository.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: bugId,
            status: "open",
            gitIssueNumber: 777,
            githubHtmlUrl:
              "https://github.com/VariaMos/VariaMosAdmin/issues/777",
            title: "Revised Admin Title",
            description: "Revised Admin Description",
            priority: "high",
            category: "Other",
            githubRepo: "VariaMos/VariaMosAdmin",
          }),
        }),
      );
    });

    it("should successfully approve a bug without applying optional edits and not overwrite fields with undefined", async () => {
      const bugId = "local-10";
      const requestPayload = {
        id: bugId,
        status: "open",
        adminId: "admin-123",
      };

      const bugEntity = Bug.builder()
        .setId(bugId)
        .setTitle("Keep Original Title")
        .setDescription("Keep Original Description")
        .setPriority("medium")
        .setCategory("Editor")
        .setStatus("pending")
        .setReporterEmail("user@test.com")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .setAttachments([])
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(888);

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      expect(bugEntity.title).toBe("Keep Original Title");
      expect(bugEntity.category).toBe("Editor");
      expect(bugEntity.priority).toBe("medium");

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        "Keep Original Title",
        expect.stringContaining("Keep Original Description"),
        expect.arrayContaining(["bug", "editor", "medium"]),
        "dummy-token-from-test",
      );

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.not.stringContaining("Approved and pushed to GitHub by:"),
        expect.any(Array),
        expect.any(String),
      );

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.not.stringContaining("### Attachments"),
        expect.any(Array),
        expect.any(String),
      );

      expect(mockBugRepository.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bugId: bugId,
            body: "[Audit] The bug was approved and sent to GitHub. The fields were not modified by the administrator.",
          }),
        }),
      );
    });

    it("should log no modifications if fields are supplied in payload but match current bug values", async () => {
      const bugId = "local-10";
      const requestPayload = {
        id: bugId,
        status: "open",
        adminId: "admin-123",
        title: "Keep Original Title",
        description: "Keep Original Description",
        priority: "medium" as const,
        category: "Editor",
        githubRepo: "VariaMos/VariaMosAdmin",
      };

      const bugEntity = Bug.builder()
        .setId(bugId)
        .setTitle("Keep Original Title")
        .setDescription("Keep Original Description")
        .setPriority("medium")
        .setCategory("Editor")
        .setStatus("pending")
        .setReporterEmail("user@test.com")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .setAttachments([])
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(888);

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      // Verify that createNote gets the "no modifications" message because values did not change
      expect(mockBugRepository.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bugId: bugId,
            body: "[Audit] The bug was approved and sent to GitHub. The fields were not modified by the administrator.",
          }),
        }),
      );
    });

    it("should not create a note when updating status to closed", async () => {
      const bugId = "local-10";
      const requestPayload = {
        id: bugId,
        status: "closed",
        adminId: "admin-123",
        title: "Changed Title",
      };

      const bugEntity = Bug.builder()
        .setId(bugId)
        .setTitle("Keep Original Title")
        .setDescription("Keep Original Description")
        .setPriority("medium")
        .setStatus("pending")
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      // Verify that createNote is NOT called because status is closed (not open)
      expect(mockBugRepository.createNote).not.toHaveBeenCalled();
    });

    it("should filter out /purged attachments when approving and pushing to GitHub", async () => {
      const bugId = "local-10";
      const requestPayload = {
        id: bugId,
        status: "open",
        adminId: "admin-123",
      };

      const bugEntity = Bug.builder()
        .setId(bugId)
        .setTitle("Bug with Attachments")
        .setDescription("Test description")
        .setPriority("medium")
        .setCategory("Editor")
        .setStatus("pending")
        .setReporterEmail("user@test.com")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .setAttachments([
          { filePath: "/uploads/valid.png", fileType: "image/png" },
          { filePath: "/purged", fileType: "image/png" },
          { filePath: "/uploads/no-type.png", fileType: undefined },
        ])
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(889);

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        "Bug with Attachments",
        expect.stringContaining(
          "http://localhost:4000/uploads/valid.png) (Type: image/png)",
        ),
        expect.any(Array),
        "dummy-token-from-test",
      );

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        "Bug with Attachments",
        expect.stringContaining(
          "http://localhost:4000/uploads/no-type.png) (Type: unknown)",
        ),
        expect.any(Array),
        "dummy-token-from-test",
      );

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        "Bug with Attachments",
        expect.stringContaining("*Category: Editor*"),
        expect.any(Array),
        "dummy-token-from-test",
      );

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        "Bug with Attachments",
        expect.not.stringContaining("/purged"),
        expect.any(Array),
        "dummy-token-from-test",
      );
    });

    it("should approve a bug and not append priority if it is missing", async () => {
      const bugId = "local-10";
      const requestPayload = {
        id: bugId,
        status: "open",
        adminId: "admin-123",
      };

      const bugEntity = Bug.builder()
        .setId(bugId)
        .setTitle("Bug Without Priority")
        .setDescription("Test description")
        .setCategory("Editor")
        .setStatus("pending")
        .setReporterEmail("user@test.com")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(890);

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        "Bug Without Priority",
        expect.not.stringContaining("Priority:"),
        expect.any(Array),
        "dummy-token-from-test",
      );
    });

    it("should bypass github issue call if status is closed but gitIssueNumber is missing", async () => {
      const bugId = "local-10";
      const bugEntity = Bug.builder()
        .setId(bugId)
        .setStatus("open")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      await bugUseCases.updateStatus(
        new RequestModel("tx-id", {
          id: bugId,
          status: "closed",
          adminId: "admin-1",
        }),
      );

      expect(mockIssueTrackerService.closeIssue).not.toHaveBeenCalled();
      expect(mockConfig.getGitHubToken).not.toHaveBeenCalled();
    });

    it("should bypass GitHub issue creation when status change is closed and bug has no issue number", async () => {
      const bugId = "local-10";
      const bugEntity = Bug.builder()
        .setId(bugId)
        .setStatus("pending")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      await bugUseCases.updateStatus(
        new RequestModel("tx-id", {
          id: bugId,
          status: "closed",
          adminId: "admin-1",
        }),
      );

      expect(mockIssueTrackerService.createIssue).not.toHaveBeenCalled();
    });

    it("should not create GitHub issue on approval if bug already has gitIssueNumber", async () => {
      const bugId = "local-10";
      const bugEntity = Bug.builder()
        .setId(bugId)
        .setStatus("pending")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .setGitIssueNumber(555)
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      await bugUseCases.updateStatus(
        new RequestModel("tx-id", {
          id: bugId,
          status: "open",
          adminId: "admin-1",
        }),
      );

      expect(mockIssueTrackerService.createIssue).not.toHaveBeenCalled();
    });

    it("should return error if GitHub token is missing when approving a bug", async () => {
      const noTokenBugUseCases = new BugUseCases(
        mockIssueTrackerService,
        mockStorageService,
        mockBugRepository,
        mockUserRepository,
        { getGitHubToken: () => "", getGitHubManagedRepos: () => [] },
      );

      const bugId = "local-10";
      const bugEntity = Bug.builder()
        .setId(bugId)
        .setStatus("pending")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      const response = await noTokenBugUseCases.updateStatus(
        new RequestModel("tx-id", {
          id: bugId,
          status: "open",
          adminId: "admin-123",
        }),
      );

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain(
        "GitHub integration token is not configured",
      );
    });

    it("should return error if GitHub push fails when approving a bug", async () => {
      const bugId = "local-10";
      const bugEntity = Bug.builder()
        .setId(bugId)
        .setStatus("pending")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(undefined as any);

      const response = await bugUseCases.updateStatus(
        new RequestModel("tx-id", {
          id: bugId,
          status: "open",
          adminId: "admin-123",
        }),
      );

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain(
        "Failed to push bug to GitHub repository",
      );
    });
  });

  describe("rejectBug", () => {
    it("should successfully reject a pending local bug", async () => {
      const bugId = "123";
      const pendingBug = createMockBug(bugId, "Test Bug", "pending");

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(pendingBug),
      );
      mockBugRepository.rejectBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse({
          ...pendingBug,
          status: "rejected",
        } as Bug),
      );

      const request = new RequestModel("tx-id", {
        id: bugId,
        adminId: "admin-1",
      });
      const response = await bugUseCases.rejectBug(request);

      expect(mockBugRepository.findById).toHaveBeenCalledWith(
        expect.objectContaining({ data: bugId }),
      );
      expect(mockBugRepository.rejectBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: bugId, adminId: "admin-1", logComment: "Bug rejected." },
        }),
      );
      expect(response.data?.status).toBe("rejected");
    });

    it("should return error if bug is not found", async () => {
      const bugId = "missing";
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(null),
      );

      const request = new RequestModel("tx-id", {
        id: bugId,
        adminId: "admin-1",
      });
      const response = await bugUseCases.rejectBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.NOT_FOUND);
      expect(response.message).toContain("Local bug not found");
    });

    it("should return error if bug is not pending", async () => {
      const bugId = "123";
      const activeBug = createMockBug(bugId, "Test Bug", "open");

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(activeBug),
      );

      const request = new RequestModel("tx-id", {
        id: bugId,
        adminId: "admin-1",
      });
      const response = await bugUseCases.rejectBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("Only pending bugs can be rejected");
      expect(mockBugRepository.rejectBug).not.toHaveBeenCalled();
    });

    it("should return error if ID is missing in request", async () => {
      const request = new RequestModel("tx-id", { id: "", adminId: "admin-1" });
      const response = await bugUseCases.rejectBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("Bug ID is required");
    });
  });

  describe("restoreBug", () => {
    it("should successfully restore a rejected bug", async () => {
      const bugId = "123";
      const rejectedBug = createMockBug(bugId, "Test Bug", "rejected");

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(rejectedBug),
      );
      mockBugRepository.restoreBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse({
          ...rejectedBug,
          status: "pending",
        } as Bug),
      );

      const request = new RequestModel("tx-id", {
        id: bugId,
        adminId: "admin-1",
      });
      const response = await bugUseCases.restoreBug(request);

      expect(mockBugRepository.restoreBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: bugId, adminId: "admin-1", logComment: "Bug restored." },
        }),
      );
      expect(response.data?.status).toBe("pending");
    });

    it("should return error if bug is not found", async () => {
      const bugId = "missing";
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(null),
      );

      const request = new RequestModel("tx-id", {
        id: bugId,
        adminId: "admin-1",
      });
      const response = await bugUseCases.restoreBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.NOT_FOUND);
      expect(response.message).toContain("Local bug not found");
    });

    it("should return error if bug is not rejected", async () => {
      const bugId = "123";
      const pendingBug = createMockBug(bugId, "Test Bug", "pending");

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(pendingBug),
      );

      const request = new RequestModel("tx-id", {
        id: bugId,
        adminId: "admin-1",
      });
      const response = await bugUseCases.restoreBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("Only rejected bugs can be restored");
      expect(mockBugRepository.restoreBug).not.toHaveBeenCalled();
    });

    it("should return error if ID is missing in request", async () => {
      const request = new RequestModel("tx-id", { id: "", adminId: "admin-1" });
      const response = await bugUseCases.restoreBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("Bug ID is required");
    });
  });

  describe("purgeExpiredRejectedBugs", () => {
    it("should process purge for expired bugs and delete attachments", async () => {
      const expiredBug = createMockBug("999", "Old rejected bug", "rejected");
      expiredBug.attachments = [{ id: 1, filePath: "/uploads/old.png" }];

      const infoLogSpy = jest
        .spyOn(logger, "info")
        .mockImplementation(() => {});

      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await bugUseCases.purgeExpiredRejectedBugs();

      expect(mockBugRepository.findExpiredRejectedBugs).toHaveBeenCalled();
      const dateArg =
        mockBugRepository.findExpiredRejectedBugs.mock.calls[0][0].data;
      expect(dateArg).toBeDefined();
      const now = new Date();
      const differenceInDays =
        (now.getTime() - (dateArg as Date).getTime()) / (1000 * 3600 * 24);
      expect(differenceInDays).toBeCloseTo(7, 0);

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        "/uploads/old.png",
      );
      expect(mockBugRepository.updateAttachmentPath).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "purgeExpiredBugs",
          data: { id: 1, filePath: "/purged" },
        }),
      );
      expect(mockBugRepository.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "purgeExpiredBugs",
          data: { id: "999", status: "purged", adminId: "" },
        }),
      );
      expect(mockBugRepository.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "purgeExpiredBugs",
          data: {
            action: "purge",
            comment:
              "Bug status changed to purged. Physical attachments deleted due to retention policy.",
            bugId: "999",
          },
        }),
      );

      expect(infoLogSpy).toHaveBeenCalledWith(
        "Found 1 expired rejected bugs to purge.",
      );
      expect(infoLogSpy).toHaveBeenCalledWith(
        "Expired rejected bugs purging complete.",
      );
      infoLogSpy.mockRestore();
    });

    it("should handle logical branches when attachments list is empty or invalid", async () => {
      const expiredBug = createMockBug("1", "New Bug", "rejected");
      expiredBug.attachments = undefined; // No attachments

      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await bugUseCases.purgeExpiredRejectedBugs();

      expect(mockBugRepository.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: "1", status: "purged" }),
        }),
      );
      expect(mockBugRepository.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            action: "purge",
            comment: "Bug status changed to purged. No attachments to delete.",
            bugId: "1",
          },
        }),
      );
    });

    it("should handle logical branches when attachments is not an array", async () => {
      const expiredBug = createMockBug("1-non-array", "New Bug", "rejected");
      expiredBug.attachments = { key: "value" } as any; // Pass truthy non-iterable object to verify Array.isArray safeguard

      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await bugUseCases.purgeExpiredRejectedBugs();

      expect(mockBugRepository.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: "1-non-array",
            status: "purged",
          }),
        }),
      );
      expect(mockBugRepository.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            comment: "Bug status changed to purged. No attachments to delete.",
          }),
        }),
      );
    });

    it("should handle logical branches when expiredResponse.data is null", async () => {
      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse(null), // data is null
      );
      await bugUseCases.purgeExpiredRejectedBugs();
      expect(mockBugRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("should return early when expiredBugs is empty", async () => {
      const infoLogSpy = jest
        .spyOn(logger, "info")
        .mockImplementation(() => {});
      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([]),
      );
      await bugUseCases.purgeExpiredRejectedBugs();
      expect(mockBugRepository.updateStatus).not.toHaveBeenCalled();
      expect(infoLogSpy).not.toHaveBeenCalled(); // Verify no logs are written to confirm immediate early exit
      infoLogSpy.mockRestore();
    });

    it("should ignore purge actions on attachments with purged filePath", async () => {
      const expiredBug = createMockBug("2", "New Bug", "rejected");
      expiredBug.attachments = [{ id: 1, filePath: "/purged" }];

      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await bugUseCases.purgeExpiredRejectedBugs();

      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
      expect(mockBugRepository.updateAttachmentPath).not.toHaveBeenCalled();
    });

    it("should catch error and log it if repository function throws", async () => {
      const errorLogSpy = jest
        .spyOn(logger, "err")
        .mockImplementation(() => {});
      mockBugRepository.findExpiredRejectedBugs.mockRejectedValue(
        new Error("DB failure"),
      );

      await bugUseCases.purgeExpiredRejectedBugs();

      expect(errorLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to purge expired rejected bugs: DB failure",
        ),
      );
      errorLogSpy.mockRestore();
    });
  });

  describe("queryBugRepos", () => {
    it("should catch error and route to internal error on repositories fetch failure", async () => {
      const errorLogSpy = jest
        .spyOn(logger, "err")
        .mockImplementation(() => {});
      const errorConfig = {
        getGitHubToken: () => "token",
        getGitHubManagedRepos: () => {
          throw new Error("config fail");
        },
      };

      const customBugUseCases = new BugUseCases(
        mockIssueTrackerService,
        mockStorageService,
        mockBugRepository,
        mockUserRepository,
        errorConfig,
      );

      const response = await customBugUseCases.queryBugRepos(
        new RequestModel("tx-id"),
      );
      expect(response.errorCode).toBe(DomainErrorCodes.INTERNAL_ERROR);
      expect(response.message).toBe("config fail");
      errorLogSpy.mockRestore();
    });
  });

  describe("syncBugs", () => {
    it("should ignore issues if issue tracker returns null or empty list", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue(null);
      await bugUseCases.syncBugs(new RequestModel("tx-id"));
      expect(mockBugRepository.saveOrUpdateBug).not.toHaveBeenCalled();
    });

    it("should bypass pull requests issues", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue([
        { number: 1, title: "Bug PR", pull_request: {} }, // is a PR
      ]);
      await bugUseCases.syncBugs(new RequestModel("tx-id"));
      expect(mockBugRepository.saveOrUpdateBug).not.toHaveBeenCalled();
    });

    it("should map issue priority correctly (high, medium, default, low cases with varied labels)", async () => {
      const infoLogSpy = jest
        .spyOn(logger, "info")
        .mockImplementation(() => {});

      mockIssueTrackerService.getIssues.mockResolvedValue([
        {
          number: 1,
          title: "Bug 1",
          labels: [{ name: "priority: low" }, { name: "bug" }], // Verify priority matching handles multiple labels on the same issue
        },
        { number: 2, title: "Bug 2", labels: null },
        {
          number: 3,
          title: "Bug 3",
          labels: [{ name: "critical" }, { name: "documentation" }], // Verify high priority matching handles multiple labels
          state: "closed",
        },
        { number: 4, title: "Bug 4", labels: [{ name: "p3" }] },
        { number: 5, title: "Bug 5", labels: [{ name: "minor" }] },
        { number: 6, title: "Bug 6", labels: [{ name: "p1" }] },
        { number: 7, title: "Bug 7", labels: [{ name: "urg" }] },
      ]);

      mockBugRepository.saveOrUpdateBug
        .mockResolvedValueOnce(
          new ResponseModel<any>("tx-id").withResponse({ created: true }),
        )
        .mockResolvedValueOnce(
          new ResponseModel<any>("tx-id").withResponse({ updated: true }),
        )
        .mockResolvedValueOnce(
          new ResponseModel<any>("tx-id").withResponse({
            created: false,
            updated: false,
          }),
        )
        .mockResolvedValueOnce(
          new ResponseModel<any>("tx-id").withResponse({ created: true }),
        )
        .mockResolvedValueOnce(
          new ResponseModel<any>("tx-id").withResponse({ created: true }),
        )
        .mockResolvedValueOnce(
          new ResponseModel<any>("tx-id").withResponse({ created: true }),
        )
        .mockResolvedValueOnce(
          new ResponseModel<any>("tx-id").withResponse({ created: true }),
        );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(infoLogSpy).toHaveBeenCalledWith(
        "Synchronization finished: Created 5 and Updated 1 bugs.",
      );
      infoLogSpy.mockRestore();

      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "low", title: "Bug 1" }),
        }),
      );
      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "medium", title: "Bug 2" }),
        }),
      );
      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          data: expect.objectContaining({
            priority: "high",
            title: "Bug 3",
            status: "closed",
          }),
        }),
      );
      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "low", title: "Bug 4" }),
        }),
      );
      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        5,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "low", title: "Bug 5" }),
        }),
      );
      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        6,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "high", title: "Bug 6" }),
        }),
      );
      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        7,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "high", title: "Bug 7" }),
        }),
      );
    });

    it("should return error if GitHub token is missing", async () => {
      const warnLogSpy = jest
        .spyOn(logger, "warn")
        .mockImplementation(() => {});
      const mockConfigNoToken = {
        getGitHubToken: () => "",
        getGitHubManagedRepos: () => ["VariaMos/VariaMosAdmin"],
      };
      const customBugUseCases = new BugUseCases(
        mockIssueTrackerService,
        mockStorageService,
        mockBugRepository,
        mockUserRepository,
        mockConfigNoToken,
      );

      const request = new RequestModel<void>("tx-id");
      const response = await customBugUseCases.syncBugs(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("GitHub Sync is not configured.");
      expect(warnLogSpy).toHaveBeenCalledWith(
        "GitHub token is not defined in environment variables. Synchronization aborted.",
      );
      warnLogSpy.mockRestore();
    });

    it("should fall back to defaults when issue description, url, updated_at or user login is missing", async () => {
      const infoLogSpy = jest
        .spyOn(logger, "info")
        .mockImplementation(() => {});
      mockIssueTrackerService.getIssues.mockResolvedValue([
        {
          number: 5,
          title: "Bug without meta",
          body: null, // no description
          user: {}, // user object exists but has no login property
          assignee: {}, // assignee object exists but has no login property
          html_url: null, // Verify fallback to empty string when html_url is missing
          created_at: "2026-06-17T00:00:00Z",
          updated_at: null, // Verify fallback to created_at when updated_at is missing
        },
      ]);

      mockBugRepository.saveOrUpdateBug.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({ created: true }),
      );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: "No description provided.",
            githubCreator: "System", // falls back to System
            status: "open",
            githubAssignee: undefined, // falls back to undefined
            githubHtmlUrl: "", // checks htmlUrl fallback!
            updatedAt: new Date("2026-06-17T00:00:00Z"), // checks updatedAt fallback!
          }),
        }),
      );
      expect(infoLogSpy).toHaveBeenCalledWith(
        "Starting bugs sync for repos: VariaMos/VariaMosAdmin",
      );
      expect(infoLogSpy).toHaveBeenCalledWith(
        "Synchronization finished: Created 1 and Updated 0 bugs.",
      );
      infoLogSpy.mockRestore();
    });

    it("should map issue priority to medium if labels is not an array", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue([
        {
          number: 5,
          title: "Bug with invalid labels",
          labels: "not-an-array" as any, // Not an array to check Array.isArray
          created_at: "2026-06-17T00:00:00Z",
        },
      ]);

      mockBugRepository.saveOrUpdateBug.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({ created: true }),
      );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: "medium",
          }),
        }),
      );
    });

    it("should map issue assignee and creator correctly when objects exist", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue([
        {
          number: 6,
          title: "Bug with creator and assignee",
          body: "Desc",
          user: { login: "octocat" },
          assignee: { login: "dev-admin" },
          state: "open", // state open -> maps to open status (covers line 387)
          created_at: "2026-06-17T00:00:00Z",
        },
      ]);

      mockBugRepository.saveOrUpdateBug.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({ created: true }),
      );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            githubCreator: "octocat",
            githubAssignee: "dev-admin",
            status: "open",
          }),
        }),
      );
    });

    it("should handle syncBugs when saveOrUpdateBug returns null data", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue([
        {
          number: 7,
          title: "Bug with no save response data",
          body: "Desc",
          user: { login: "octocat" },
          state: "open",
          created_at: "2026-06-17T00:00:00Z",
        },
      ]);

      mockBugRepository.saveOrUpdateBug.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse(null), // returns null data
      );

      const response = await bugUseCases.syncBugs(new RequestModel("tx-id"));
      expect(response.errorCode).toBeUndefined();
    });

    it("should fall back to medium priority if labels exist but do not match low/high keywords", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue([
        {
          number: 8,
          title: "Bug with unrelated labels",
          body: "Desc",
          labels: [{ name: "documentation" }, { name: "enhancement" }],
          state: "open",
          created_at: "2026-06-17T00:00:00Z",
        },
      ]);

      mockBugRepository.saveOrUpdateBug.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({ created: true }),
      );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: "medium", // falls back to medium
          }),
        }),
      );
    });

    it("should catch error and log it on synchronization failures", async () => {
      const errorLogSpy = jest
        .spyOn(logger, "err")
        .mockImplementation(() => {});
      mockIssueTrackerService.getIssues.mockRejectedValue(
        new Error("Network loss"),
      );

      const response = await bugUseCases.syncBugs(new RequestModel("tx-id"));
      expect(response.errorCode).toBe(DomainErrorCodes.INTERNAL_ERROR);
      expect(response.message).toBe("Network loss");
      errorLogSpy.mockRestore();
    });

    it("should map issue label matching category to bug category", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue([
        {
          number: 10,
          title: "Editor Bug",
          body: "Desc",
          labels: [{ name: "Editor" }],
          created_at: "2026-06-17T00:00:00Z",
        },
      ]);

      mockBugRepository.saveOrUpdateBug.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({ created: true }),
      );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: "Editor",
          }),
        }),
      );
    });

    it("should map issue category correctly when there are multiple labels and the matching label is not the first one", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue([
        {
          number: 11,
          title: "Simulation Bug With Extra Labels",
          body: "Desc",
          labels: [{ name: "unrelated-label" }, { name: "simulation" }],
          created_at: "2026-06-17T00:00:00Z",
        },
      ]);

      mockBugRepository.saveOrUpdateBug.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({ created: true }),
      );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(mockBugRepository.saveOrUpdateBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: "Simulation",
          }),
        }),
      );
    });
  });

  describe("queryCategories", () => {
    it("should return ALLOWED_CATEGORIES successfully", async () => {
      const response = await bugUseCases.queryCategories(
        new RequestModel("tx-id"),
      );
      expect(response.data).toEqual(ALLOWED_CATEGORIES);
    });
  });

  describe("addAttachment", () => {
    it("should return error if file is missing in request", async () => {
      const request = new RequestModel("tx-id", {
        bugId: "local-1",
        file: null,
      });
      const response = await bugUseCases.addAttachment(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("File is required.");
    });

    it("should call repository createAttachment successfully when file is present", async () => {
      const fileData = { filename: "test.png", mimetype: "image/png" };
      mockBugRepository.createAttachment.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({ id: 99 }),
      );

      const request = new RequestModel("tx-id", {
        bugId: "local-1",
        file: fileData,
      });
      const response = await bugUseCases.addAttachment(request);

      expect(mockBugRepository.createAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            filePath: "/uploads/test.png",
            fileType: "image/png",
            bugId: "local-1",
          },
        }),
      );
      expect(response.data.id).toBe(99);
    });
  });

  describe("deleteAttachment", () => {
    it("should return error if attachment is not found in database", async () => {
      mockBugRepository.findAttachmentById.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse(null),
      );

      const response = await bugUseCases.deleteAttachment(
        new RequestModel("tx-id", "att-invalid"),
      );
      expect(response.errorCode).toBe(DomainErrorCodes.NOT_FOUND);
      expect(response.message).toContain("Attachment not found.");
    });

    it("should delete physical file and record if attachment is found", async () => {
      mockBugRepository.findAttachmentById.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({
          id: "att-123",
          filePath: "/uploads/img.png",
        }),
      );
      mockBugRepository.deleteAttachment.mockResolvedValue(
        new ResponseModel<void>("tx-id").withResponse(undefined),
      );

      const response = await bugUseCases.deleteAttachment(
        new RequestModel("tx-id", "att-123"),
      );

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        "/uploads/img.png",
      );
      expect(mockBugRepository.deleteAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ data: "att-123" }),
      );
      expect(response.errorCode).toBeUndefined();
    });

    it("should bypass physical file deletion if path is /purged", async () => {
      mockBugRepository.findAttachmentById.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({
          id: "att-123",
          filePath: "/purged",
        }),
      );
      mockBugRepository.deleteAttachment.mockResolvedValue(
        new ResponseModel<void>("tx-id").withResponse(undefined),
      );

      await bugUseCases.deleteAttachment(new RequestModel("tx-id", "att-123"));

      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
      expect(mockBugRepository.deleteAttachment).toHaveBeenCalled();
    });

    it("should handle error when storage service deleteFile throws", async () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

      mockBugRepository.findAttachmentById.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({
          id: "att-123",
          filePath: "/uploads/img.png",
        }),
      );
      mockStorageService.deleteFile.mockRejectedValue(new Error("Disk error"));
      mockBugRepository.deleteAttachment.mockResolvedValue(
        new ResponseModel<void>("tx-id").withResponse(undefined),
      );

      const response = await bugUseCases.deleteAttachment(
        new RequestModel("tx-id", "att-123"),
      );

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        "/uploads/img.png",
      );
      expect(mockBugRepository.deleteAttachment).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        "Failed to delete physical file: /uploads/img.png",
      );
      expect(response.errorCode).toBeUndefined();

      warnSpy.mockRestore();
    });
  });

  describe("GitHub App Hybrid Authentication Strategy", () => {
    let appConfig: IBugTrackerConfig;
    let appBugUseCases: BugUseCases;
    let appPublicKey: string;
    let appPrivateKey: string;

    beforeEach(() => {
      const { privateKey, publicKey } = crypto.generateKeyPairSync(
        "rsa" as any,
        {
          modulusLength: 1024,
          privateKeyEncoding: { type: "pkcs1", format: "pem" },
          publicKeyEncoding: { type: "pkcs1", format: "pem" },
        },
      );
      appPrivateKey = privateKey;
      appPublicKey = publicKey;

      appConfig = {
        getGitHubToken: () => "pat-token-fallback",
        getGitHubManagedRepos: () => ["VariaMos/VariaMosAdmin"],
        getGitHubAppId: () => "123456",
        getGitHubPrivateKey: () => privateKey as any,
      };

      appBugUseCases = new BugUseCases(
        mockIssueTrackerService,
        mockStorageService,
        mockBugRepository,
        mockUserRepository,
        appConfig,
      );

      jest.clearAllMocks();
      mockedAxios.get.mockReset();
      mockedAxios.post.mockReset();
    });

    it("should successfully resolve a temporary token from GitHub App, cache it, and request a new one only when expired", async () => {
      mockedAxios.get.mockResolvedValue({ data: { id: 98765 } } as any);
      mockedAxios.post
        .mockResolvedValueOnce({
          data: {
            token: "ghs_token_1",
            expires_at: new Date(Date.now() + 600000).toISOString(),
          },
        } as any)
        .mockResolvedValueOnce({
          data: {
            token: "ghs_token_2",
            expires_at: new Date(Date.now() + 600000).toISOString(),
          },
        } as any);

      mockBugRepository.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-1").withResponse([]),
      );
      mockIssueTrackerService.getIssues.mockResolvedValue([]);

      // 1st call: No cached token, requests token from GitHub App API
      await appBugUseCases.syncBugs(new RequestModel("tx-1"));
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://api.github.com/repos/VariaMos/VariaMosAdmin/installation",
        expect.any(Object),
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://api.github.com/app/installations/98765/access_tokens",
        {},
        expect.any(Object),
      );
      expect(mockIssueTrackerService.getIssues).toHaveBeenLastCalledWith(
        "VariaMos/VariaMosAdmin",
        "ghs_token_1",
      );

      // 2nd call: Token is still valid, reuse cached token without calling GitHub API again
      await appBugUseCases.syncBugs(new RequestModel("tx-2"));
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      // Manually expire cached token by mocking Time or let it be expired
      const cached = (appBugUseCases as any).tokenCache.get(
        "VariaMos/VariaMosAdmin",
      );
      if (cached) cached.expiresAt = Date.now() - 1000;

      // 3rd call: Token expired, requests new token from GitHub App API
      await appBugUseCases.syncBugs(new RequestModel("tx-3"));
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockIssueTrackerService.getIssues).toHaveBeenLastCalledWith(
        "VariaMos/VariaMosAdmin",
        "ghs_token_2",
      );
    });

    it("should generate a mathematically valid JWT and check Axios headers strictly when App configs contain spaces or literal \\n", async () => {
      const literalKey = appPrivateKey.replace(/\n/g, "\\n");
      const configWithSpacesAndLiteral = {
        getGitHubToken: () => "pat-token-fallback",
        getGitHubManagedRepos: () => ["VariaMos/VariaMosAdmin"],
        getGitHubAppId: () => "   123456   ",
        getGitHubPrivateKey: () => `   ${literalKey}   `,
      };

      const useCasesSpacesAndLiteral = new BugUseCases(
        mockIssueTrackerService,
        mockStorageService,
        mockBugRepository,
        mockUserRepository,
        configWithSpacesAndLiteral,
      );

      mockedAxios.get.mockResolvedValueOnce({ data: { id: 98765 } } as any);
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          token: "ghs_token_literal",
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      } as any);

      mockIssueTrackerService.getIssues.mockResolvedValueOnce([]);
      await useCasesSpacesAndLiteral.syncBugs(new RequestModel("tx-1"));

      // Verify axios.get parameters & Authorization JWT format
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://api.github.com/repos/VariaMos/VariaMosAdmin/installation",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(
              /^Bearer [A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
            ),
            Accept: "application/vnd.github+json",
            "User-Agent": "VariaMos-MS-Admin",
          }),
        }),
      );

      const authHeader =
        mockedAxios.get.mock.calls[0][1]?.headers?.Authorization;
      const jwtToken = authHeader.split(" ")[1];
      const segments = jwtToken.split(".");
      expect(segments).toHaveLength(3);

      // Verify payload and JWT algorithm header
      const headerObj = JSON.parse(
        Buffer.from(segments[0], "base64url").toString("utf8"),
      );
      expect(headerObj.alg).toBe("RS256");
      expect(headerObj.typ).toBe("JWT");

      const payloadObj = JSON.parse(
        Buffer.from(segments[1], "base64url").toString("utf8"),
      );
      expect(payloadObj.iss).toBe("123456");
      expect(
        Math.abs(payloadObj.iat - (Math.floor(Date.now() / 1000) - 60)),
      ).toBeLessThanOrEqual(3);
      expect(payloadObj.exp - payloadObj.iat).toBe(600);

      // Verify signature mathematically using the public key
      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(`${segments[0]}.${segments[1]}`);
      expect(verifier.verify(appPublicKey, segments[2], "base64url")).toBe(
        true,
      );

      // Verify axios.post parameters & headers
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://api.github.com/app/installations/98765/access_tokens",
        {},
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${jwtToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "VariaMos-MS-Admin",
          }),
        }),
      );
    });

    it("should fall back to PAT and log error if GitHub App installation API call throws, or skip if token resolution returns empty", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

      mockedAxios.get.mockRejectedValueOnce(
        new Error("API rate limit or invalid JWT"),
      );
      mockIssueTrackerService.getIssues.mockResolvedValueOnce([]);

      // Test 1: GitHub App API throws -> fallback to PAT and log error
      await appBugUseCases.syncBugs(new RequestModel("tx-1"));
      expect(mockIssueTrackerService.getIssues).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "pat-token-fallback",
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to resolve GitHub App token for VariaMos/VariaMosAdmin: API rate limit or invalid JWT",
        ),
      );

      // Test 2: Token resolution returns empty string -> skip repository sync
      mockedAxios.get.mockClear();
      mockedAxios.post.mockClear();
      mockIssueTrackerService.getIssues.mockClear();
      mockedAxios.get.mockRejectedValueOnce(new Error("API rate limit"));

      const configNoPat = {
        getGitHubToken: () => "",
        getGitHubManagedRepos: () => ["VariaMos/VariaMosAdmin"],
        getGitHubAppId: () => "123456",
        getGitHubPrivateKey: () => appPrivateKey,
      };

      const useCasesNoPat = new BugUseCases(
        mockIssueTrackerService,
        mockStorageService,
        mockBugRepository,
        mockUserRepository,
        configNoPat,
      );

      await useCasesNoPat.syncBugs(new RequestModel("tx-2"));
      expect(mockIssueTrackerService.getIssues).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        "GitHub token could not be resolved for repo: VariaMos/VariaMosAdmin. Skipping.",
      );

      loggerSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("should abort sync or fall back based on App and PAT configs truth table verification", async () => {
      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});
      const errSpy = jest.spyOn(logger, "err").mockImplementation(() => {});

      // Helper function to test config runs
      const testConfig = async (
        appId: string,
        privateKey: string,
        patToken: string,
      ) => {
        mockedAxios.get.mockClear();
        mockedAxios.post.mockClear();
        mockIssueTrackerService.getIssues.mockClear();
        warnSpy.mockClear();
        errSpy.mockClear();

        const createSignSpy = jest.spyOn(crypto, "createSign");

        const config = {
          getGitHubToken: () => patToken,
          getGitHubManagedRepos: () => ["VariaMos/VariaMosAdmin"],
          getGitHubAppId: () => appId,
          getGitHubPrivateKey: () => privateKey,
        };

        const useCases = new BugUseCases(
          mockIssueTrackerService,
          mockStorageService,
          mockBugRepository,
          mockUserRepository,
          config,
        );

        mockIssueTrackerService.getIssues.mockResolvedValue([]);
        mockedAxios.get.mockResolvedValue({ data: { id: 98765 } } as any);
        mockedAxios.post.mockResolvedValue({
          data: {
            token: "ghs_token",
            expires_at: new Date(Date.now() + 600000).toISOString(),
          },
        } as any);

        const res = await useCases.syncBugs(new RequestModel("tx-test"));
        const calledSign = createSignSpy.mock.calls.length > 0;
        createSignSpy.mockRestore();

        return { res, calledSign };
      };

      // Case 1: Both App and PAT configs empty/spaces -> aborts
      let { res, calledSign } = await testConfig("   ", "   ", "   ");
      expect(res.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(calledSign).toBe(false);
      expect(warnSpy).toHaveBeenLastCalledWith(
        "GitHub token is not defined in environment variables. Synchronization aborted.",
      );

      // Case 2: App ID exists but key missing, PAT missing -> aborts
      ({ res, calledSign } = await testConfig("123456", "   ", ""));
      expect(res.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(calledSign).toBe(false);
      expect(warnSpy).toHaveBeenLastCalledWith(
        "GitHub token is not defined in environment variables. Synchronization aborted.",
      );

      // Case 3: Private key exists but App ID missing, PAT missing -> aborts
      ({ res, calledSign } = await testConfig("", appPrivateKey, ""));
      expect(res.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(calledSign).toBe(false);
      expect(warnSpy).toHaveBeenLastCalledWith(
        "GitHub token is not defined in environment variables. Synchronization aborted.",
      );

      // Case 4: App configs missing, but PAT present -> succeeds and PAT is trimmed
      ({ res, calledSign } = await testConfig("", "", "   valid-pat   "));
      expect(res.errorCode).toBeUndefined();
      expect(calledSign).toBe(false);
      expect(mockIssueTrackerService.getIssues).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "valid-pat",
      );

      // Case 5: App config complete, PAT missing -> succeeds using App
      ({ res, calledSign } = await testConfig("123456", appPrivateKey, ""));
      expect(res.errorCode).toBeUndefined();
      expect(calledSign).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(errSpy).not.toHaveBeenCalled();

      // Case 6: App ID is only spaces, Private key valid, PAT missing -> aborts (confirms App ID trim)
      ({ res, calledSign } = await testConfig("   ", appPrivateKey, ""));
      expect(res.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(calledSign).toBe(false);

      // Case 7: Private key is only spaces, App ID valid, PAT missing -> aborts (confirms Private Key trim)
      ({ res, calledSign } = await testConfig("123456", "   ", ""));
      expect(res.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(calledSign).toBe(false);

      // Case 8: App ID valid, Private key spaces, PAT present -> succeeds with PAT, calledSign is false
      ({ res, calledSign } = await testConfig(
        "123456",
        "   ",
        "   valid-pat   ",
      ));
      expect(res.errorCode).toBeUndefined();
      expect(calledSign).toBe(false);
      expect(mockIssueTrackerService.getIssues).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "valid-pat",
      );

      // Case 9: Private key valid, App ID spaces, PAT present -> succeeds with PAT, calledSign is false
      ({ res, calledSign } = await testConfig(
        "   ",
        appPrivateKey,
        "   valid-pat   ",
      ));
      expect(res.errorCode).toBeUndefined();
      expect(calledSign).toBe(false);
      expect(mockIssueTrackerService.getIssues).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "valid-pat",
      );

      warnSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  describe("Category Hardening & Validation Verification", () => {
    it.each(ALLOWED_CATEGORIES)(
      "should accept and validate category: %s",
      async (category) => {
        const bugData = {
          title: "Category Verification",
          description: "Checking enum value",
          priority: "medium" as const,
          category: category,
          reporterEmail: "guest@example.com",
        };
        mockBugRepository.createBug.mockResolvedValue(
          new ResponseModel<Bug>("tx-id").withResponse(createMockBug("100")),
        );
        const request = new RequestModel("tx-id", bugData);
        const response = await bugUseCases.createBug(request);
        expect(response.errorCode).toBeUndefined();
      },
    );

    it("should successfully approve and push to GitHub a bug with no category without crashing or appending category string/labels", async () => {
      const bugId = "local-no-cat";
      const requestPayload = {
        id: bugId,
        status: "open",
        adminId: "admin-123",
      };

      const bugEntity = Bug.builder()
        .setId(bugId)
        .setTitle("Bug No Category")
        .setDescription("Test desc")
        .setPriority("high")
        .setStatus("pending")
        .setReporterEmail("user@test.com")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .setCategory(undefined as any) // category is undefined
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(999);

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      const response = await bugUseCases.updateStatus(request);

      expect(response.errorCode).toBeUndefined();
      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "Bug No Category",
        expect.not.stringContaining("Category:"),
        ["bug", "high"], // labels contain bug and priority, but no category!
        "dummy-token-from-test",
      );
    });

    it("should include admin comment in the GitHub issue description and the system note when approving a bug", async () => {
      const bugId = "local-comment-10";
      const requestPayload = {
        id: bugId,
        status: "open",
        adminId: "admin-123",
        adminEmail: "admin@example.com",
        comment: "This is a verification note",
      };

      const bugEntity = Bug.builder()
        .setId(bugId)
        .setTitle("Original Title")
        .setDescription("Original Description")
        .setPriority("medium")
        .setStatus("pending")
        .setReporterEmail("user@test.com")
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .build();

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug | null>("tx-id").withResponse(bugEntity),
      );

      mockIssueTrackerService.createIssue.mockResolvedValue(1001);

      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      // Verify validation comment is appended to GitHub issue signature
      expect(mockIssueTrackerService.createIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "Original Title",
        expect.stringContaining(
          '*Approved and pushed to GitHub by: admin@example.com (Comment: "This is a verification note")*',
        ),
        expect.any(Array),
        "dummy-token-from-test",
      );

      // Verify validation comment is appended to the system audit note
      expect(mockBugRepository.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bugId: bugId,
            body: expect.stringContaining(
              'Admin Comment: "This is a verification note"',
            ),
          }),
        }),
      );
    });
  });

  describe("Bug Notes Use Cases", () => {
    it("should successfully delegate createNote to the repository", async () => {
      const payload = { bugId: "123", body: "Hello", authorId: "admin-1" };
      const request = new RequestModel("tx-id", payload);

      await bugUseCases.createNote(request);

      expect(mockBugRepository.createNote).toHaveBeenCalledWith(request);
    });

    it("should successfully delegate queryNotes to the repository", async () => {
      const request = new RequestModel("tx-id", "123");

      await bugUseCases.queryNotes(request);

      expect(mockBugRepository.queryNotes).toHaveBeenCalledWith(request);
    });
  });
});
