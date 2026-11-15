import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { AccountCountryUseCase } from "#src/Domain/User/UseCase/AccountCountryUseCase.js";
import { createMyAccountCountryRouter } from "./MyAccountCountryRouter.js";

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

describe("MyAccountCountryRouter (EV-90)", () => {
  const useCase = mock<AccountCountryUseCase>();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "user-1" } as never;
    next();
  });
  app.use("/default-country", createMyAccountCountryRouter(useCase));

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("gives the country to the signed-in account and says whether it was saved", async () => {
    useCase.setDefault.mockResolvedValue(
      new ResponseModel<{ saved: boolean }>("t").withResponse({ saved: true }),
    );

    const response = await supertest(app)
      .put("/default-country")
      .send({ countryCode: "CO" });

    expect(response.status).toBe(HttpStatusCodes.OK);
    expect(response.body.data).toEqual({ saved: true });
    expect(useCase.setDefault).toHaveBeenCalledWith(
      "setMyAccountDefaultCountry",
      "user-1",
      "CO",
    );
  });

  it("answers 400 to a code the domain refuses", async () => {
    useCase.setDefault.mockResolvedValue(
      new ResponseModel<{ saved: boolean }>("t").withError(
        DomainErrorCodes.INVALID_INPUT,
        "The country code must be two letters.",
      ),
    );

    const response = await supertest(app)
      .put("/default-country")
      .send({ countryCode: "COL" });

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
  });

  it("refuses a body without a text code, before the domain", async () => {
    const response = await supertest(app)
      .put("/default-country")
      .send({ countryCode: 57 });

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    expect(useCase.setDefault).not.toHaveBeenCalled();
  });

  it("answers 500 when the use case fails", async () => {
    useCase.setDefault.mockRejectedValue(new Error("database down"));

    const response = await supertest(app)
      .put("/default-country")
      .send({ countryCode: "CO" });

    expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
  });
});
