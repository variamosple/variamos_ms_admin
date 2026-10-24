import { Op, type Transaction } from "sequelize";
import { BugFilter } from "#src/Domain/Bug/Entity/BugFilter.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { BugModel } from "./Bug.js";
import { BugRepositoryImpl } from "./BugRepository.js";

/** Assignees of a bug (EV-84 lot 3); the SQL itself is run on PostgreSQL by hand. */
describe("BugRepositoryImpl assignees", () => {
  const repository = new BugRepositoryImpl();
  const transaction = {} as Transaction;
  let query: ReturnType<typeof vi.spyOn>;

  const callsOn = (fragment: string) =>
    (query.mock.calls as [string, { replacements?: object }][]).filter(
      ([sql]) => String(sql).includes(fragment),
    );

  beforeEach(() => {
    vi.spyOn(VARIAMOS_ORM, "transaction").mockImplementation(((
      work: (t: Transaction) => Promise<unknown>,
    ) => work(transaction)) as never);
    query = vi.spyOn(VARIAMOS_ORM, "query");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("setAssignees", () => {
    const save = (userIds: string[]) =>
      repository.setAssignees(
        new RequestModel("tx", { bugId: "b1", userIds, assignedBy: "actor-1" }),
      );

    it("removes the others, adds the missing ones and answers the new list", async () => {
      query.mockImplementation((async (sql: string) =>
        String(sql).includes("SELECT")
          ? [
              { bugId: "b1", id: "u-ana", name: "Ana" },
              { bugId: "b1", id: "u-ben", name: "Ben" },
            ]
          : [[], 0]) as never);

      const res = await save(["u-ana", "u-ben"]);

      expect(res.data).toEqual([
        { id: "u-ana", name: "Ana" },
        { id: "u-ben", name: "Ben" },
      ]);
      const [removal] = callsOn("DELETE");
      expect(removal?.[0]).toContain("NOT IN (:userIds)");
      expect(removal?.[1]).toMatchObject({ transaction });
      expect(callsOn("INSERT").map(([, o]) => o.replacements)).toEqual([
        { bugId: "b1", userId: "u-ana", assignedBy: "actor-1" },
        { bugId: "b1", userId: "u-ben", assignedBy: "actor-1" },
      ]);
    });

    it("removes every assignee for an empty list", async () => {
      query.mockImplementation((async (sql: string) =>
        String(sql).includes("SELECT") ? [] : [[], 0]) as never);

      const res = await save([]);

      expect(res.data).toEqual([]);
      expect(callsOn("DELETE")[0]?.[0]).not.toContain("NOT IN");
      expect(callsOn("INSERT")).toHaveLength(0);
    });

    it("answers a system error when the database fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      query.mockRejectedValue(new Error("connection lost"));

      const res = await save(["u-ana"]);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });
  });

  it("lists the enabled accounts holding a permission", async () => {
    query.mockResolvedValue([{ id: "u-ana", name: "Ana" }] as never);

    const res = await repository.queryUsersWithPermission(
      new RequestModel("tx", "bugs::update"),
    );

    expect(res.data).toEqual([{ id: "u-ana", name: "Ana" }]);
    const [[sql, options]] = query.mock.calls as [string, object][];
    expect(sql).toContain("u.is_enabled AND NOT u.is_deleted");
    expect(options).toMatchObject({
      replacements: { permission: "bugs::update" },
    });
  });

  describe("queryBugs", () => {
    const githubBug = (id: string) =>
      ({ id, title: id, status: "open", attachments: [] }) as never;

    it("keeps only the bugs of the assignee and gives each its assignees", async () => {
      const findAll = vi
        .spyOn(BugModel, "findAll")
        .mockResolvedValue([githubBug("b1"), githubBug("b2")]);
      query.mockImplementation((async (sql: string) =>
        String(sql).includes("WHERE user_id = :userId")
          ? [{ bugId: "b1" }, { bugId: "b2" }]
          : [
              { bugId: "b1", id: "u-ana", name: "Ana" },
              { bugId: "b1", id: "u-ben", name: "Ben" },
            ]) as never);

      const res = await repository.queryBugs(
        new RequestModel(
          "tx",
          new BugFilter(
            undefined,
            undefined,
            undefined,
            undefined,
            [],
            "u-ana",
          ),
        ),
      );

      // toMatchObject skips symbol keys such as Op.in: read it directly
      const where = findAll.mock.calls[0]?.[0]?.where as {
        id: Record<symbol, string[]>;
      };
      expect(where.id[Op.in]).toEqual(["b1", "b2"]);
      expect(res.data?.map((bug) => bug.assignedAdmins)).toEqual([
        [
          { id: "u-ana", name: "Ana" },
          { id: "u-ben", name: "Ben" },
        ],
        [],
      ]);
    });

    it("does not filter by assignee without one", async () => {
      const findAll = vi.spyOn(BugModel, "findAll").mockResolvedValue([]);

      await repository.queryBugs(new RequestModel("tx", new BugFilter()));

      expect(findAll.mock.calls[0]?.[0]?.where).not.toHaveProperty("id");
      expect(query).not.toHaveBeenCalled();
    });
  });
});
