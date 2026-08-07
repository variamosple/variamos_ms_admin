import type { IBugTrackerConfig } from "@src/Domain/Bug/Config/IBugTrackerConfig.js";
import type { Bug } from "@src/Domain/Bug/Entity/Bug.js";
import { BugFilter } from "@src/Domain/Bug/Entity/BugFilter.js";
import type { BugNote } from "@src/Domain/Bug/Entity/BugNote.js";
import type { BugStatusLog } from "@src/Domain/Bug/Entity/BugStatusLog.js";
import type { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository.js";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { type MockProxy, mock } from "vitest-mock-extended";
import { ALLOWED_CATEGORIES, BugQueryUseCase } from "./BugQueryUseCase.js";

describe("BugQueryUseCase", () => {
  let useCase: BugQueryUseCase;
  let mockBugRepository: MockProxy<IBugRepository>;
  let mockGithubConfig: MockProxy<IBugTrackerConfig>;

  beforeEach(() => {
    mockBugRepository = mock<IBugRepository>();
    mockGithubConfig = mock<IBugTrackerConfig>();
    useCase = new BugQueryUseCase(mockBugRepository, mockGithubConfig);
  });

  describe("queryBugs", () => {
    it("should route queryBugs directly to gitHubBugRepository and not modify repo if provided", async () => {
      mockBugRepository.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([]),
      );
      mockGithubConfig.getGitHubManagedRepos.mockReturnValue([
        "VariaMos/VariaMosAdmin",
      ]);
      const filter = new BugFilter("VariaMos/VariaMosAdmin");
      const request = new RequestModel("tx-id", filter);
      await useCase.queryBugs(request);

      expect(mockBugRepository.queryBugs).toHaveBeenCalledWith(request);
      expect(filter.managedRepos).toBeUndefined();
      expect(mockGithubConfig.getGitHubManagedRepos).not.toHaveBeenCalled();
    });

    it("should set managedRepos if repo filter is missing in queryBugs", async () => {
      mockBugRepository.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([]),
      );
      mockGithubConfig.getGitHubManagedRepos.mockReturnValue([
        "VariaMos/VariaMosAdmin",
      ]);

      const request = new RequestModel("tx-id", new BugFilter());
      await useCase.queryBugs(request);

      expect(mockBugRepository.queryBugs).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            managedRepos: ["VariaMos/VariaMosAdmin"],
          }),
        }),
      );
    });
    it("should fallback to new BugFilter if request.data is missing", async () => {
      mockBugRepository.queryBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([]),
      );
      mockGithubConfig.getGitHubManagedRepos.mockReturnValue([
        "VariaMos/VariaMosAdmin",
      ]);

      const request = new RequestModel<BugFilter>("tx-id", undefined);
      await useCase.queryBugs(request);

      expect(mockBugRepository.queryBugs).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            managedRepos: ["VariaMos/VariaMosAdmin"],
          }),
        }),
      );
    });
  });

  describe("queryLocalBugs", () => {
    it("should query local bugs successfully", async () => {
      mockBugRepository.queryLocalBugs.mockResolvedValue(
        new ResponseModel<Bug[]>("tx-id").withResponse([]),
      );
      const req = new RequestModel("tx-id", new BugFilter());
      const res = await useCase.queryLocalBugs(req);
      expect(res.errorCode).toBeUndefined();
      expect(mockBugRepository.queryLocalBugs).toHaveBeenCalledWith(req);
    });
  });

  describe("queryHistory", () => {
    it("should query history successfully", async () => {
      mockBugRepository.queryHistory.mockResolvedValue(
        new ResponseModel<BugStatusLog[]>("tx-id").withResponse([]),
      );
      const req = new RequestModel("tx-id", "bug-123");
      const res = await useCase.queryHistory(req);
      expect(res.errorCode).toBeUndefined();
      expect(mockBugRepository.queryHistory).toHaveBeenCalledWith(req);
    });
  });

  describe("queryBugRepos", () => {
    it("should return the list of managed repos successfully", async () => {
      mockGithubConfig.getGitHubManagedRepos.mockReturnValue([
        "VariaMos/VariaMosAdmin",
      ]);

      const request = new RequestModel<void>("tx-id");
      const response = await useCase.queryBugRepos(request);

      expect(response.errorCode).toBeUndefined();
      expect(response.data).toEqual(["VariaMos/VariaMosAdmin"]);
    });

    it("should catch config errors and return a SYSTEM_ERROR", async () => {
      mockGithubConfig.getGitHubManagedRepos.mockImplementation(() => {
        throw new Error("config fail");
      });

      const request = new RequestModel<void>("tx-id");
      const response = await useCase.queryBugRepos(request);

      expect(response.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(response.message).toBe("config fail");
    });
  });

  describe("queryCategories", () => {
    it("should return the list of allowed categories", async () => {
      const request = new RequestModel<void>("tx-id");
      const response = await useCase.queryCategories(request);

      expect(response.errorCode).toBeUndefined();
      expect(response.data).toEqual(ALLOWED_CATEGORIES);
    });
  });

  describe("queryNotes", () => {
    it("should query notes successfully", async () => {
      mockBugRepository.queryNotes.mockResolvedValue(
        new ResponseModel<BugNote[]>("tx-id").withResponse([]),
      );
      const req = new RequestModel("tx-id", "bug-123");
      const res = await useCase.queryNotes(req);
      expect(res.errorCode).toBeUndefined();
      expect(mockBugRepository.queryNotes).toHaveBeenCalledWith(req);
    });
  });
});
