export class BugFilter {
  public constructor(
    public readonly repo?: string,
    public readonly status?: string,
    public readonly priority?: string,
    public readonly search?: string,
    public readonly managedRepos?: string[],
  ) {}
}
