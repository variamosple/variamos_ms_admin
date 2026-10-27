import express from "express";
import supertest from "supertest";
import logger from "#src/common/logger.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  type AccessGuard,
  requireAccess,
  toId,
  toUserId,
} from "./requireAccess.js";

function createApp(guard: AccessGuard) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "operator-1" } as never;
    next();
  });
  app.post(
    "/users/:userId/disable",
    requireAccess(guard, (req) => {
      const userId = toUserId(req.params.userId);
      return userId ? { kind: "disable-account", userId } : null;
    }),
    (_req, res) => {
      res.status(200).json({ reached: true });
    },
  );
  return app;
}

describe("requireAccess", () => {
  it("passes the session user and the check to the guard, then continues", async () => {
    const authorize = vi.fn().mockResolvedValue(new ResponseModel("a"));

    const response = await supertest(createApp({ authorize })).post(
      "/users/u-2/disable",
    );

    expect(response.status).toBe(200);
    expect(authorize).toHaveBeenCalledWith("operator-1", {
      kind: "disable-account",
      userId: "u-2",
    });
  });

  it("answers 403 with the guard response when refused", async () => {
    const refusal = new ResponseModel<void>("authorizeAccess").withError(
      DomainErrorCodes.FORBIDDEN,
      "You cannot perform this action on your own account.",
    );

    const response = await supertest(
      createApp({ authorize: vi.fn().mockResolvedValue(refusal) }),
    ).post("/users/u-2/disable");

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      errorCode: "FORBIDDEN",
      message: "You cannot perform this action on your own account.",
    });
  });

  it("answers 500 when the guard fails", async () => {
    vi.spyOn(logger, "err").mockImplementation(() => {});

    const response = await supertest(
      createApp({ authorize: vi.fn().mockRejectedValue(new Error("db down")) }),
    ).post("/users/u-2/disable");

    expect(response.status).toBe(500);
    vi.restoreAllMocks();
  });

  it.each([
    ["5", 5],
    [7, 7],
    ["0", null],
    ["-1", null],
    ["1.5", null],
    ["abc", null],
    [undefined, null],
  ])("toId(%s) is %s", (value, expected) => {
    expect(toId(value)).toBe(expected);
  });

  it.each([
    ["u-1", "u-1"],
    ["", null],
    [["a", "b"], null],
    [undefined, null],
  ])("toUserId(%j) is %s", (value, expected) => {
    expect(toUserId(value)).toBe(expected);
  });
});
