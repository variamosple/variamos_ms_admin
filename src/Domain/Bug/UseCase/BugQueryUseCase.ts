import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import { IBugTrackerConfig } from "@src/Domain/Bug/Config/IBugTrackerConfig";
import { Bug } from "@src/Domain/Bug/Entity/Bug";
import { BugFilter } from "@src/Domain/Bug/Entity/BugFilter";
import { BugStatusLog } from "@src/Domain/Bug/Entity/BugStatusLog";
import { BugNote } from "@src/Domain/Bug/Entity/BugNote";
import logger from "jet-logger";

export const ALLOWED_CATEGORIES = [
  "Editor",
  "Model",
  "Language",
  "Project",
  "Simulation",
  "Account/Security",
  "Other",
];

export class BugQueryUseCase {
  public constructor(
    private readonly bugRepository: IBugRepository,
    private readonly githubConfig: IBugTrackerConfig,
  ) {}

  public async queryBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>> {
    const filter = request.data || new BugFilter();
    if (!filter.repo) {
      (filter as { managedRepos?: string[] }).managedRepos =
        this.githubConfig.getGitHubManagedRepos();
    }
    return this.bugRepository.queryBugs(new RequestModel(request.transactionId, filter));
  }

  public async queryLocalBugs(request: RequestModel<BugFilter>): Promise<ResponseModel<Bug[]>> {
    return this.bugRepository.queryLocalBugs(request);
  }

  public async queryHistory(request: RequestModel<string>): Promise<ResponseModel<BugStatusLog[]>> {
    return this.bugRepository.queryHistory(request);
  }

  public async queryBugRepos(request: RequestModel<void>): Promise<ResponseModel<string[]>> {
    const response = new ResponseModel<string[]>(request.transactionId);
    try {
      response.data = [...this.githubConfig.getGitHubManagedRepos()];
    } catch (error) {
      const err = error as Error;
      logger.err(err);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, err.message);
    }
    return Promise.resolve(response);
  }

  public async queryCategories(request: RequestModel<void>): Promise<ResponseModel<string[]>> {
    const response = new ResponseModel<string[]>(request.transactionId);
    response.data = ALLOWED_CATEGORIES;
    return Promise.resolve(response);
  }

  public async queryNotes(request: RequestModel<string>): Promise<ResponseModel<BugNote[]>> {
    return this.bugRepository.queryNotes(request);
  }
}
