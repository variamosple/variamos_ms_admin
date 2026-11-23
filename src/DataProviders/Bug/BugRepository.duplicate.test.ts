import { literal, Op } from "sequelize";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { BugModel } from "./Bug.js";
import { BugRepositoryImpl } from "./BugRepository.js";

/** The report a form sent shortly before (ADM-N39). */
describe("BugRepositoryImpl.findRecentDuplicate", () => {
  const repository = new BugRepositoryImpl();
  const since = new Date("2026-11-23T09:59:00Z");
  const query = {
    title: "Canvas freezes",
    description: "After the third zoom.",
    category: "Editor",
    reporterEmail: "guest@test.com",
    since,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("looks for the same text and reporter since the given time, latest first", async () => {
    const findOne = vi.spyOn(BugModel, "findOne").mockResolvedValue(null);

    await repository.findRecentDuplicate(new RequestModel("tx", query));

    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          title: "Canvas freezes",
          description: "After the third zoom.",
          category: "Editor",
          reporterEmail: "guest@test.com",
          createdById: { [Op.is]: literal("NULL") },
          createdAt: { [Op.gte]: since },
        },
        order: [["createdAt", "DESC"]],
      }),
    );
  });

  it("keeps to the reports of the account when there is one", async () => {
    const findOne = vi.spyOn(BugModel, "findOne").mockResolvedValue(null);

    await repository.findRecentDuplicate(
      new RequestModel("tx", { ...query, createdById: "user-7" }),
    );

    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdById: "user-7" }),
      }),
    );
  });

  it("gives no data when there is no such report", async () => {
    vi.spyOn(BugModel, "findOne").mockResolvedValue(null);

    const res = await repository.findRecentDuplicate(
      new RequestModel("tx", query),
    );

    expect(res.errorCode).toBeUndefined();
    expect(res.data).toBeUndefined();
  });

  it("reports a failed lookup without its detail", async () => {
    vi.spyOn(BugModel, "findOne").mockRejectedValue(new Error("db down"));

    const res = await repository.findRecentDuplicate(
      new RequestModel("tx", query),
    );

    expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    expect(res.message).not.toContain("db down");
  });
});
