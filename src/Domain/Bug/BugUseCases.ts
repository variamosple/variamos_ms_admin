import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Bug } from "./Entity/Bug";
import { BugStatusLog } from "./Entity/BugStatusLog";
import { BugFilter } from "./Entity/BugFilter";
import { BugNote } from "./Entity/BugNote";
import { BugAttachment } from "./Entity/BugAttachment";
import { IIssueTrackerService } from "@src/Domain/Core/Service/IIssueTrackerService";
import { IStorageService } from "@src/Domain/Core/Service/IStorageService";
import { IBugRepository } from "./Repository/IBugRepository";
import { IUserRepository } from "./Repository/IUserRepository";
import { IBugTrackerConfig } from "./Config/IBugTrackerConfig";

import { GitHubTokenResolver } from "./Service/GitHubTokenResolver";
import { BugSubmissionUseCase } from "./UseCase/BugSubmissionUseCase";
import { BugLifecycleUseCase } from "./UseCase/BugLifecycleUseCase";
import { BugSyncUseCase } from "./UseCase/BugSyncUseCase";
import { BugQueryUseCase } from "./UseCase/BugQueryUseCase";
import { BugAttachmentUseCase } from "./UseCase/BugAttachmentUseCase";

export { ALLOWED_CATEGORIES } from "./UseCase/BugQueryUseCase";

export class BugUseCases {
  private readonly bugSubmissionUseCase: BugSubmissionUseCase;
  private readonly bugLifecycleUseCase: BugLifecycleUseCase;
  private readonly bugSyncUseCase: BugSyncUseCase;
  private readonly bugQueryUseCase: BugQueryUseCase;
  private readonly bugAttachmentUseCase: BugAttachmentUseCase;

  private readonly tokenResolver: GitHubTokenResolver;

  public constructor(
    private readonly issueTrackerService: IIssueTrackerService,
    private readonly storageService: IStorageService,
    private readonly bugRepository: IBugRepository,
    private readonly userRepository: IUserRepository,
    private readonly githubConfig: IBugTrackerConfig,
  ) {
    this.tokenResolver = new GitHubTokenResolver(githubConfig);
    const tokenResolver = this.tokenResolver;

    this.bugSubmissionUseCase = new BugSubmissionUseCase(
      bugRepository,
      userRepository,
      issueTrackerService,
      githubConfig,
      tokenResolver,
    );

    this.bugLifecycleUseCase = new BugLifecycleUseCase(
      bugRepository,
      issueTrackerService,
      storageService,
      githubConfig,
      tokenResolver,
    );

    this.bugSyncUseCase = new BugSyncUseCase(
      bugRepository,
      issueTrackerService,
      githubConfig,
      tokenResolver,
    );

    this.bugQueryUseCase = new BugQueryUseCase(bugRepository, githubConfig);

    this.bugAttachmentUseCase = new BugAttachmentUseCase(bugRepository, storageService);
  }

  public queryBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>> {
    return this.bugQueryUseCase.queryBugs(request);
  }

  public queryLocalBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>> {
    return this.bugQueryUseCase.queryLocalBugs(request);
  }

  public createBug(
    request: RequestModel<{
      title: string;
      description: string;
      priority: "low" | "medium" | "high";
      category: string;
      githubRepo?: string;
      createdById?: string;
      reporterEmail?: string;
      file?: {
        filename: string;
        mimetype: string;
      } | null;
    }>,
  ): Promise<ResponseModel<Bug>> {
    return this.bugSubmissionUseCase.createBug(request);
  }

  public queryHistory(request: RequestModel<string>): Promise<ResponseModel<BugStatusLog[]>> {
    return this.bugQueryUseCase.queryHistory(request);
  }

  public updateStatus(
    request: RequestModel<{
      id: string;
      status: string;
      comment?: string;
      adminId: string;
      adminEmail?: string;
      title?: string;
      description?: string;
      priority?: "low" | "medium" | "high";
      category?: string;
      githubRepo?: string;
    }>,
  ): Promise<ResponseModel<Bug>> {
    return this.bugLifecycleUseCase.updateStatus(request);
  }

  public rejectBug(
    request: RequestModel<{ id: string; adminId: string }>,
  ): Promise<ResponseModel<Bug>> {
    return this.bugLifecycleUseCase.rejectBug(request);
  }

  public restoreBug(
    request: RequestModel<{ id: string; adminId: string }>,
  ): Promise<ResponseModel<Bug>> {
    return this.bugLifecycleUseCase.restoreBug(request);
  }

  public purgeExpiredRejectedBugs(): Promise<void> {
    return this.bugLifecycleUseCase.purgeExpiredRejectedBugs();
  }

  public queryBugRepos(request: RequestModel<void>): Promise<ResponseModel<string[]>> {
    return this.bugQueryUseCase.queryBugRepos(request);
  }

  public queryCategories(request: RequestModel<void>): Promise<ResponseModel<string[]>> {
    return this.bugQueryUseCase.queryCategories(request);
  }

  public syncBugs(request: RequestModel<void>): Promise<ResponseModel<void>> {
    return this.bugSyncUseCase.syncBugs(request);
  }

  public addAttachment(
    request: RequestModel<{
      bugId: string;
      file: {
        filename: string;
        mimetype: string;
      } | null;
    }>,
  ): Promise<ResponseModel<BugAttachment>> {
    return this.bugAttachmentUseCase.addAttachment(request);
  }

  public deleteAttachment(request: RequestModel<string>): Promise<ResponseModel<void>> {
    return this.bugAttachmentUseCase.deleteAttachment(request);
  }

  public createNote(
    request: RequestModel<{ bugId: string; body: string; authorId?: string }>,
  ): Promise<ResponseModel<BugNote>> {
    return this.bugAttachmentUseCase.createNote(request);
  }

  public queryNotes(request: RequestModel<string>): Promise<ResponseModel<BugNote[]>> {
    return this.bugQueryUseCase.queryNotes(request);
  }

  public get tokenCache(): Map<string, { token: string; expiresAt: number }> {
    return this.tokenResolver.tokenCache;
  }
}
