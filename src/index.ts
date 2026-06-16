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
import app from "./server";
// **** Run **** //

import { BugUseCases } from "./Domain/Bug/BugUseCases";
import { DiskStorageServiceInstance } from "./Infrastructure/Storage/DiskStorageService";
import { GitHubIssuesServiceInstance } from "./Infrastructure/GitHub/GitHubIssuesService";
import { GitHubBugModel } from "./DataProviders/Bug/GitHubBug";
import { LocalBugModel } from "./DataProviders/Bug/LocalBug";
import { LocalBugAttachmentModel } from "./DataProviders/Bug/LocalBugAttachment";
import { LocalBugLogModel } from "./DataProviders/Bug/LocalBugLog";
import "./DataProviders/Bug/LocalBugAssociations";

import { GitHubBugRepositoryInstance } from "./DataProviders/Bug/GitHubBugRepository";
import { LocalBugRepositoryInstance } from "./DataProviders/Bug/LocalBugRepository";

const SERVER_START_MSG =
  "Express server started on port: " + EnvVars.Port.toString();

const bugUseCases = new BugUseCases(
  GitHubIssuesServiceInstance,
  DiskStorageServiceInstance,
  GitHubBugRepositoryInstance,
  LocalBugRepositoryInstance,
);

const server = app.listen(EnvVars.Port, async () => {
  initKeyStore().then();
  logger.info(SERVER_START_MSG);

  // Sync Bug tracker models to guarantee tables exist
  try {
    logger.info("Synchronizing Bug Tracker Database models...");
    await LocalBugModel.sync();
    await GitHubBugModel.sync();
    await LocalBugAttachmentModel.sync();
    await LocalBugLogModel.sync();
    logger.info("Bug Tracker Database models synchronized successfully.");

    // Purge expired rejected bugs (older than 7 days) on startup
    await bugUseCases.purgeExpiredRejectedBugs();
  } catch (e) {
    logger.err("Failed to synchronize Bug tracker models: " + e.message);
  }

  // Run periodic bugs sync every 15 minutes
  const SYNC_INTERVAL = 15 * 60 * 1000;
  setInterval(async () => {
    try {
      logger.info("Executing periodic bugs synchronization...");
      const request = new RequestModel<void>("periodicSyncBugs");
      await bugUseCases.syncBugs(request);
    } catch (e) {
      logger.err("Failed to execute periodic bugs sync: " + e.message);
    }
  }, SYNC_INTERVAL);
});

const webSocketServer = new WebSocketServer({ server });

webSocketServer.on("connection", async (ws, req) => {
  console.log("WebSocket connection established");

  const cookies = req.headers.cookie ? cookie.parse(req.headers.cookie) : {};

  const validationResponse = await validateSession(cookies.authToken);

  if (validationResponse.errorCode) {
    ws.close(1008, validationResponse.message);
    return;
  }

  ws.on("message", async (message) => {
    console.log("Message received: " + message);

    try {
      const { microserviceId } = JSON.parse(message.toString());
      const transactionId = "watchMicroServiceLogs";

      const request = new RequestModel<string>(
        transactionId,
        microserviceId as string,
      );

      const response = await new MicroServiceUseCases().watchMicroServiceLogs(
        request,
      );

      if (response.errorCode) {
        return ws.send(JSON.stringify(response));
      }

      if (!response.data) {
        return ws.send(
          JSON.stringify(
            response.withError(
              HttpStatusCodes.NOT_FOUND,
              "No Logs found for microservice with id: " + microserviceId,
            ),
          ),
        );
      }

      const logStream = response.data!;

      logStream.on("data", (chunk) => {
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
      ws.send(JSON.stringify({ error: error.message }));
    }
  });

  ws.on("close", () => {
    logger.info("WebSocket connection closed");
  });
});
