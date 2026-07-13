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
      ];

      const infoLogSpy = jest.spyOn(logger, "info").mockImplementation(() => {});

      mockBugRepository.findExpiredRejectedBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([expiredBug]),
      );

      await useCase.purgeExpiredRejectedBugs();

      expect(mockBugRepository.findExpiredRejectedBugs).toHaveBeenCalled();
      const dateArg = mockBugRepository.findExpiredRejectedBugs.mock.calls[0][0].data;
      expect(dateArg).toBeDefined();

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith("/uploads/old.png");
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

      infoLogSpy.mockRestore();
    });
  });
});
