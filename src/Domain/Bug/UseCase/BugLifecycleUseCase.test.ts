import { mock, MockProxy } from "jest-mock-extended";
import { BugLifecycleUseCase } from "./BugLifecycleUseCase";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import { IIssueTrackerService } from "@src/Domain/Core/Service/IIssueTrackerService";
import { IBugTrackerConfig } from "@src/Domain/Bug/Config/IBugTrackerConfig";
import { GitHubTokenResolver } from "@src/Domain/Bug/Service/GitHubTokenResolver";
import { IStorageService } from "@src/Domain/Core/Service/IStorageService";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Bug } from "@src/Domain/Bug/Entity/Bug";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import logger from "jet-logger";

describe("BugLifecycleUseCase", () => {
  let useCase: BugLifecycleUseCase;
  let mockBugRepository: MockProxy<IBugRepository>;
  let mockIssueTracker: MockProxy<IIssueTrackerService>;
  let mockStorageService: MockProxy<IStorageService>;
  let mockGithubConfig: MockProxy<IBugTrackerConfig>;
  let mockTokenResolver: MockProxy<GitHubTokenResolver>;

  beforeEach(() => {
    mockBugRepository = mock<IBugRepository>();
    mockIssueTracker = mock<IIssueTrackerService>();
    mockStorageService = mock<IStorageService>();
    mockGithubConfig = mock<IBugTrackerConfig>();
    mockTokenResolver = mock<GitHubTokenResolver>();
    useCase = new BugLifecycleUseCase(
      mockBugRepository,
      mockIssueTracker,
      mockStorageService,
      mockGithubConfig,
      mockTokenResolver,
    );
  });

  const createMockBug = (id: string, title = "New Bug", status = "pending") => {
    return Bug.builder()
      .setId(id)
      .setTitle(title)
      .setDescription("Detail description")
      .setStatus(status)
      .setGithubRepo("VariaMos/VariaMosAdmin")
      .build();
  };

  describe("updateStatus", () => {
    it("should fail update if bug not found", async () => {
      mockBugRepository.findById.mockResolvedValue(new ResponseModel<Bug>("tx-1"));

      const req = new RequestModel("tx-1", {
        id: "nonexistent",
        status: "open",
        adminId: "admin-123",
      });

      const res = await useCase.updateStatus(req);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
      expect(mockBugRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("should successfully update bug status and notify GitHub", async () => {
      const bug = createMockBug("bug-123", "Approval test", "pending");

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(100);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
        adminEmail: "admin@test.com",
      });

      const res = await useCase.updateStatus(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockIssueTracker.createIssue).toHaveBeenCalled();
      expect(mockBugRepository.updateStatus).toHaveBeenCalled();
    });
  });

  describe("rejectBug", () => {
    it("should reject bug successfully when bug is pending", async () => {
      const pendingBug = createMockBug("bug-1", "Pending Bug", "pending");
      const rejectedBug = createMockBug("bug-1", "Pending Bug", "rejected");

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(pendingBug),
      );
      mockBugRepository.rejectBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(rejectedBug),
      );

      const req = new RequestModel("tx-1", { id: "bug-1", adminId: "admin-123" });
      const res = await useCase.rejectBug(req);

      expect(res.data?.status).toBe("rejected");
      expect(mockBugRepository.rejectBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: "bug-1",
            adminId: "admin-123",
          }),
        }),
      );
    });

    it("should fail to reject if bug is not found", async () => {
      mockBugRepository.findById.mockResolvedValue(new ResponseModel<Bug>("tx-1"));

      const req = new RequestModel("tx-1", { id: "bug-missing", adminId: "admin-123" });
      const res = await useCase.rejectBug(req);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
      expect(mockBugRepository.rejectBug).not.toHaveBeenCalled();
    });

    it("should fail to reject if bug is not pending", async () => {
      const openBug = createMockBug("bug-2", "Open Bug", "open");

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(openBug),
      );

      const req = new RequestModel("tx-1", { id: "bug-2", adminId: "admin-123" });
      const res = await useCase.rejectBug(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Only pending bugs can be rejected.");
      expect(mockBugRepository.rejectBug).not.toHaveBeenCalled();
    });
  });

  describe("restoreBug", () => {
    it("should restore bug successfully when bug is rejected", async () => {
      const rejectedBug = createMockBug("bug-1", "Rejected Bug", "rejected");
      const pendingBug = createMockBug("bug-1", "Rejected Bug", "pending");

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(rejectedBug),
      );
      mockBugRepository.restoreBug.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(pendingBug),
      );

      const req = new RequestModel("tx-1", { id: "bug-1", adminId: "admin-123" });
      const res = await useCase.restoreBug(req);

      expect(res.data?.status).toBe("pending");
      expect(mockBugRepository.restoreBug).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: "bug-1",
            adminId: "admin-123",
          }),
        }),
      );
    });

    it("should fail to restore if bug is not found", async () => {
      mockBugRepository.findById.mockResolvedValue(new ResponseModel<Bug>("tx-1"));

      const req = new RequestModel("tx-1", { id: "bug-missing", adminId: "admin-123" });
      const res = await useCase.restoreBug(req);

      expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
      expect(mockBugRepository.restoreBug).not.toHaveBeenCalled();
    });

    it("should fail to restore if bug is not rejected", async () => {
      const openBug = createMockBug("bug-2", "Open Bug", "open");

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(openBug),
      );

      const req = new RequestModel("tx-1", { id: "bug-2", adminId: "admin-123" });
      const res = await useCase.restoreBug(req);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Only rejected bugs can be restored.");
      expect(mockBugRepository.restoreBug).not.toHaveBeenCalled();
    });
  });

  describe("purgeExpiredRejectedBugs", () => {
    it("should process purge for expired bugs and delete attachments", async () => {
      const expiredBug = createMockBug("999", "Old rejected bug", "rejected");
      expiredBug.attachments = [
        { id: 1, filePath: "/uploads/old.png", fileType: "image/png", bugId: "999" },
        { id: 2, filePath: "/purged", fileType: "image/png", bugId: "999" },
        { id: 3, filePath: "", fileType: "image/png", bugId: "999" },
      ];

      const infoLogSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await useCase.purgeExpiredRejectedBugs();

      const calls = mockBugRepository.findExpiredRejectedBugs.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const dateArg = calls[0][0].data;
      expect(dateArg).toBeDefined();
      if (dateArg === undefined || dateArg === null) {
        throw new Error("dateArg is undefined");
      }
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - 7);
      expect(Math.abs(dateArg.getTime() - expectedDate.getTime())).toBeLessThan(5000);

      expect(infoLogSpy).toHaveBeenCalledWith("Found 1 expired rejected bugs to purge.");
      expect(infoLogSpy).toHaveBeenCalledWith("Expired rejected bugs purging complete.");

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith("/uploads/old.png");
      expect(mockStorageService.deleteFile).not.toHaveBeenCalledWith("/purged");
      expect(mockStorageService.deleteFile).not.toHaveBeenCalledWith("");

      expect(mockBugRepository.updateAttachmentPath).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "purgeExpiredBugs",
          data: { id: 1, filePath: "/purged" },
        }),
      );
      expect(mockBugRepository.updateAttachmentPath).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 2 }),
        }),
      );
      expect(mockBugRepository.updateAttachmentPath).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 3 }),
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

      infoLogSpy.mockRestore();
    });

    it("should process purge for expired bugs with no attachments", async () => {
      const expiredBug = createMockBug("999", "Old rejected bug", "rejected");
      expiredBug.attachments = [];

      const infoLogSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await useCase.purgeExpiredRejectedBugs();

      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
      expect(mockBugRepository.updateAttachmentPath).not.toHaveBeenCalled();
      expect(mockBugRepository.updateStatus).toHaveBeenCalled();
      expect(mockBugRepository.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            action: "purge",
            comment: "Bug status changed to purged. No attachments to delete.",
            bugId: "999",
          },
        }),
      );

      infoLogSpy.mockRestore();
    });

    it("should process purge for expired bugs with undefined attachments", async () => {
      const expiredBug = createMockBug("999", "Old rejected bug", "rejected");
      expiredBug.attachments = undefined;

      const infoLogSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await useCase.purgeExpiredRejectedBugs();

      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
      expect(mockBugRepository.updateStatus).toHaveBeenCalled();
      expect(mockBugRepository.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            action: "purge",
            comment: "Bug status changed to purged. No attachments to delete.",
            bugId: "999",
          },
        }),
      );

      infoLogSpy.mockRestore();
    });

    it("should process purge for expired bugs with non-array attachments and not throw loop exceptions", async () => {
      const expiredBugNonArray = createMockBug("999", "Old rejected bug", "rejected");
      Object.assign(expiredBugNonArray, { attachments: { notAnArray: true } });

      const infoLogSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBugNonArray]),
      );

      await useCase.purgeExpiredRejectedBugs();

      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
      expect(mockBugRepository.updateStatus).toHaveBeenCalled();

      infoLogSpy.mockRestore();
    });

    it("should return early and do nothing when no expired bugs are found", async () => {
      const infoLogSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([]),
      );

      await useCase.purgeExpiredRejectedBugs();

      expect(infoLogSpy).not.toHaveBeenCalled();
      expect(mockBugRepository.updateStatus).not.toHaveBeenCalled();

      infoLogSpy.mockRestore();
    });

    it("should log audit comment with modified description, category, priority, and target repo", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      bug.description = "Old Desc";
      bug.category = "Editor";
      bug.priority = "low";
      bug.githubRepo = "Old/Repo";

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(101);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
        adminEmail: "admin@test.com",
        description: "New Desc",
        category: "Model",
        priority: "high" as const,
        githubRepo: "New/Repo",
        comment: "Approve change",
      });

      await useCase.updateStatus(req);

      // Verify that audit log note shows changes
      expect(mockBugRepository.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bugId: "bug-123",
            body: expect.stringContaining("The administrator modified the following fields"),
          }),
        }),
      );
      const noteCall = mockBugRepository.createNote.mock.calls[0][0];
      expect(noteCall.data?.body).toContain('* Description: "Old Desc" -> "New Desc"');
      expect(noteCall.data?.body).toContain('* Category: "Editor" -> "Model"');
      expect(noteCall.data?.body).toContain('* Priority: "low" -> "high"');
      expect(noteCall.data?.body).toContain('* Target repository set to "New/Repo"');
      expect(noteCall.data?.body).toContain('\n\nAdmin Comment: "Approve change"');
    });

    it("should log audit comment with default fallback values when category or priority are initially missing", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      bug.category = undefined;
      Object.assign(bug, { priority: undefined });

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(101);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
        category: "NewCategory",
        priority: "high" as const,
      });

      await useCase.updateStatus(req);

      const noteCall = mockBugRepository.createNote.mock.calls[0][0];
      expect(noteCall.data?.body).toContain('* Category: "None" -> "NewCategory"');
      expect(noteCall.data?.body).toContain('* Priority: "medium" -> "high"');
    });

    it("should format attachments list when pushing to GitHub and use fallback values", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      bug.priority = "high";
      bug.category = "Model";
      bug.attachments = [
        { id: 1, filePath: "/file1.jpg", fileType: "image/jpeg", bugId: "bug-123" },
        { id: 2, filePath: "/purged", fileType: "image/png", bugId: "bug-123" }, // Should skip purged
        { id: 3, filePath: "/file2.png", fileType: "", bugId: "bug-123" }, // Should default to unknown type
      ];

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(102);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockGithubConfig.getApiBaseUrl = jest.fn().mockReturnValue(undefined); // Fallback to http://localhost:4000

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);

      expect(mockIssueTracker.createIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "Title",
        expect.stringContaining("http://localhost:4000/file1.jpg"),
        expect.arrayContaining(["bug", "model", "high"]),
        "token",
      );

      const calledBody = mockIssueTracker.createIssue.mock.calls[0][2];
      expect(calledBody).toContain(
        "- [Attachment](http://localhost:4000/file1.jpg) (Type: image/jpeg)",
      );
      expect(calledBody).toContain(
        "- [Attachment](http://localhost:4000/file2.png) (Type: unknown)",
      );
      expect(calledBody).not.toContain("/purged");
      expect(calledBody).not.toContain("Approved and pushed to GitHub by:");
    });

    it("should format attachments list with custom config API base url when pushing to GitHub", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      bug.attachments = [
        { id: 1, filePath: "/file1.jpg", fileType: "image/jpeg", bugId: "bug-123" },
      ];

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(102);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockGithubConfig.getApiBaseUrl = jest.fn().mockReturnValue("https://myapi.com");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);

      const calledBody = mockIssueTracker.createIssue.mock.calls[0][2];
      expect(calledBody).toContain(
        "- [Attachment](https://myapi.com/file1.jpg) (Type: image/jpeg)",
      );
    });

    it("should not format attachments section if attachments array is empty", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      bug.attachments = [];

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(102);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);

      const calledBody = mockIssueTracker.createIssue.mock.calls[0][2];
      expect(calledBody).not.toContain("### Attachments");
    });

    it("should return error if createIssue returns null", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(null);

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      const res = await useCase.updateStatus(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });

    it("should return error if resolveGitHubToken fails", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      const res = await useCase.updateStatus(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("GitHub integration token is not configured.");
    });

    it("should close GitHub issue when status is closed", async () => {
      const bug = createMockBug("bug-123", "Title", "open");
      bug.gitIssueNumber = 500;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "closed",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.closeIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        500,
        "token",
      );
    });

    it("should reopen GitHub issue when status is changed to open and it has an issue number", async () => {
      const bug = createMockBug("bug-123", "Title", "closed");
      bug.gitIssueNumber = 500;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.reopenIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        500,
        "token",
      );
    });

    it("should fail update if request data is missing", async () => {
      const req = new RequestModel<{ id: string; status: string; adminId: string }>(
        "tx-1",
        undefined,
      );
      const res = await useCase.updateStatus(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Request data is required.");
    });

    it("should fail update if bug ID is missing", async () => {
      const req = new RequestModel("tx-1", {
        id: "",
        status: "open",
        adminId: "admin-123",
      });
      const res = await useCase.updateStatus(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Bug ID and status are required.");
    });

    it("should fail update if status is missing", async () => {
      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "",
        adminId: "admin-123",
      });
      const res = await useCase.updateStatus(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Bug ID and status are required.");
    });

    it("should fail update if title is updated to empty string (validation fails)", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
        title: "",
      });

      const res = await useCase.updateStatus(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Bug title cannot be empty.");
    });

    it("should fail update if description is updated to empty string (validation fails)", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
        description: "",
      });

      const res = await useCase.updateStatus(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Bug description cannot be empty.");
    });

    it("should log audit comment with only modified title when only title changes", async () => {
      const bug = createMockBug("bug-123", "Old Title", "pending");
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(100);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
        title: "New Title",
      });

      await useCase.updateStatus(req);

      expect(mockBugRepository.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bugId: "bug-123",
            body: expect.stringContaining('* Title: "Old Title" -> "New Title"'),
          }),
        }),
      );
      const noteCall = mockBugRepository.createNote.mock.calls[0][0];
      expect(noteCall.data?.body).not.toContain("Description:");
      expect(noteCall.data?.body).not.toContain("Category:");
      expect(noteCall.data?.body).not.toContain("Priority:");
      expect(noteCall.data?.body).not.toContain("Target repository");
    });

    it("should not log audit comment fields that have not changed value", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      bug.description = "Desc";
      bug.category = "Editor";
      bug.priority = "medium";
      bug.githubRepo = "VariaMos/VariaMosAdmin";

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(100);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
        title: "Title",
        description: "Desc",
        category: "Editor",
        priority: "medium" as const,
        githubRepo: "VariaMos/VariaMosAdmin",
      });

      await useCase.updateStatus(req);

      expect(mockBugRepository.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bugId: "bug-123",
            body: expect.stringContaining("The fields were not modified by the administrator."),
          }),
        }),
      );
    });

    it("should not call createIssue when status is closed, resolved, or not open", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "closed",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.createIssue).not.toHaveBeenCalled();
    });

    it("should not call createIssue when bug already has gitIssueNumber", async () => {
      const bug = createMockBug("bug-123", "Title", "closed");
      bug.gitIssueNumber = 500;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.createIssue).not.toHaveBeenCalled();
      expect(mockIssueTracker.reopenIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        500,
        "token",
      );
    });

    it("should not call createIssue when bug has no githubRepo defined", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      Object.assign(bug, { githubRepo: undefined });

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.createIssue).not.toHaveBeenCalled();
    });

    it("should precisely format issueBody with provided and default values when pushing to GitHub", async () => {
      const bug = createMockBug("bug-123", "My Bug Title", "pending");
      Object.assign(bug, { description: undefined, reporterEmail: undefined });
      bug.priority = "high";
      bug.category = "Editor";

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(105);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
        adminEmail: "admin@test.com",
        comment: "This is a comment",
      });

      await useCase.updateStatus(req);

      expect(mockIssueTracker.createIssue).toHaveBeenCalledWith(
        "VariaMos/VariaMosAdmin",
        "My Bug Title",
        expect.stringContaining("No description provided."),
        expect.any(Array),
        "token",
      );

      const calledBody = mockIssueTracker.createIssue.mock.calls[0][2];
      expect(calledBody).toContain("*Reported locally by: Guest*");
      expect(calledBody).toContain(
        '*Approved and pushed to GitHub by: admin@test.com (Comment: "This is a comment")*',
      );
      expect(calledBody).toContain("*Priority: high*");
      expect(calledBody).toContain("*Category: Editor*");
    });

    it("should build issueBody without priority and category sections if they are missing on the bug", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      Object.assign(bug, { priority: undefined });
      bug.category = undefined;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(100);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);

      const calledBody = mockIssueTracker.createIssue.mock.calls[0][2];
      expect(calledBody).not.toContain("Priority:");
      expect(calledBody).not.toContain("Category:");
    });

    it("should pass the correct gitIssueNumber and githubHtmlUrl to updateStatus on repository", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(777);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);

      expect(mockBugRepository.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gitIssueNumber: 777,
            githubHtmlUrl: "https://github.com/VariaMos/VariaMosAdmin/issues/777",
          }),
        }),
      );
    });

    it("should not create any note when status is closed", async () => {
      const bug = createMockBug("bug-123", "Title", "open");
      bug.gitIssueNumber = 500;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "closed",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockBugRepository.createNote).not.toHaveBeenCalled();
    });

    it("should not invoke closeIssue or reopenIssue if dbResponse data is empty", async () => {
      const bug = createMockBug("bug-123", "Title", "open");
      bug.gitIssueNumber = 500;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1"), // Empty response data
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "closed",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.closeIssue).not.toHaveBeenCalled();
    });

    it("should not invoke closeIssue or reopenIssue if bug githubRepo is missing", async () => {
      const bug = createMockBug("bug-123", "Title", "open");
      bug.gitIssueNumber = 500;
      Object.assign(bug, { githubRepo: undefined });

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "closed",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.closeIssue).not.toHaveBeenCalled();
    });

    it("should not invoke closeIssue or reopenIssue if issue number is missing", async () => {
      const bug = createMockBug("bug-123", "Title", "open");
      Object.assign(bug, { gitIssueNumber: undefined });

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "closed",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.closeIssue).not.toHaveBeenCalled();
      expect(mockTokenResolver.resolveGitHubToken).not.toHaveBeenCalled();
    });

    it("should not call reopenIssue or closeIssue when status is resolved", async () => {
      const bug = createMockBug("bug-123", "Title", "open");
      bug.gitIssueNumber = 500;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "resolved",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.closeIssue).not.toHaveBeenCalled();
      expect(mockIssueTracker.reopenIssue).not.toHaveBeenCalled();
    });

    it("should not reopen GitHub issue if changing status to open but issue number is missing", async () => {
      const bug = createMockBug("bug-123", "Title", "closed");
      Object.assign(bug, { gitIssueNumber: undefined });

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open",
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.reopenIssue).not.toHaveBeenCalled();
    });

    it("should not create any note when status is closed even if fields are modified", async () => {
      const bug = createMockBug("bug-123", "Title", "open");
      bug.gitIssueNumber = 500;

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "closed" as const,
        adminId: "admin-123",
        title: "Changed Title",
      });

      await useCase.updateStatus(req);
      expect(mockBugRepository.createNote).not.toHaveBeenCalled();
    });

    it("should not call reopenIssue when status is open and it was just created (issue number not pre-existing)", async () => {
      const bug = createMockBug("bug-123", "Title", "pending");
      Object.assign(bug, { gitIssueNumber: undefined });

      mockBugRepository.findById.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );
      mockTokenResolver.resolveGitHubToken.mockResolvedValue("token");
      mockIssueTracker.createIssue.mockResolvedValue(100);
      mockBugRepository.updateStatus.mockResolvedValue(
        new ResponseModel<Bug>("tx-1").withResponse(bug),
      );

      const req = new RequestModel("tx-1", {
        id: "bug-123",
        status: "open" as const,
        adminId: "admin-123",
      });

      await useCase.updateStatus(req);
      expect(mockIssueTracker.reopenIssue).not.toHaveBeenCalled();
    });
  });

  describe("rejectBug errors", () => {
    it("should return error if reject request data is missing", async () => {
      const req = new RequestModel<{ id: string; adminId: string }>("tx-1", undefined);
      const res = await useCase.rejectBug(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });

    it("should return error if reject request bug ID is missing", async () => {
      const req = new RequestModel("tx-1", { id: "", adminId: "admin-123" });
      const res = await useCase.rejectBug(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });
  });

  describe("restoreBug errors", () => {
    it("should return error if restore request data is missing", async () => {
      const req = new RequestModel<{ id: string; adminId: string }>("tx-1", undefined);
      const res = await useCase.restoreBug(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });

    it("should return error if restore request bug ID is missing", async () => {
      const req = new RequestModel("tx-1", { id: "", adminId: "admin-123" });
      const res = await useCase.restoreBug(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });
  });

  describe("purgeExpiredRejectedBugs errors", () => {
    it("should log error if purge throws an exception", async () => {
      mockBugRepository.findExpiredRejectedBugs.mockImplementation(() => {
        throw new Error("Purge Failed");
      });
      const errLogSpy = jest.spyOn(logger, "err").mockImplementation(() => {});

      await useCase.purgeExpiredRejectedBugs();

      expect(errLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to purge expired rejected bugs: Purge Failed"),
      );
      errLogSpy.mockRestore();
    });
  });
});
