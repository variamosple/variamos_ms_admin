import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import express from "express";
import supertest from "supertest";
import visitsV1Router from "./VisitsV1Router";
import { VisitsUseCases } from "@src/Domain/Visit/VisitUseCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Visit } from "@src/Domain/Visit/Entity/Visit";

interface CustomRequest {
  user?: { id: string };
}

// Mock dependencies
jest.mock("@src/Domain/Visit/VisitUseCases");
jest.mock("@variamosple/variamos-security", () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: () => void) => {
    (req as CustomRequest).user = { id: "user-123" };
    next();
  },
}));

describe("VisitsV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/v1/visits", visitsV1Router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /v1/visits", () => {
    it("should return 200 on success when using x-forwarded-for header", async () => {
      const mockVisit = new Visit("home-page", "user-123");
      const expectedResponse = new ResponseModel("createVisit").withResponse(mockVisit);
      (VisitsUseCases.prototype.registerVisit as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/v1/visits")
        .set("x-forwarded-for", "127.0.0.1")
        .send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(VisitsUseCases.prototype.registerVisit).toHaveBeenCalledTimes(1);
    });

    it("should return 200 on success when using fallback client ip", async () => {
      const mockVisit = new Visit("home-page", "user-123");
      const expectedResponse = new ResponseModel("createVisit").withResponse(mockVisit);
      (VisitsUseCases.prototype.registerVisit as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/visits").send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(VisitsUseCases.prototype.registerVisit).toHaveBeenCalledTimes(1);
    });

    it("should return 400 when pageId is missing", async () => {
      const response = await supertest(app).post("/v1/visits").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when register fails", async () => {
      const expectedResponse = new ResponseModel("createVisit").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Register failed",
      );
      (VisitsUseCases.prototype.registerVisit as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/v1/visits").send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when register throws an exception", async () => {
      (VisitsUseCases.prototype.registerVisit as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).post("/v1/visits").send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
