import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import logger from "jet-logger";
import "./pre-start"; // Must be the first import

import EnvVars from "@src/common/EnvVars";
import { initKeyStore, validateSession } from "@variamosple/variamos-security";
import * as cookie from "cookie";
import { Readable } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import HttpStatusCodes from "./common/HttpStatusCodes";
import { RequestModel } from "./Domain/Core/Entity/RequestModel";
import { MicroServiceUseCases } from "./Domain/MicroService/MicroServiceCases";
import { MicroServiceRepositoryInstance } from "./CompositionRoot";
import app from "./server";
// **** Run **** //

import { productionBugUseCases as bugUseCases } from "./EntryPoints";
import { BugModel } from "./DataProviders/Bug/Bug";
import { BugAttachmentModel } from "./DataProviders/Bug/BugAttachment";
import { BugLogModel } from "./DataProviders/Bug/BugLog";
import "./DataProviders/Bug/BugAssociations";

const SERVER_START_MSG = "Express server started on port: " + EnvVars.Port.toString();

const server = app.listen(EnvVars.Port, async () => {
  initKeyStore().then();
  logger.info(SERVER_START_MSG);

  // Sync Bug tracker models to guarantee tables exist
  try {
    logger.info("Synchronizing Bug Tracker Database models...");
    await BugModel.sync();
    await BugAttachmentModel.sync();
    await BugLogModel.sync();
    logger.info("Bug Tracker Database models synchronized successfully.");

    // Purge expired rejected bugs (older than 7 days) on startup
    await bugUseCases.purgeExpiredRejectedBugs();
  } catch (e) {
    const err = e as Error;
    logger.err("Failed to synchronize Bug tracker models: " + err.message);
  }

  // Run periodic bugs sync every 15 minutes
  const SYNC_INTERVAL = 15 * 60 * 1000;
  setInterval(async () => {
    try {
      logger.info("Executing periodic bugs synchronization...");
      const request = new RequestModel<void>("periodicSyncBugs");
      await bugUseCases.syncBugs(request);
    } catch (e) {
      const err = e as Error;
      logger.err("Failed to execute periodic bugs sync: " + err.message);
    }
  }, SYNC_INTERVAL);

  // Run periodic expired bugs purge (default: every 24 hours)
  const PURGE_INTERVAL = 24 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      logger.info("Executing periodic expired bugs purge...");
      await bugUseCases.purgeExpiredRejectedBugs();
    } catch (e) {
      const err = e as Error;
      logger.err("Failed to execute periodic expired bugs purge: " + err.message);
    }
  }, PURGE_INTERVAL);
});

const webSocketServer = new WebSocketServer({ server });

webSocketServer.on("connection", async (ws, req) => {
  logger.info("WebSocket connection established");

  const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};

  const validationResponse = await validateSession(cookies.authToken);

  if (validationResponse.errorCode) {
    ws.close(1008, validationResponse.message);
    return;
  }

  ws.on("message", async (message) => {
    const messageStr = Buffer.isBuffer(message) ? message.toString("utf8") : String(message);
    logger.info("Message received: " + messageStr);

    try {
      const parsedData = JSON.parse(messageStr) as { microserviceId?: string };
      const microserviceId = parsedData.microserviceId;
      const transactionId = "watchMicroServiceLogs";

      const request = new RequestModel<string>(transactionId, microserviceId as string);

      const response = await new MicroServiceUseCases(
        MicroServiceRepositoryInstance,
      ).watchMicroServiceLogs(request);

      if (response.errorCode) {
        return ws.send(JSON.stringify(response));
      }

      if (!response.data) {
        return ws.send(
          JSON.stringify(
            response.withError(
              DomainErrorCodes.ENTITY_NOT_FOUND,
              "No Logs found for microservice with id: " + microserviceId,
            ),
          ),
        );
      }

      const logStream = response.data;

      logStream.on("data", (chunk: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk.toString("utf8"));
        }
      });

      logStream.on("end", () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ message: "Log stream ended" }));
        }
      });

      ws.on("close", () => {
        (logStream as Readable).destroy();
      });
    } catch (error) {
      const err = error as Error;
      ws.send(JSON.stringify({ error: err.message }));
    }
  });

  ws.on("close", () => {
    logger.info("WebSocket connection closed");
  });
});
