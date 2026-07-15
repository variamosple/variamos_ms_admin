import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import express from "express";
import supertest from "supertest";
import { createVisitsRouter } from "./VisitsV1Router";
import { VisitUseCase } from "@src/Domain/Visit/UseCase/VisitUseCase";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Visit } from "@src/Domain/Visit/Entity/Visit";

import { mock } from "jest-mock-extended";

interface CustomRequest {
  user?: { id: string };
}

// Mock dependencies
jest.mock("@src/Domain/Visit/UseCase/VisitUseCase");
jest.mock("@variamosple/variamos-security", () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: () => void) => {
    (req as CustomRequest).user = { id: "user-123" };
    next();
  },
}));

import { IVisitRepository } from "@src/Domain/Visit/Repository/IVisitRepository";
import { ICountriesRepository } from "@src/Domain/Countries/Repository/ICountriesRepository";

describe("VisitsV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockVisitUseCase = new VisitUseCase(
      mock<IVisitRepository>(),
      mock<ICountriesRepository>(),
    );
    app.use("/v1/visits", createVisitsRouter(mockVisitUseCase));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /v1/visits", () => {
    it("should return 200 on success when using x-forwarded-for header", async () => {
      const mockVisit = new Visit("home-page", "user-123");
      const expectedResponse = new ResponseModel("createVisit").withResponse(mockVisit);
      (VisitUseCase.prototype.registerVisit as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/v1/visits")
        .set("x-forwarded-for", "127.0.0.1")
        .send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(VisitUseCase.prototype.registerVisit).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "createVisit" }),
        "127.0.0.1",
      );
    });

    it("should return 200 on success when using fallback client ip", async () => {
      const mockVisit = new Visit("home-page", "user-123");
      const expectedResponse = new ResponseModel("createVisit").withResponse(mockVisit);
      (VisitUseCase.prototype.registerVisit as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/visits").send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(VisitUseCase.prototype.registerVisit).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "createVisit" }),
        expect.stringMatching(/^(::ffff:)?127\.0\.0\.1$/),
      );
    });

    it("should return 400 when pageId is missing", async () => {
      const response = await supertest(app).post("/v1/visits").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when register fails", async () => {
      const expectedResponse = new ResponseModel("createVisit").withError(
        DomainErrorCodes.INVALID_INPUT,
        "register failed",
      );
      (VisitUseCase.prototype.registerVisit as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/visits").send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when register throws an exception", async () => {
      (VisitUseCase.prototype.registerVisit as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).post("/v1/visits").send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
