import type { Transaction } from "sequelize";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "../User/User.js";
import { BugModel } from "./Bug.js";
import { BugLogModel } from "./BugLog.js";
import { BugRepositoryImpl } from "./BugRepository.js";

/** Rejecting and restoring a bug: its status and its log line, in one transaction. */
describe("BugRepositoryImpl status changes", () => {
  const repository = new BugRepositoryImpl();
  const transaction = {} as Transaction;
  let save: ReturnType<typeof vi.fn>;
  let createLog: ReturnType<typeof vi.spyOn>;

  const bugWith = (status: string) => {
    save = vi.fn();
    return { id: "b1", status, save };
  };

  const input = { id: "b1", adminId: "admin-1", logComment: "Because." };

  beforeEach(() => {
    vi.spyOn(VARIAMOS_ORM, "transaction").mockImplementation(((
      work: (t: Transaction) => Promise<unknown>,
    ) => work(transaction)) as never);
    vi.spyOn(UserModel, "findByPk").mockResolvedValue({
      id: "admin-1",
    } as never);
    createLog = vi.spyOn(BugLogModel, "create").mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["rejectBug", "pending", "rejected", "reject"],
    ["restoreBug", "rejected", "pending", "restore"],
  ] as const)(
    "%s moves the bug from %s to %s and logs %s",
    async (method, from, to, action) => {
      const bug = bugWith(from);
      vi.spyOn(BugModel, "findByPk").mockResolvedValue(bug as never);

      const res = await repository[method](new RequestModel("tx", input));

      expect(res.errorCode).toBeUndefined();
      expect(res.data?.status).toBe(to);
      expect(bug.status).toBe(to);
      expect(save).toHaveBeenCalledWith({ transaction });
      expect(createLog).toHaveBeenCalledWith(
        { action, comment: "Because.", bugId: "b1", operatorId: "admin-1" },
        { transaction },
      );
    },
  );

  it("logs no operator when the administrator is not a known user", async () => {
    vi.spyOn(BugModel, "findByPk").mockResolvedValue(
      bugWith("pending") as never,
    );
    vi.spyOn(UserModel, "findByPk").mockResolvedValue(null);

    await repository.rejectBug(new RequestModel("tx", input));

    expect(createLog).toHaveBeenCalledWith(
      expect.objectContaining({ operatorId: "" }),
      { transaction },
    );
  });

  it("answers not found and logs nothing for an unknown bug", async () => {
    vi.spyOn(BugModel, "findByPk").mockResolvedValue(null);

    const res = await repository.restoreBug(new RequestModel("tx", input));

    expect(res.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
    expect(createLog).not.toHaveBeenCalled();
  });

  it("refuses a request without data", async () => {
    const res = await repository.rejectBug(
      new RequestModel<typeof input>("tx", undefined as never),
    );

    expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
  });

  it("answers a system error when the database fails", async () => {
    vi.spyOn(BugModel, "findByPk").mockRejectedValue(new Error("down"));

    const res = await repository.rejectBug(new RequestModel("tx", input));

    expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
  });
});
