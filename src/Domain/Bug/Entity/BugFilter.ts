export class BugFilter {
  public constructor(
    public readonly repo?: string,
    public readonly status?: string,
    public readonly priority?: string,
    public readonly search?: string,
    public readonly managedRepos?: string[],
    // Bugs assigned to this account
    public readonly assigneeId?: string,
    public readonly component?: string,
    // Without a page, every matching bug (the GitHub sync reads them all)
    public readonly pageNumber?: number,
    public readonly pageSize?: number,
  ) {}
}
