import logger from "#src/common/logger.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { UserFilter } from "#src/Domain/User/Entity/UserFilter.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "./User.js";
import { UserRepositoryImpl } from "./UserRepository.js";

vi.mock("#src/common/logger.js");

// One stored address that is not well formed used to fail the whole page
// with a 500 (EV-29)
describe("UserRepositoryImpl.queryUsers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const row = (id: string, email: string) => ({
    id,
    user: id,
    name: `Name ${id}`,
    email,
    isEnabled: true,
    isDeleted: false,
    createdAt: new Date("2026-01-10T08:00:00Z"),
    lastLogin: undefined,
  });

  it("lists every row, flags an address that is not well formed, and logs its id only", async () => {
    vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([
      { count: "3" },
    ] as never);
    vi.spyOn(UserModel, "findAll").mockResolvedValue([
      row("u1", "a@example.com"),
      row("u2", "broken-address"),
      row("u3", "c@example.com"),
    ] as never);

    const response = await new UserRepositoryImpl().queryUsers(
      new RequestModel("t", new UserFilter()),
    );

    expect(response.errorCode).toBeUndefined();
    expect(response.totalCount).toBe(3);
    expect(
      response.data?.map(({ id, email, emailValid }) => [
        id,
        email,
        emailValid,
      ]),
    ).toEqual([
      ["u1", "a@example.com", true],
      ["u2", "broken-address", false],
      ["u3", "c@example.com", true],
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const warning = String(vi.mocked(logger.warn).mock.calls[0]?.[0]);
    expect(warning).toContain("u2");
    expect(warning).not.toContain("broken-address");
  });
});
