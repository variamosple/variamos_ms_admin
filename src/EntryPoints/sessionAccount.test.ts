import type { Request } from "express";
import logger from "#src/common/logger.js";
import { sessionAccountIdOf, sessionTokenOf } from "./sessionAccount.js";

const validateSession = vi.fn();
vi.mock("@variamosple/variamos-security", () => ({
  validateSession: (token: string) => validateSession(token),
}));
vi.mock("#src/common/logger.js");

const requestOf = (part: Partial<Request>) => part as Request;

describe("sessionTokenOf (EV-23)", () => {
  it("reads the cookie first, then the Authorization header", () => {
    expect(
      sessionTokenOf(
        requestOf({
          cookies: { authToken: "from-cookie" },
          headers: { authorization: "Bearer from-header" },
        }),
      ),
    ).toBe("from-cookie");
    expect(
      sessionTokenOf(
        requestOf({ headers: { authorization: "Bearer from-header" } }),
      ),
    ).toBe("from-header");
  });

  it("gives nothing without a cookie nor a header", () => {
    expect(sessionTokenOf(requestOf({ cookies: {}, headers: {} }))).toBe(
      undefined,
    );
  });
});

describe("sessionAccountIdOf (EV-23)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("takes the signed-in user without reading a token", async () => {
    const req = requestOf({
      user: { id: "u1" } as Request["user"],
      headers: { authorization: "Bearer t" },
    });

    expect(await sessionAccountIdOf(req, "POST /x")).toBe("u1");
    expect(validateSession).not.toHaveBeenCalled();
  });

  it("takes the account a valid token names", async () => {
    validateSession.mockResolvedValue({ data: { sub: "u2" } });

    expect(
      await sessionAccountIdOf(
        requestOf({ headers: { authorization: "Bearer t" } }),
        "POST /x",
      ),
    ).toBe("u2");
    expect(validateSession).toHaveBeenCalledWith("t");
  });

  it("is a visitor without a token, or when the token cannot be read", async () => {
    expect(
      await sessionAccountIdOf(requestOf({ headers: {} }), "POST /x"),
    ).toBe(undefined);

    validateSession.mockRejectedValue(new Error("bad token"));
    expect(
      await sessionAccountIdOf(
        requestOf({ headers: { authorization: "Bearer bad" } }),
        "POST /x",
      ),
    ).toBe(undefined);
    expect(logger.err).toHaveBeenCalledWith(
      "POST /x: Error during session validation:",
    );
  });
});
