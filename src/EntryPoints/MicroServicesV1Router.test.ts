import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import express from "express";
import supertest from "supertest";
import { createMicroServicesRouter } from "./MicroServicesV1Router";
import { MicroServiceQueryUseCase } from "@src/Domain/MicroService/UseCase/MicroServiceQueryUseCase";
import { MicroServiceManagementUseCase } from "@src/Domain/MicroService/UseCase/MicroServiceManagementUseCase";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Readable } from "stream";

import { mock } from "jest-mock-extended";

// Mock dependencies
jest.mock("@src/Domain/MicroService/UseCase/MicroServiceQueryUseCase");
jest.mock("@src/Domain/MicroService/UseCase/MicroServiceManagementUseCase");
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (_req: unknown, _res: unknown, next: () => void) => {
    next();
  },
}));

import { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository";

describe("MicroServicesV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockQueryUseCase = new MicroServiceQueryUseCase(mock<IMicroServiceRepository>());
    const mockManagementUseCase = new MicroServiceManagementUseCase(
      mock<IMicroServiceRepository>(),
    );
    app.use(
      "/v1/micro-services",
      createMicroServicesRouter(mockQueryUseCase, mockManagementUseCase),
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/micro-services", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("queryMicroService").withResponse([]);
      (MicroServiceQueryUseCase.prototype.queryMicroServices as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/v1/micro-services")
        .query({ pageNumber: 1, pageSize: 10, name: "test" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(MicroServiceQueryUseCase.prototype.queryMicroServices).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryMicroService").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Query failed",
      );
      (MicroServiceQueryUseCase.prototype.queryMicroServices as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).get("/v1/micro-services");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query throws an exception", async () => {
      (MicroServiceQueryUseCase.prototype.queryMicroServices as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/micro-services");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /v1/micro-services/:microserviceId/start", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("startMicroService").withResponse(null);
      (MicroServiceManagementUseCase.prototype.startMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/start");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(MicroServiceManagementUseCase.prototype.startMicroService).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when start fails", async () => {
      const expectedResponse = new ResponseModel("startMicroService").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Start failed",
      );
      (MicroServiceManagementUseCase.prototype.startMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/start");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when start throws an exception", async () => {
      (MicroServiceManagementUseCase.prototype.startMicroService as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/start");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /v1/micro-services/:microserviceId/restart", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("restartMicroService").withResponse(null);
      (MicroServiceManagementUseCase.prototype.restartMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/restart");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(MicroServiceManagementUseCase.prototype.restartMicroService).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when restart fails", async () => {
      const expectedResponse = new ResponseModel("restartMicroService").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Restart failed",
      );
      (MicroServiceManagementUseCase.prototype.restartMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/restart");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when restart throws an exception", async () => {
      (MicroServiceManagementUseCase.prototype.restartMicroService as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/restart");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /v1/micro-services/:microserviceId/stop", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("stopMicroService").withResponse(null);
      (MicroServiceManagementUseCase.prototype.stopMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/stop");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(MicroServiceManagementUseCase.prototype.stopMicroService).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when stop fails", async () => {
      const expectedResponse = new ResponseModel("stopMicroService").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Stop failed",
      );
      (MicroServiceManagementUseCase.prototype.stopMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/stop");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when stop throws an exception", async () => {
      (MicroServiceManagementUseCase.prototype.stopMicroService as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/stop");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("GET /v1/micro-services/:microserviceId/logs/watch", () => {
    it("should stream logs chunked on success", async () => {
      const mockStream = new Readable({
        read() {
          this.push("log chunk 1\n");
          this.push("log chunk 2\n");
          this.push(null);
        },
      });

      const expectedResponse = new ResponseModel<Readable>("watchMicroServiceLogs").withResponse(
        mockStream,
      );
      (MicroServiceQueryUseCase.prototype.watchMicroServiceLogs as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/v1/micro-services/ms-123/logs/watch")
        .buffer(true);

      expect(response.status).toBe(HttpStatusCodes.OK);
      const logContent = (response.body as Buffer).toString("utf8");
      expect(logContent).toContain("log chunk 1");
      expect(logContent).toContain("log chunk 2");
    });

    it("should return error code when use case watchMicroServiceLogs returns error code", async () => {
      const expectedResponse = new ResponseModel<Readable>("watchMicroServiceLogs").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Failed to watch logs",
      );
      (MicroServiceQueryUseCase.prototype.watchMicroServiceLogs as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).get("/v1/micro-services/ms-123/logs/watch");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 404 when no logs stream is returned", async () => {
      const expectedResponse = new ResponseModel<Readable>("watchMicroServiceLogs").withResponse(
        null,
      );
      (MicroServiceQueryUseCase.prototype.watchMicroServiceLogs as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).get("/v1/micro-services/ms-123/logs/watch");

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should handle error event in the stream and end request", async () => {
      const mockStream = new Readable({
        read() {
          this.emit("error", new Error("Stream error"));
        },
      });

      const expectedResponse = new ResponseModel<Readable>("watchMicroServiceLogs").withResponse(
        mockStream,
      );
      (MicroServiceQueryUseCase.prototype.watchMicroServiceLogs as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/v1/micro-services/ms-123/logs/watch")
        .buffer(true);

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 500 when logs watch throws an exception", async () => {
      (MicroServiceQueryUseCase.prototype.watchMicroServiceLogs as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/micro-services/ms-123/logs/watch");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
