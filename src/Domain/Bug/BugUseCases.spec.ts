import { BugUseCases, ALLOWED_CATEGORIES } from "./BugUseCases";
import { RequestModel } from "../Core/Entity/RequestModel";
import { Bug } from "./Entity/Bug";
import { ResponseModel } from "../Core/Entity/ResponseModel";
import { IBugTrackerConfig } from "./Config/IBugTrackerConfig";
import { DomainErrorCodes } from "../Core/Error/DomainErrorCodes";
import logger from "jet-logger";

describe("BugUseCases Unit Tests", () => {
  let bugUseCases: BugUseCases;
  let mockIssueTrackerService: any;
  let mockStorageService: any;
  let mockGitHubBugRepository: any;
  let mockLocalBugRepository: any;
  let mockUserRepository: any;
  let mockConfig: IBugTrackerConfig;

  beforeEach(() => {
    mockIssueTrackerService = {
      closeIssue: jest.fn(),
      reopenIssue: jest.fn(),
      getIssues: jest.fn(),
    };
    mockStorageService = {
      deleteFile: jest.fn(),
    };
    mockGitHubBugRepository = {
      queryBugs: jest.fn(),
      updateStatus: jest.fn(),
      saveOrUpdateBug: jest.fn(),
    };
    mockLocalBugRepository = {
      queryLocalBugs: jest.fn(),
      createBug: jest.fn(),
      queryHistory: jest.fn(),
      updateStatus: jest.fn(),
      findById: jest.fn(),
      rejectBug: jest.fn(),
      restoreBug: jest.fn(),
      findExpiredRejectedBugs: jest.fn(),
      updateAttachmentPath: jest.fn(),
      createLog: jest.fn(),
    };
    mockUserRepository = {
      findSessionUser: jest.fn(),
    };
    mockConfig = {
      getGitHubToken: () => "dummy-token-from-test",
      getGitHubManagedRepos: () => ["VariaMos/VariaMosAdmin"],
    };

    bugUseCases = new BugUseCases(
      mockIssueTrackerService,
      mockStorageService,
      mockGitHubBugRepository,
      mockLocalBugRepository,
      mockUserRepository,
      mockConfig,
    );
  });

  describe("queryBugs & queryLocalBugs & queryHistory", () => {
    it("should route queryBugs directly to gitHubBugRepository", async () => {
      mockGitHubBugRepository.queryBugs.mockResolvedValue(
        new ResponseModel("tx-id").withResponse([]),
      );
      const request = new RequestModel("tx-id", {
        repo: "VariaMos/VariaMosAdmin",
      } as any);
      await bugUseCases.queryBugs(request);
      expect(mockGitHubBugRepository.queryBugs).toHaveBeenCalledWith(request);
    });

    it("should route queryLocalBugs directly to localBugRepository", async () => {
      mockLocalBugRepository.queryLocalBugs.mockResolvedValue(
        new ResponseModel("tx-id").withResponse([]),
      );
      const request = new RequestModel("tx-id", { status: "pending" } as any);
      await bugUseCases.queryLocalBugs(request);
      expect(mockLocalBugRepository.queryLocalBugs).toHaveBeenCalledWith(
        request,
      );
    });

    it("should route queryHistory directly to localBugRepository", async () => {
      mockLocalBugRepository.queryHistory.mockResolvedValue(
        new ResponseModel("tx-id").withResponse([]),
      );
      const request = new RequestModel("tx-id", "bug-123");
      await bugUseCases.queryHistory(request);
      expect(mockLocalBugRepository.queryHistory).toHaveBeenCalledWith(request);
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

      mockLocalBugRepository.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(createMockBug("100")),
      );

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(mockLocalBugRepository.createBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "New Bug",
            reporterEmail: "guest@example.com",
            status: "pending",
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

      mockLocalBugRepository.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(createMockBug("101")),
      );

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(mockUserRepository.findSessionUser).toHaveBeenCalledWith(
        expect.objectContaining({ data: "user-123" }),
      );
      expect(response.data?.id).toBe("101");
    });

    it("should handle registered user with empty email data", async () => {
      const bugData = {
        title: "New Bug",
        description: "Detail description",
        priority: "medium" as const,
        category: ALLOWED_CATEGORIES[0],
        createdById: "user-123",
      };

      mockUserRepository.findSessionUser.mockResolvedValue(
        new ResponseModel<any>("tx-1").withResponse({ email: "" }), // empty email
      );

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain(
        "Reporter email could not be resolved",
      );
    });

    it("should handle registered user when userResponse.data is null", async () => {
      const bugData = {
        title: "New Bug",
        description: "Detail description",
        priority: "medium" as const,
        category: ALLOWED_CATEGORIES[0],
        createdById: "user-123",
      };

      mockUserRepository.findSessionUser.mockResolvedValue(
        new ResponseModel<any>("tx-1").withResponse(null),
      );

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain(
        "Reporter email could not be resolved",
      );
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

      mockLocalBugRepository.createBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse({ id: "102" } as Bug),
      );

      const request = new RequestModel("tx-1", bugData);
      await bugUseCases.createBug(request);

      expect(mockLocalBugRepository.createBug).toHaveBeenCalledWith(
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

    it("should return error if title is missing", async () => {
      const bugData = {
        title: "",
        description: "Detail description",
        priority: "medium" as const,
        category: "Editor",
        reporterEmail: "guest@example.com",
      };

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain(
        "Title, description and category are required",
      );
    });

    it("should return error if category is invalid", async () => {
      const bugData = {
        title: "Title",
        description: "Description",
        priority: "medium" as const,
        category: "InvalidCategoryName",
        reporterEmail: "guest@example.com",
      };

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("Invalid category selected");
    });

    it("should return error if both reporterEmail and createdById are missing", async () => {
      const bugData = {
        title: "Title",
        description: "Description",
        priority: "medium" as const,
        category: "Editor",
      };

      const request = new RequestModel("tx-1", bugData);
      const response = await bugUseCases.createBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("An email address is required");
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
      mockLocalBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse({
          id: bugId,
          status: "closed",
        } as Bug),
      );

      const request = new RequestModel("tx-id", requestPayload);
      const response = await bugUseCases.updateStatus(request);

      expect(mockLocalBugRepository.updateStatus).toHaveBeenCalledWith(request);
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

      mockGitHubBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      expect(mockGitHubBugRepository.updateStatus).toHaveBeenCalledWith(
        request,
      );
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

      mockGitHubBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      const request = new RequestModel("tx-id", requestPayload);
      await bugUseCases.updateStatus(request);

      expect(mockGitHubBugRepository.updateStatus).toHaveBeenCalledWith(
        request,
      );
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

      mockGitHubBugRepository.updateStatus.mockResolvedValue(
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

      mockGitHubBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(bugEntity),
      );

      await bugUseCases.updateStatus(new RequestModel("tx-id", requestPayload));

      expect(mockIssueTrackerService.closeIssue).not.toHaveBeenCalled();
    });

    it("should bypass github issue call if github token is empty", async () => {
      const noTokenBugUseCases = new BugUseCases(
        mockIssueTrackerService,
        mockStorageService,
        mockGitHubBugRepository,
        mockLocalBugRepository,
        mockUserRepository,
        { getGitHubToken: () => "", getGitHubManagedRepos: () => [] },
      );

      const bugId = "gh-repo-42";
      const bugEntity = Bug.builder()
        .setId(bugId)
        .setGithubRepo("VariaMos/VariaMosAdmin")
        .setGitIssueNumber(42)
        .build();

      mockGitHubBugRepository.updateStatus.mockResolvedValue(
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

    it("should return updateStatus DB result even if bug entity data is missing", async () => {
      const bugId = "gh-repo-42";
      mockGitHubBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(null),
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
  });

  describe("rejectBug", () => {
    it("should successfully reject a pending local bug", async () => {
      const bugId = "123";
      const pendingBug = createMockBug(bugId, "Test Bug", "pending");

      mockLocalBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(pendingBug),
      );
      mockLocalBugRepository.rejectBug.mockResolvedValue(
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

      expect(mockLocalBugRepository.findById).toHaveBeenCalledWith(
        expect.objectContaining({ data: bugId }),
      );
      expect(mockLocalBugRepository.rejectBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: bugId, adminId: "admin-1", logComment: "Bug rejected." },
        }),
      );
      expect(response.data?.status).toBe("rejected");
    });

    it("should return error if bug is not found", async () => {
      const bugId = "missing";
      mockLocalBugRepository.findById.mockResolvedValue(
        new ResponseModel("tx-id").withResponse(null),
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

      mockLocalBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(activeBug),
      );

      const request = new RequestModel("tx-id", {
        id: bugId,
        adminId: "admin-1",
      });
      const response = await bugUseCases.rejectBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("Only pending bugs can be rejected");
      expect(mockLocalBugRepository.rejectBug).not.toHaveBeenCalled();
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

      mockLocalBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(rejectedBug),
      );
      mockLocalBugRepository.restoreBug.mockResolvedValue(
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

      expect(mockLocalBugRepository.restoreBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: bugId, adminId: "admin-1", logComment: "Bug restored." },
        }),
      );
      expect(response.data?.status).toBe("pending");
    });

    it("should return error if bug is not found", async () => {
      const bugId = "missing";
      mockLocalBugRepository.findById.mockResolvedValue(
        new ResponseModel("tx-id").withResponse(null),
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

      mockLocalBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-id").withResponse(pendingBug),
      );

      const request = new RequestModel("tx-id", {
        id: bugId,
        adminId: "admin-1",
      });
      const response = await bugUseCases.restoreBug(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("Only rejected bugs can be restored");
      expect(mockLocalBugRepository.restoreBug).not.toHaveBeenCalled();
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

      mockLocalBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await bugUseCases.purgeExpiredRejectedBugs();

      expect(mockLocalBugRepository.findExpiredRejectedBugs).toHaveBeenCalled();
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        "/uploads/old.png",
      );
      expect(mockLocalBugRepository.updateAttachmentPath).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: 1, filePath: "/purged" },
        }),
      );
      expect(mockLocalBugRepository.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { id: "999", status: "purged", adminId: "" },
        }),
      );
    });

    it("should handle logical branches when attachments list is empty or invalid", async () => {
      const expiredBug = createMockBug("1", "New Bug", "rejected");
      expiredBug.attachments = undefined; // No attachments

      mockLocalBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await bugUseCases.purgeExpiredRejectedBugs();

      expect(mockLocalBugRepository.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: "1", status: "purged" }),
        }),
      );
      expect(mockLocalBugRepository.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            comment: "Bug status changed to purged. No attachments to delete.",
          }),
        }),
      );
    });

    it("should handle logical branches when expiredResponse.data is null", async () => {
      mockLocalBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse(null), // data is null
      );
      await bugUseCases.purgeExpiredRejectedBugs();
      expect(mockLocalBugRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("should ignore purge actions on attachments with purged filePath", async () => {
      const expiredBug = createMockBug("2", "New Bug", "rejected");
      expiredBug.attachments = [{ id: 1, filePath: "/purged" }];

      mockLocalBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await bugUseCases.purgeExpiredRejectedBugs();

      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
      expect(
        mockLocalBugRepository.updateAttachmentPath,
      ).not.toHaveBeenCalled();
    });

    it("should catch error and log it if repository function throws", async () => {
      const errorLogSpy = jest
        .spyOn(logger, "err")
        .mockImplementation(() => {});
      mockLocalBugRepository.findExpiredRejectedBugs.mockRejectedValue(
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
        mockGitHubBugRepository,
        mockLocalBugRepository,
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
      expect(mockGitHubBugRepository.saveOrUpdateBug).not.toHaveBeenCalled();
    });

    it("should bypass pull requests issues", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue([
        { number: 1, title: "Bug PR", pull_request: {} }, // is a PR
      ]);
      await bugUseCases.syncBugs(new RequestModel("tx-id"));
      expect(mockGitHubBugRepository.saveOrUpdateBug).not.toHaveBeenCalled();
    });

    it("should map issue priority correctly (high, medium, default, low cases with varied labels)", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue([
        { number: 1, title: "Bug 1", labels: [{ name: "priority: low" }] }, // low (via low)
        { number: 2, title: "Bug 2", labels: null }, // default -> medium
        {
          number: 3,
          title: "Bug 3",
          labels: [{ name: "critical" }],
          state: "closed",
        }, // high + closed state (covers line 387 true branch!)
        { number: 4, title: "Bug 4", labels: [{ name: "p3" }] }, // low (via p3)
        { number: 5, title: "Bug 5", labels: [{ name: "minor" }] }, // low (via minor)
      ]);

      mockGitHubBugRepository.saveOrUpdateBug
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
        );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(mockGitHubBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "low", title: "Bug 1" }),
        }),
      );
      expect(mockGitHubBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "medium", title: "Bug 2" }),
        }),
      );
      expect(mockGitHubBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "high", title: "Bug 3" }),
        }),
      );
      expect(mockGitHubBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "low", title: "Bug 4" }),
        }),
      );
      expect(mockGitHubBugRepository.saveOrUpdateBug).toHaveBeenNthCalledWith(
        5,
        expect.objectContaining({
          data: expect.objectContaining({ priority: "low", title: "Bug 5" }),
        }),
      );
    });

    it("should return error if GitHub token is missing", async () => {
      const mockConfigNoToken = {
        getGitHubToken: () => "",
        getGitHubManagedRepos: () => ["VariaMos/VariaMosAdmin"],
      };
      const customBugUseCases = new BugUseCases(
        mockIssueTrackerService,
        mockStorageService,
        mockGitHubBugRepository,
        mockLocalBugRepository,
        mockUserRepository,
        mockConfigNoToken,
      );

      const request = new RequestModel<void>("tx-id");
      const response = await customBugUseCases.syncBugs(request);

      expect(response.errorCode).toBe(DomainErrorCodes.BAD_REQUEST);
      expect(response.message).toContain("GitHub Sync is not configured.");
    });

    it("should fall back to defaults when issue description or user login is missing", async () => {
      mockIssueTrackerService.getIssues.mockResolvedValue([
        {
          number: 5,
          title: "Bug without meta",
          body: null, // no description
          user: {}, // user object exists but has no login property
          assignee: {}, // assignee object exists but has no login property
          // state is missing
        },
      ]);

      mockGitHubBugRepository.saveOrUpdateBug.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({ created: true }),
      );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(mockGitHubBugRepository.saveOrUpdateBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: "No description provided.",
            githubCreator: "System", // falls back to System
            status: "open",
            githubAssignee: undefined, // falls back to undefined
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

      mockGitHubBugRepository.saveOrUpdateBug.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({ created: true }),
      );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(mockGitHubBugRepository.saveOrUpdateBug).toHaveBeenCalledWith(
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

      mockGitHubBugRepository.saveOrUpdateBug.mockResolvedValue(
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

      mockGitHubBugRepository.saveOrUpdateBug.mockResolvedValue(
        new ResponseModel<any>("tx-id").withResponse({ created: true }),
      );

      await bugUseCases.syncBugs(new RequestModel("tx-id"));

      expect(mockGitHubBugRepository.saveOrUpdateBug).toHaveBeenCalledWith(
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
  });
});
