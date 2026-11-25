import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { BugModel } from "./Bug.js";
import { BugRepositoryImpl } from "./BugRepository.js";

/**
 * The GitHub sync saves a bug only when GitHub changed it: the database reads
 * a missing value back as NULL, GitHub leaves it out (2026-11-25).
 */
describe("BugRepositoryImpl.saveOrUpdateBug on a synchronized bug", () => {
  const repository = new BugRepositoryImpl();
  const createdAt = new Date("2026-11-01T10:00:00.000Z");

  // The row as PostgreSQL gives it back: NULL where nothing was given
  const savedRow = (overrides: Record<string, unknown> = {}) =>
    BugModel.build(
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Crash on save",
        description: "No description provided.",
        priority: "medium",
        status: "open",
        githubRepo: "variamosple/VariaMosPLE",
        gitIssueNumber: 7,
        githubCreator: "System",
        githubHtmlUrl: "",
        githubAssignee: null,
        githubCreatedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        ...overrides,
      } as never,
      { isNewRecord: false },
    );

  // The bug read from the issue: no assignee is undefined
  const fromGitHub = (assignee?: string) =>
    Bug.builder()
      .setTitle("Crash on save")
      .setDescription("No description provided.")
      .setPriority("medium")
      .setStatus("open")
      .setGithubRepo("variamosple/VariaMosPLE")
      .setGitIssueNumber(7)
      .setGithubCreator("System")
      .setGithubHtmlUrl("")
      .setGithubAssignee(assignee)
      .setCreatedAt(createdAt)
      .build();

  const syncWith = async (row: BugModel, bug: Bug) => {
    vi.spyOn(BugModel, "findOne").mockResolvedValue(row);
    const save = vi.spyOn(row, "save").mockResolvedValue(row);
    const response = await repository.saveOrUpdateBug(
      new RequestModel("tx", bug),
    );
    return { response, save };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not save an unassigned issue that did not change", async () => {
    const { response, save } = await syncWith(savedRow(), fromGitHub());

    expect(response.errorCode).toBeUndefined();
    expect(response.data).toEqual({ created: false, updated: false });
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the bug when the issue gets an assignee", async () => {
    const row = savedRow();
    const { response, save } = await syncWith(row, fromGitHub("alice"));

    expect(response.data).toEqual({ created: false, updated: true });
    expect(save).toHaveBeenCalledOnce();
    expect(row.githubAssignee).toBe("alice");
  });

  it("saves the bug when the issue loses its assignee", async () => {
    const row = savedRow({ githubAssignee: "alice" });
    const { response, save } = await syncWith(row, fromGitHub());

    expect(response.data).toEqual({ created: false, updated: true });
    expect(save).toHaveBeenCalledOnce();
    expect(row.githubAssignee).toBeNull();
  });

  it("saves the bug when GitHub changed its creation date", async () => {
    const row = savedRow({ githubCreatedAt: null });
    const { response, save } = await syncWith(row, fromGitHub());

    expect(response.data).toEqual({ created: false, updated: true });
    expect(save).toHaveBeenCalledOnce();
    expect(row.githubCreatedAt).toEqual(createdAt);
  });
});
