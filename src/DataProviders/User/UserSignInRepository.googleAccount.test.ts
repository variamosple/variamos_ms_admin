import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "./User.js";
import { UserSignInRepositoryImpl } from "./UserSignInRepository.js";

vi.mock("#src/common/logger.js");

// The Google sign-in reads the country of the account: without one, the
// login page offers the country of the browser first (EV-90)
describe("UserSignInRepositoryImpl.findGoogleAccount", () => {
  const repository = new UserSignInRepositoryImpl({
    hash: vi.fn(),
    compare: vi.fn(),
  } as never);

  const linkedTo = (countryCode: string | null) => {
    vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([
      { userId: "u1" },
    ] as never);
    vi.spyOn(UserModel, "findOne").mockResolvedValue({
      id: "u1",
      user: "someone",
      name: "Someone",
      email: "someone@example.com",
      isEnabled: true,
      isDeleted: false,
      countryCode,
    } as never);
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["its country", "CO", "CO"],
    ["no country", null, null],
    // A stored value that is not a code never blocks the sign-in
    ["a value that is not a code", "Colombia", null],
  ])("gives an account with %s", async (_, stored, expected) => {
    linkedTo(stored);

    const account = await repository.findGoogleAccount("google-sub");

    expect(account?.id).toBe("u1");
    expect(account?.countryCode).toBe(expected);
  });

  it("gives null for a Google identity linked to no account", async () => {
    vi.spyOn(VARIAMOS_ORM, "query").mockResolvedValue([] as never);

    expect(await repository.findGoogleAccount("google-sub")).toBeNull();
  });
});
