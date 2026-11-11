import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { UserPreferences } from "#src/Domain/User/Entity/UserPreferences.js";
import type { UserPreferencesUseCase } from "#src/Domain/User/UseCase/UserPreferencesUseCase.js";
import { createMyAccountPreferencesRouter } from "./MyAccountPreferencesRouter.js";

vi.mock("@variamosple/variamos-security", () => ({
  hasPermissions:
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      next();
    },
}));

const answer = (preferences: UserPreferences) =>
  new ResponseModel<UserPreferences>("t").withResponse(preferences);

describe("MyAccountPreferencesRouter (EV-115 lot C)", () => {
  const useCase = mock<UserPreferencesUseCase>();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "user-1" } as never;
    next();
  });
  app.use("/preferences", createMyAccountPreferencesRouter(useCase));

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("gives the preferences of the signed-in account, dates as instants", async () => {
    useCase.get.mockResolvedValue(
      answer({
        timeZone: "America/Bogota",
        updatedAt: new Date("2026-11-11T12:00:00Z"),
      }),
    );

    const response = await supertest(app).get("/preferences");

    expect(response.status).toBe(HttpStatusCodes.OK);
    expect(response.body.data).toEqual({
      timeZone: "America/Bogota",
      updatedAt: "2026-11-11T12:00:00.000Z",
    });
    expect(useCase.get).toHaveBeenCalledWith(
      "queryMyAccountPreferences",
      "user-1",
    );
  });

  it("saves the time zone of the signed-in account, or none", async () => {
    useCase.setTimeZone.mockResolvedValue(
      answer({ timeZone: null, updatedAt: null }),
    );

    const response = await supertest(app)
      .put("/preferences")
      .send({ timeZone: null });

    expect(response.status).toBe(HttpStatusCodes.OK);
    expect(response.body.data).toEqual({ timeZone: null, updatedAt: null });
    expect(useCase.setTimeZone).toHaveBeenCalledWith(
      "updateMyAccountPreferences",
      "user-1",
      null,
    );
  });

  it("answers 400 for an unknown time zone", async () => {
    useCase.setTimeZone.mockResolvedValue(
      new ResponseModel<UserPreferences>("t").withError(
        DomainErrorCodes.INVALID_INPUT,
        "The time zone is unknown.",
      ),
    );

    const response = await supertest(app)
      .put("/preferences")
      .send({ timeZone: "Mars/Base" });

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    expect(response.body.message).toBe("The time zone is unknown.");
  });

  it.each([[{}], [{ timeZone: 3 }], [{ timeZone: "A".repeat(65) }]])(
    "refuses the body %j before the use case",
    async (body) => {
      const response = await supertest(app).put("/preferences").send(body);

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(useCase.setTimeZone).not.toHaveBeenCalled();
    },
  );

  it("answers 500 when the database fails", async () => {
    useCase.get.mockRejectedValue(new Error("down"));
    useCase.setTimeZone.mockRejectedValue(new Error("down"));

    expect((await supertest(app).get("/preferences")).status).toBe(
      HttpStatusCodes.INTERNAL_SERVER_ERROR,
    );
    expect(
      (await supertest(app).put("/preferences").send({ timeZone: null }))
        .status,
    ).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
  });
});
