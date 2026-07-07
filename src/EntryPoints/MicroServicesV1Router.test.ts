import express from "express";
import supertest from "supertest";
import microServicesV1Router from "./MicroServicesV1Router";
import { MicroServiceUseCases } from "@src/Domain/MicroService/MicroServiceCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Readable } from "stream";

// Mock dependencies
jest.mock("@src/Domain/MicroService/MicroServiceCases");
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (_req: unknown, _res: unknown, next: () => void) => {
    next();
  },
}));

describe("MicroServicesV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/v1/micro-services", microServicesV1Router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/micro-services", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("queryMicroService").withResponse([]);
      (MicroServiceUseCases.prototype.queryMicroServices as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/v1/micro-services")
        .query({ pageNumber: 1, pageSize: 10, name: "test" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(MicroServiceUseCases.prototype.queryMicroServices).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when query fails", async () => {
      const expectedResponse = new ResponseModel("queryMicroService").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Query failed",
      );
      (MicroServiceUseCases.prototype.queryMicroServices as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).get("/v1/micro-services");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when query throws an exception", async () => {
      (MicroServiceUseCases.prototype.queryMicroServices as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/micro-services");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /v1/micro-services/:microserviceId/start", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("startMicroService").withResponse(null);
      (MicroServiceUseCases.prototype.startMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/start");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(MicroServiceUseCases.prototype.startMicroService).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when start fails", async () => {
      const expectedResponse = new ResponseModel("startMicroService").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Start failed",
      );
      (MicroServiceUseCases.prototype.startMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/start");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when start throws an exception", async () => {
      (MicroServiceUseCases.prototype.startMicroService as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/start");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /v1/micro-services/:microserviceId/restart", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("restartMicroService").withResponse(null);
      (MicroServiceUseCases.prototype.restartMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/restart");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(MicroServiceUseCases.prototype.restartMicroService).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when restart fails", async () => {
      const expectedResponse = new ResponseModel("restartMicroService").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Restart failed",
      );
      (MicroServiceUseCases.prototype.restartMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/restart");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when restart throws an exception", async () => {
      (MicroServiceUseCases.prototype.restartMicroService as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/restart");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /v1/micro-services/:microserviceId/stop", () => {
    it("should return 200 on success", async () => {
      const expectedResponse = new ResponseModel("stopMicroService").withResponse(null);
      (MicroServiceUseCases.prototype.stopMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/stop");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(MicroServiceUseCases.prototype.stopMicroService).toHaveBeenCalledTimes(1);
    });

    it("should return error status code when stop fails", async () => {
      const expectedResponse = new ResponseModel("stopMicroService").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Stop failed",
      );
      (MicroServiceUseCases.prototype.stopMicroService as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/v1/micro-services/ms-123/stop");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when stop throws an exception", async () => {
      (MicroServiceUseCases.prototype.stopMicroService as jest.Mock).mockRejectedValue(
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
      (MicroServiceUseCases.prototype.watchMicroServiceLogs as jest.Mock).mockResolvedValue(
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
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Failed to watch logs",
      );
      (MicroServiceUseCases.prototype.watchMicroServiceLogs as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).get("/v1/micro-services/ms-123/logs/watch");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 404 when no logs stream is returned", async () => {
      const expectedResponse = new ResponseModel<Readable>("watchMicroServiceLogs").withResponse(
        null,
      );
      (MicroServiceUseCases.prototype.watchMicroServiceLogs as jest.Mock).mockResolvedValue(
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
      (MicroServiceUseCases.prototype.watchMicroServiceLogs as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/v1/micro-services/ms-123/logs/watch")
        .buffer(true);

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 500 when logs watch throws an exception", async () => {
      (MicroServiceUseCases.prototype.watchMicroServiceLogs as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/micro-services/ms-123/logs/watch");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
