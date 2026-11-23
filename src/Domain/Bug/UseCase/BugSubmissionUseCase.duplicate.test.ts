import { type MockProxy, mock } from "vitest-mock-extended";
import type { IBugTrackerConfig } from "#src/Domain/Bug/Config/IBugTrackerConfig.js";
import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import type { IBugRepository } from "#src/Domain/Bug/Repository/IBugRepository.js";
import type { IGitHubTokenProvider } from "#src/Domain/Bug/Service/IGitHubTokenProvider.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IIssueTrackerService } from "#src/Domain/Core/Service/IIssueTrackerService.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IStorageService } from "#src/Domain/Core/Service/IStorageService.js";
import { User } from "#src/Domain/User/Entity/User.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import {
  BugSubmissionUseCase,
  DUPLICATE_WINDOW_MS,
} from "./BugSubmissionUseCase.js";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const NOW = new Date("2026-11-23T10:00:00Z");

const firstReport = Bug.builder()
  .setId("bug-1")
  .setTitle("Canvas freezes")
  .setDescription("After the third zoom.")
  .setPriority("medium")
  .setCategory("Editor")
  .setStatus("pending")
  .build();

/** A report sent again after a timeout gets the first one back (ADM-N39). */
describe("BugSubmissionUseCase, a report sent twice", () => {
  let bugs: MockProxy<IBugRepository>;
  let users: MockProxy<IUserRepository>;
  let issues: MockProxy<IIssueTrackerService>;
  let tokens: MockProxy<IGitHubTokenProvider>;
  let storage: MockProxy<IStorageService>;
  let logger: MockProxy<ILogger>;
  let useCase: BugSubmissionUseCase;

  const guestReport = (extra: Record<string, unknown> = {}) =>
    new RequestModel("tx-1", {
      title: "Canvas freezes",
      description: "After the third zoom.",
      priority: "medium" as const,
      category: "Editor",
      reporterEmail: "guest@test.com",
      ...extra,
    });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    bugs = mock<IBugRepository>();
    users = mock<IUserRepository>();
    issues = mock<IIssueTrackerService>();
    tokens = mock<IGitHubTokenProvider>();
    storage = mock<IStorageService>();
    logger = mock<ILogger>();
    const github = mock<IBugTrackerConfig>();
    github.getGitHubManagedRepos.mockReturnValue(["VariaMos/VariaMosAdmin"]);
    bugs.findRecentDuplicate.mockResolvedValue(
      new ResponseModel<Bug>("tx-1").withResponse(firstReport),
    );
    useCase = new BugSubmissionUseCase({
      bugRepository: bugs,
      userRepository: users,
      issueTrackerService: issues,
      githubConfig: github,
      tokenResolver: tokens,
      storageService: storage,
      logger,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("looks for the same text from the same guest within a minute", async () => {
    await useCase.createBug(guestReport());

    expect(bugs.findRecentDuplicate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        data: {
          title: "Canvas freezes",
          description: "After the third zoom.",
          category: "Editor",
          reporterEmail: "guest@test.com",
          createdById: undefined,
          since: new Date(NOW.getTime() - DUPLICATE_WINDOW_MS),
        },
      }),
    );
  });

  it("answers with the first report and creates nothing", async () => {
    const res = await useCase.createBug(
      guestReport({
        file: { content: PNG_BYTES, originalName: "screen.png" },
      }),
    );

    expect(res.errorCode).toBeUndefined();
    expect(res.data).toBe(firstReport);
    expect(bugs.createBug).not.toHaveBeenCalled();
    expect(storage.saveFile).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      "Bug bug-1 sent again within 60 s: not created twice.",
    );
  });

  it("opens no second GitHub issue for an account", async () => {
    users.findSessionUser.mockResolvedValue(
      new ResponseModel<User>("tx-1").withResponse(
        User.builder()
          .setId("admin-123")
          .setEmail("admin@test.com")
          .setIsEnabled(true)
          .setIsDeleted(false)
          .build(),
      ),
    );

    const res = await useCase.createBug(
      guestReport({
        reporterEmail: undefined,
        createdById: "admin-123",
        githubRepo: "VariaMos/VariaMosAdmin",
      }),
    );

    expect(res.data).toBe(firstReport);
    expect(bugs.findRecentDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reporterEmail: "admin@test.com",
          createdById: "admin-123",
        }),
      }),
    );
    expect(tokens.resolveGitHubToken).not.toHaveBeenCalled();
    expect(issues.createIssue).not.toHaveBeenCalled();
  });

  it("does not look before the report is valid", async () => {
    const res = await useCase.createBug(guestReport({ title: "" }));

    expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(bugs.findRecentDuplicate).not.toHaveBeenCalled();
  });

  it("creates the report when the lookup fails", async () => {
    bugs.findRecentDuplicate.mockResolvedValue(
      new ResponseModel<Bug>("tx-1").withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error.",
      ),
    );
    bugs.createBug.mockResolvedValue(
      new ResponseModel<Bug>("tx-1").withResponse(firstReport),
    );

    const res = await useCase.createBug(guestReport());

    expect(res.errorCode).toBeUndefined();
    expect(bugs.createBug).toHaveBeenCalledOnce();
  });
});
