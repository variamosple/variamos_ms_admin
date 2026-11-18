import { createJwt } from "@variamosple/variamos-security";
import logger from "#src/common/logger.js";
import {
  createSessionJwt,
  SESSION_TOKEN_WARNING_BYTES,
} from "./sessionToken.js";

vi.mock("#src/common/logger.js");
vi.mock("@variamosple/variamos-security", () => ({ createJwt: vi.fn() }));

const account = {
  id: "u1",
  name: "Ana",
  user: "ana",
  email: "ana@example.com",
  roles: ["Administrator"],
  permissions: ["users::query"],
};

describe("createSessionJwt (EV-129)", () => {
  afterEach(() => vi.clearAllMocks());

  test("signs the token for the audience it is given", async () => {
    vi.mocked(createJwt).mockResolvedValue("header.payload.signature");

    await expect(createSessionJwt(account, "app.variamos.com")).resolves.toBe(
      "header.payload.signature",
    );
    expect(createJwt).toHaveBeenCalledWith(account, "app.variamos.com");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("stays quiet at the warning size", async () => {
    vi.mocked(createJwt).mockResolvedValue(
      "x".repeat(SESSION_TOKEN_WARNING_BYTES),
    );

    await createSessionJwt(account);

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("warns past it, with the account and the counts but not the token", async () => {
    const token = "x".repeat(SESSION_TOKEN_WARNING_BYTES + 1);
    vi.mocked(createJwt).mockResolvedValue(token);

    await expect(createSessionJwt(account)).resolves.toBe(token);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const message = vi.mocked(logger.warn).mock.calls[0]?.[0];
    expect(message).toContain(`${SESSION_TOKEN_WARNING_BYTES + 1} bytes`);
    expect(message).toContain("account u1");
    expect(message).toContain("1 permissions");
    expect(message).not.toContain(token);
    expect(message).not.toContain("ana@example.com");
  });
});
