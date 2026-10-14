import { Readable } from "node:stream";
import HttpStatusCodes from "@src/common/HttpStatusCodes.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { MicroServiceManagementUseCase } from "@src/Domain/MicroService/UseCase/MicroServiceManagementUseCase.js";
import { MicroServiceQueryUseCase } from "@src/Domain/MicroService/UseCase/MicroServiceQueryUseCase.js";
import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import { createMicroServicesRouter } from "./MicroServicesV1Router.js";

// Mock dependencies
vi.mock("@src/Domain/MicroService/UseCase/MicroServiceQueryUseCase");
vi.mock("@src/Domain/MicroService/UseCase/MicroServiceManagementUseCase");
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

import type { IMicroServiceRepository } from "@src/Domain/MicroService/Repository/IMicroServiceRepository.js";

describe("MicroServicesV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockQueryUseCase = new MicroServiceQueryUseCase(
      mock<IMicroServiceRepository>(),
    );
    const mockManagementUseCase = new MicroServiceManagementUseCase(
      mock<IMicroServiceRepository>(),
    );
    app.use(
      "/v1/micro-services",
      createMicroServicesRouter(mockQueryUseCase, mockManagementUseCase),
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /v1/micro-services", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel(
        "queryMicroService",
      ).withResponse([]);
      (
        MicroServiceQueryUseCase.prototype.queryMicroServices as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .get("/v1/micro-services")
        .query({ pageNumber: 1, pageSize: 10, name: "test" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(
        MicroServiceQueryUseCase.prototype.queryMicroServices,
      ).toHaveBeenCalledTimes(1);
      expect(
        MicroServiceQueryUseCase.prototype.queryMicroServices,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "queryMicroService" }),
      );
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryMicroService").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Query failed",
      );
      (
        MicroServiceQueryUseCase.prototype.queryMicroServices as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/micro-services");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query throws an exception", async () => {
      (
        MicroServiceQueryUseCase.prototype.queryMicroServices as vi.Mock
      ).mockRejectedValue(new Error("Unexpected error"));

      const response = await supertest(app).get("/v1/micro-services");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(
        expect.objectContaining({ transactionId: "queryMicroService" }),
      );
    });
  });

  describe("POST /v1/micro-services/check", () => {
    it("should return 200 when manual health check is triggered", async () => {
      const expectedResponse = new ResponseModel(
        "triggerMicroServicesHealthCheck",
      ).withResponse(null);
      (
        MicroServiceManagementUseCase.prototype.triggerHealthChecks as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/v1/micro-services/check")
        .send({ serviceName: "vms_projects" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(
        MicroServiceManagementUseCase.prototype.triggerHealthChecks,
      ).toHaveBeenCalledTimes(1);
    });

    it("should return 500 when triggerHealthChecks throws an exception", async () => {
      (
        MicroServiceManagementUseCase.prototype.triggerHealthChecks as vi.Mock
      ).mockRejectedValue(new Error("Unexpected failure"));

      const response = await supertest(app)
        .post("/v1/micro-services/check")
        .send({});

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("POST /v1/micro-services/:name/check", () => {
    it("should return 200 when single service check is triggered", async () => {
      const expectedResponse = new ResponseModel(
        "triggerMicroServiceHealthCheck",
      ).withResponse(null);
      (
        MicroServiceManagementUseCase.prototype.triggerHealthChecks as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post(
        "/v1/micro-services/ms-auth/check",
      );

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 500 when single service check throws an error", async () => {
      (
        MicroServiceManagementUseCase.prototype.triggerHealthChecks as vi.Mock
      ).mockRejectedValue(new Error("Collector failed"));

      const response = await supertest(app).post(
        "/v1/micro-services/ms-auth/check",
      );

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });
  });

  describe("GET /v1/micro-services/:name/history", () => {
    it("should return 200 with service health history summary", async () => {
      const mockSummary = {
        serviceName: "ms-auth",
        currentStatus: "UP",
        uptime24hPercentage: 100,
        uptime30dPercentage: 99.5,
        averageResponseTimeMs: 15,
        history: [],
      };
      const expectedResponse = new ResponseModel(
        "getMicroServiceHealthHistory",
      ).withResponse(mockSummary);
      (
        MicroServiceQueryUseCase.prototype.getHealthHistory as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get(
        "/v1/micro-services/ms-auth/history?days=30",
      );

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.data).toEqual(mockSummary);
    });

    it("should return 500 when getHealthHistory throws an error", async () => {
      (
        MicroServiceQueryUseCase.prototype.getHealthHistory as vi.Mock
      ).mockRejectedValue(new Error("Telemetry DB unavailable"));

      const response = await supertest(app).get(
        "/v1/micro-services/ms-auth/history",
      );

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });
  });

  describe("PUT /v1/micro-services/:microserviceId/start", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel(
        "startMicroService",
      ).withResponse(null);
      (
        MicroServiceManagementUseCase.prototype.startMicroService as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put(
        "/v1/micro-services/ms-123/start",
      );

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(
        MicroServiceManagementUseCase.prototype.startMicroService,
      ).toHaveBeenCalledTimes(1);
      expect(
        MicroServiceManagementUseCase.prototype.startMicroService,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "startMicroService" }),
      );
    });

    it("should return error status code when start fails", async () => {
      const expectedResponse = new ResponseModel("startMicroService").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Start failed",
      );
      (
        MicroServiceManagementUseCase.prototype.startMicroService as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put(
        "/v1/micro-services/ms-123/start",
      );

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when start throws an exception", async () => {
      (
        MicroServiceManagementUseCase.prototype.startMicroService as vi.Mock
      ).mockRejectedValue(new Error("Unexpected error"));

      const response = await supertest(app).put(
        "/v1/micro-services/ms-123/start",
      );

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(
        expect.objectContaining({ transactionId: "startMicroService" }),
      );
    });
  });

  describe("PUT /v1/micro-services/:microserviceId/restart", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel(
        "restartMicroService",
      ).withResponse(null);
      (
        MicroServiceManagementUseCase.prototype.restartMicroService as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put(
        "/v1/micro-services/ms-123/restart",
      );

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(
        MicroServiceManagementUseCase.prototype.restartMicroService,
      ).toHaveBeenCalledTimes(1);
      expect(
        MicroServiceManagementUseCase.prototype.restartMicroService,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "restartMicroService" }),
      );
    });

    it("should return error status code when restart fails", async () => {
      const expectedResponse = new ResponseModel(
        "restartMicroService",
      ).withError(DomainErrorCodes.INVALID_INPUT, "Restart failed");
      (
        MicroServiceManagementUseCase.prototype.restartMicroService as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put(
        "/v1/micro-services/ms-123/restart",
      );

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when restart throws an exception", async () => {
      (
        MicroServiceManagementUseCase.prototype.restartMicroService as vi.Mock
      ).mockRejectedValue(new Error("Unexpected error"));

      const response = await supertest(app).put(
        "/v1/micro-services/ms-123/restart",
      );

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(
        expect.objectContaining({ transactionId: "restartMicroService" }),
      );
    });
  });

  describe("PUT /v1/micro-services/:microserviceId/stop", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel(
        "stopMicroService",
      ).withResponse(null);
      (
        MicroServiceManagementUseCase.prototype.stopMicroService as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put(
        "/v1/micro-services/ms-123/stop",
      );

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(
        MicroServiceManagementUseCase.prototype.stopMicroService,
      ).toHaveBeenCalledTimes(1);
      expect(
        MicroServiceManagementUseCase.prototype.stopMicroService,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ transactionId: "stopMicroService" }),
      );
    });

    it("should return error status code when stop fails", async () => {
      const expectedResponse = new ResponseModel("stopMicroService").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Stop failed",
      );
      (
        MicroServiceManagementUseCase.prototype.stopMicroService as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put(
        "/v1/micro-services/ms-123/stop",
      );

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when stop throws an exception", async () => {
      (
        MicroServiceManagementUseCase.prototype.stopMicroService as vi.Mock
      ).mockRejectedValue(new Error("Unexpected error"));

      const response = await supertest(app).put(
        "/v1/micro-services/ms-123/stop",
      );

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(
        expect.objectContaining({ transactionId: "stopMicroService" }),
      );
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

      const expectedResponse = new ResponseModel<Readable>(
        "watchMicroServiceLogs",
      ).withResponse(mockStream);
      (
        MicroServiceQueryUseCase.prototype.watchMicroServiceLogs as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .get("/v1/micro-services/ms-123/logs/watch")
        .buffer(true);

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.headers["transfer-encoding"]).toBe("chunked");
      expect(response.headers["content-type"]).toBe("application/octet-stream");
      const logContent = (response.body as Buffer).toString("utf8");
      expect(logContent).toContain("log chunk 1");
      expect(logContent).toContain("log chunk 2");
    });

    it("should return error code when use case watchMicroServiceLogs returns error code", async () => {
      const expectedResponse = new ResponseModel<Readable>(
        "watchMicroServiceLogs",
      ).withError(DomainErrorCodes.INVALID_INPUT, "Failed to watch logs");
      (
        MicroServiceQueryUseCase.prototype.watchMicroServiceLogs as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get(
        "/v1/micro-services/ms-123/logs/watch",
      );

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 404 when no logs stream is returned", async () => {
      const expectedResponse = new ResponseModel<Readable>(
        "watchMicroServiceLogs",
      ).withResponse(null);
      (
        MicroServiceQueryUseCase.prototype.watchMicroServiceLogs as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get(
        "/v1/micro-services/ms-123/logs/watch",
      );

      expect(response.status).toBe(HttpStatusCodes.NOT_FOUND);
    });

    it("should handle error event in the stream and end request", async () => {
      const mockStream = new Readable({
        read() {
          this.emit("error", new Error("Stream error"));
        },
      });

      const expectedResponse = new ResponseModel<Readable>(
        "watchMicroServiceLogs",
      ).withResponse(mockStream);
      (
        MicroServiceQueryUseCase.prototype.watchMicroServiceLogs as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .get("/v1/micro-services/ms-123/logs/watch")
        .buffer(true);

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 500 when logs watch throws an exception", async () => {
      (
        MicroServiceQueryUseCase.prototype.watchMicroServiceLogs as vi.Mock
      ).mockRejectedValue(new Error("Unexpected error"));

      const response = await supertest(app).get(
        "/v1/micro-services/ms-123/logs/watch",
      );

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).toEqual(
        expect.objectContaining({ transactionId: "watchMicroServiceLogs" }),
      );
    });
  });

  describe("GET /v1/micro-services/:name/audit-logs", () => {
    it("should return 200 with audit logs", async () => {
      const mockLogs = [
        {
          serviceName: "ms-auth",
          action: "RESTART",
          performedBy: "admin",
          timestamp: new Date().toISOString(),
        },
      ];
      const expectedResponse = new ResponseModel(
        "queryMicroServiceAuditLogs",
      ).withResponse(mockLogs);

      (
        MicroServiceQueryUseCase.prototype.queryAuditLogs as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get(
        "/v1/micro-services/ms-auth/audit-logs?limit=20",
      );

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.data).toEqual(mockLogs);
    });

    it("should return 500 when queryAuditLogs throws an unexpected error", async () => {
      (
        MicroServiceQueryUseCase.prototype.queryAuditLogs as vi.Mock
      ).mockRejectedValue(new Error("Database crash"));

      const response = await supertest(app).get(
        "/v1/micro-services/ms-auth/audit-logs",
      );

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });
  });

  describe("PUT /v1/micro-services/:name/scale", () => {
    it("should return 200 when scaling succeeds", async () => {
      const expectedResponse = new ResponseModel("scaleMicroService");
      (
        MicroServiceManagementUseCase.prototype.scaleMicroService as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .put("/v1/micro-services/ms-auth/scale")
        .send({ replicas: 3 });

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 400 when domain rejects invalid replicas count", async () => {
      const expectedResponse = new ResponseModel("scaleMicroService").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Replicas count must be between 0 and 10.",
      );
      (
        MicroServiceManagementUseCase.prototype.scaleMicroService as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .put("/v1/micro-services/ms-auth/scale")
        .send({ replicas: 50 });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body.message).toBe(
        "Replicas count must be between 0 and 10.",
      );
    });

    it("should return 500 when scaling throws an unexpected error", async () => {
      (
        MicroServiceManagementUseCase.prototype.scaleMicroService as vi.Mock
      ).mockRejectedValue(new Error("Docker daemon down"));

      const response = await supertest(app)
        .put("/v1/micro-services/ms-auth/scale")
        .send({ replicas: 2 });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });
  });

  describe("GET /v1/micro-services/:name/configurations", () => {
    it("should return 200 with configurations list", async () => {
      const mockConfigs = [
        {
          id: 1,
          serviceName: "ms-auth",
          key: "PORT",
          value: "3001",
          type: "number",
        },
      ];
      const expectedResponse = new ResponseModel(
        "queryMicroServiceConfigurations",
      ).withResponse(mockConfigs);
      (
        MicroServiceQueryUseCase.prototype.queryConfigurations as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get(
        "/v1/micro-services/ms-auth/configurations",
      );

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.data).toEqual(mockConfigs);
    });

    it("should return 400 when serviceName query fails validation", async () => {
      const expectedResponse = new ResponseModel(
        "queryMicroServiceConfigurations",
      ).withError(DomainErrorCodes.INVALID_INPUT, "Service name is required.");
      (
        MicroServiceQueryUseCase.prototype.queryConfigurations as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get(
        "/v1/micro-services/unknown/configurations",
      );

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body.message).toBe("Service name is required.");
    });

    it("should return 500 when queryConfigurations throws unexpected error", async () => {
      (
        MicroServiceQueryUseCase.prototype.queryConfigurations as vi.Mock
      ).mockRejectedValue(new Error("Database connection lost"));

      const response = await supertest(app).get(
        "/v1/micro-services/ms-auth/configurations",
      );

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });
  });

  describe("PUT /v1/micro-services/:name/configurations/:key", () => {
    it("should return 200 when updating configuration succeeds", async () => {
      const updatedConfig = {
        id: 1,
        serviceName: "ms-auth",
        key: "LOG_LEVEL",
        value: "debug",
        type: "string",
      };
      const expectedResponse = new ResponseModel(
        "updateMicroServiceConfiguration",
      ).withResponse(updatedConfig);
      (
        MicroServiceManagementUseCase.prototype.updateConfiguration as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .put("/v1/micro-services/ms-auth/configurations/LOG_LEVEL")
        .send({ value: "debug" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.data).toEqual(updatedConfig);
    });

    it("should return 400 when update configuration has invalid input", async () => {
      const expectedResponse = new ResponseModel(
        "updateMicroServiceConfiguration",
      ).withError(
        DomainErrorCodes.INVALID_INPUT,
        "Service name, key and value are required.",
      );
      (
        MicroServiceManagementUseCase.prototype.updateConfiguration as vi.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .put("/v1/micro-services/ms-auth/configurations/LOG_LEVEL")
        .send({ value: "" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body.message).toBe(
        "Service name, key and value are required.",
      );
    });

    it("should return 500 when updateConfiguration throws unexpected error", async () => {
      (
        MicroServiceManagementUseCase.prototype.updateConfiguration as vi.Mock
      ).mockRejectedValue(new Error("Write failed"));

      const response = await supertest(app)
        .put("/v1/micro-services/ms-auth/configurations/LOG_LEVEL")
        .send({ value: "debug" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });
  });
});
