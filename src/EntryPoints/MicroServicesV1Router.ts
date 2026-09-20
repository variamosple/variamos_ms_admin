import HttpStatusCodes from "@src/common/HttpStatusCodes.js";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import { MicroServiceFilter } from "@src/Domain/MicroService/Entity/MicroServiceFilter.js";
import type { MicroServiceManagementUseCase } from "@src/Domain/MicroService/UseCase/MicroServiceManagementUseCase.js";
import type { MicroServiceQueryUseCase } from "@src/Domain/MicroService/UseCase/MicroServiceQueryUseCase.js";
import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import logger from "jet-logger";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";

export const MICRO_SERVICES_V1_ROUTE = "/v1/micro-services";

export function createMicroServicesRouter(
  microServiceQueryUseCase: MicroServiceQueryUseCase,
  microServiceManagementUseCase: MicroServiceManagementUseCase,
): Router {
  const microServicesV1Router = Router();

  // GET /v1/micro-services (Enriched list)
  microServicesV1Router.get(
    "/",
    hasPermissions(["micro-services::query"]),
    async (req, res) => {
      const transactionId = "queryMicroService";
      const { pageNumber, pageSize, name = null } = req.query;

      try {
        const filter: MicroServiceFilter = MicroServiceFilter.builder()
          .setName((name as string) || "")
          .setPageNumber(pageNumber ? Number(pageNumber) : 1)
          .setPageSize(pageSize ? Number(pageSize) : 50)
          .build();

        const request = new RequestModel<MicroServiceFilter>(
          transactionId,
          filter,
        );
        const response =
          await microServiceQueryUseCase.queryMicroServices(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // POST /v1/micro-services/check (Trigger on-demand manual health check)
  microServicesV1Router.post(
    "/check",
    hasPermissions(["micro-services::query"]),
    async (req, res) => {
      const transactionId = "triggerMicroServicesHealthCheck";
      const { serviceName } = (req.body || {}) as { serviceName?: string };

      try {
        const request = new RequestModel<{ serviceName?: string }>(
          transactionId,
          { serviceName },
        );
        const response =
          await microServiceManagementUseCase.triggerHealthChecks(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // POST /v1/micro-services/:name/check
  microServicesV1Router.post(
    "/:name/check",
    hasPermissions(["micro-services::query"]),
    async (req: Request<{ name: string }>, res) => {
      const transactionId = "triggerMicroServiceHealthCheck";
      const { name } = req.params;

      try {
        const request = new RequestModel<{ serviceName?: string }>(
          transactionId,
          { serviceName: name },
        );
        const response =
          await microServiceManagementUseCase.triggerHealthChecks(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // GET /v1/micro-services/:name/history (Uptime bars 30d/24h)
  microServicesV1Router.get(
    "/:name/history",
    hasPermissions(["micro-services::query"]),
    async (req: Request<{ name: string }>, res) => {
      const transactionId = "getMicroServiceHealthHistory";
      const { name } = req.params;
      const days = req.query.days ? Number(req.query.days) : 30;

      try {
        const request = new RequestModel<{
          serviceName: string;
          days?: number;
        }>(transactionId, { serviceName: name, days });
        const response =
          await microServiceQueryUseCase.getHealthHistory(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // GET /v1/micro-services/:name/configurations
  microServicesV1Router.get(
    "/:name/configurations",
    hasPermissions(["micro-services::query"]),
    async (req: Request<{ name: string }>, res) => {
      const transactionId = "queryMicroServiceConfigurations";
      const { name } = req.params;

      try {
        const request = new RequestModel<string>(transactionId, name);
        const response =
          await microServiceQueryUseCase.queryConfigurations(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // PUT /v1/micro-services/:name/configurations/:key
  microServicesV1Router.put(
    "/:name/configurations/:key",
    hasPermissions(["micro-services::update"]),
    async (req: Request<{ name: string; key: string }>, res) => {
      const transactionId = "updateMicroServiceConfiguration";
      const { name, key } = req.params;
      const { value } = req.body as { value: string };
      const operatorId =
        (req.user as { email?: string; id?: string })?.email || "admin";

      try {
        const request = new RequestModel<{
          serviceName: string;
          key: string;
          value: string;
          operatorId: string;
        }>(transactionId, {
          serviceName: name,
          key,
          value,
          operatorId,
        });

        const response =
          await microServiceManagementUseCase.updateConfiguration(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // GET /v1/micro-services/:name/audit-logs
  microServicesV1Router.get(
    "/:name/audit-logs",
    hasPermissions(["micro-services::query"]),
    async (req: Request<{ name: string }>, res) => {
      const transactionId = "queryMicroServiceAuditLogs";
      const { name } = req.params;
      const limit = req.query.limit ? Number(req.query.limit) : 50;

      try {
        const request = new RequestModel<{
          serviceName: string;
          limit?: number;
        }>(transactionId, { serviceName: name, limit });
        const response = await microServiceQueryUseCase.queryAuditLogs(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // PUT /v1/micro-services/:name/scale
  microServicesV1Router.put(
    "/:name/scale",
    hasPermissions(["micro-services::update"]),
    async (req: Request<{ name: string }>, res) => {
      const transactionId = "scaleMicroService";
      const { name } = req.params;
      const { replicas } = req.body as { replicas: number };

      try {
        const request = new RequestModel<{
          serviceName: string;
          replicas: number;
        }>(transactionId, { serviceName: name, replicas });
        const response =
          await microServiceManagementUseCase.scaleMicroService(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // PUT /v1/micro-services/:microserviceId/start
  microServicesV1Router.put(
    "/:microserviceId/start",
    hasPermissions(["micro-services::update"]),
    async (req: Request<{ microserviceId: string }>, res) => {
      const transactionId = "startMicroService";
      const { microserviceId } = req.params;

      try {
        const request = new RequestModel<string>(transactionId, microserviceId);
        const response =
          await microServiceManagementUseCase.startMicroService(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // PUT /v1/micro-services/:microserviceId/restart
  microServicesV1Router.put(
    "/:microserviceId/restart",
    hasPermissions(["micro-services::update"]),
    async (req: Request<{ microserviceId: string }>, res) => {
      const transactionId = "restartMicroService";
      const { microserviceId } = req.params;

      try {
        const request = new RequestModel<string>(transactionId, microserviceId);
        const response =
          await microServiceManagementUseCase.restartMicroService(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // PUT /v1/micro-services/:microserviceId/stop
  microServicesV1Router.put(
    "/:microserviceId/stop",
    hasPermissions(["micro-services::update"]),
    async (req: Request<{ microserviceId: string }>, res) => {
      const transactionId = "stopMicroService";
      const { microserviceId } = req.params;

      try {
        const request = new RequestModel<string>(transactionId, microserviceId);
        const response =
          await microServiceManagementUseCase.stopMicroService(request);

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // GET /v1/micro-services/:microserviceId/logs/watch
  microServicesV1Router.get(
    "/:microserviceId/logs/watch",
    hasPermissions(["micro-services::query"]),
    async (req: Request<{ microserviceId: string }>, res) => {
      const transactionId = "watchMicroServiceLogs";
      const { microserviceId } = req.params;

      try {
        const request = new RequestModel<string>(transactionId, microserviceId);

        const response =
          await microServiceQueryUseCase.watchMicroServiceLogs(request);

        if (response.errorCode) {
          res
            .status(mapDomainErrorToHttpStatus(response.errorCode))
            .json(response);
          return;
        }

        if (!response.data) {
          res
            .status(HttpStatusCodes.NOT_FOUND)
            .json(
              response.withError(
                DomainErrorCodes.ENTITY_NOT_FOUND,
                `No Logs found for microservice with id: ${microserviceId}`,
              ),
            );
          return;
        }

        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Transfer-Encoding": "chunked",
        });
        res.flushHeaders();

        const stream = response.data;

        stream.on("data", (chunk: Buffer | string) => {
          res.write(chunk.toString("utf8"));
        });

        stream.on("end", () => {
          res.end();
        });

        stream.on("error", (error) => {
          logger.err(error);
          res.end();
        });
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  return microServicesV1Router;
}
