import { BugFilter } from "#src/Domain/Bug/Entity/BugFilter.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { BugModel } from "./Bug.js";
import { BugRepositoryImpl } from "./BugRepository.js";

/** Pages of the bug lists; the limit lands in the subquery on bugs, before the attachments join. */
describe("BugRepositoryImpl paging", () => {
  const repository = new BugRepositoryImpl();
  const bug = (id: string) =>
    ({ id, title: id, status: "open", attachments: [] }) as never;
  const onPage = (pageNumber?: number, pageSize?: number) =>
    new RequestModel(
      "tx",
      new BugFilter(
        undefined,
        undefined,
        undefined,
        undefined,
        [],
        undefined,
        undefined,
        pageNumber,
        pageSize,
      ),
    );

  beforeEach(() => {
    vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([] as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["queryBugs", (r: RequestModel<BugFilter>) => repository.queryBugs(r)],
    [
      "queryLocalBugs",
      (r: RequestModel<BugFilter>) => repository.queryLocalBugs(r),
    ],
  ])(
    "%s reads one page, newest first, and counts every match",
    async (_name, query) => {
      const findAll = vi
        .spyOn(BugModel, "findAll")
        .mockResolvedValue([bug("b41"), bug("b42")]);
      const count = vi.spyOn(BugModel, "count").mockResolvedValue(42 as never);

      const res = await query(onPage(3, 20));

      expect(findAll.mock.calls[0]?.[0]).toMatchObject({
        limit: 20,
        offset: 40,
        order: [
          ["createdAt", "DESC"],
          ["id", "DESC"],
        ],
      });
      expect(count.mock.calls[0]?.[0]?.where).toBe(
        findAll.mock.calls[0]?.[0]?.where,
      );
      expect(res.totalCount).toBe(42);
      expect(res.data?.map((b) => b.id)).toEqual(["b41", "b42"]);
    },
  );

  it("reads every bug without a page, as the GitHub sync does", async () => {
    const findAll = vi
      .spyOn(BugModel, "findAll")
      .mockResolvedValue([bug("b1"), bug("b2")]);
    const count = vi.spyOn(BugModel, "count");

    const res = await repository.queryBugs(onPage());

    expect(findAll.mock.calls[0]?.[0]).not.toHaveProperty("limit");
    expect(count).not.toHaveBeenCalled();
    expect(res.totalCount).toBe(2);
  });
});
