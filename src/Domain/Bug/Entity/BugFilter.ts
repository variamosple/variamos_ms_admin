/** The criteria of a bug search; every one is optional. */
export interface BugFilterFields {
  repo?: string;
  status?: string;
  priority?: string;
  search?: string;
  managedRepos?: string[];
  // Bugs assigned to this account
  assigneeId?: string;
  component?: string;
  // Without a page, every matching bug (the GitHub sync reads them all)
  pageNumber?: number;
  pageSize?: number;
}

export class BugFilter {
  public readonly repo?: string;
  public readonly status?: string;
  public readonly priority?: string;
  public readonly search?: string;
  public readonly managedRepos?: string[];
  // Bugs assigned to this account
  public readonly assigneeId?: string;
  public readonly component?: string;
  // Without a page, every matching bug (the GitHub sync reads them all)
  public readonly pageNumber?: number;
  public readonly pageSize?: number;

  public constructor(fields: BugFilterFields = {}) {
    const {
      repo,
      status,
      priority,
      search,
      managedRepos,
      assigneeId,
      component,
      pageNumber,
      pageSize,
    } = fields;
    this.repo = repo;
    this.status = status;
    this.priority = priority;
    this.search = search;
    this.managedRepos = managedRepos;
    this.assigneeId = assigneeId;
    this.component = component;
    this.pageNumber = pageNumber;
    this.pageSize = pageSize;
  }

  /** The same filter, limited to these repositories. */
  public withManagedRepos(managedRepos: string[]): BugFilter {
    return new BugFilter({
      repo: this.repo,
      status: this.status,
      priority: this.priority,
      search: this.search,
      managedRepos,
      assigneeId: this.assigneeId,
      component: this.component,
      pageNumber: this.pageNumber,
      pageSize: this.pageSize,
    });
  }
}
