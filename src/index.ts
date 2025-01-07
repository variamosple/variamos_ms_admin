import logger from "jet-logger";
import "./pre-start"; // Must be the first import

import EnvVars from "@src/common/EnvVars";
import { initKeyStore, validateSession } from "@variamos/variamos-security";
import * as cookie from "cookie";
import { Readable } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import HttpStatusCodes from "./common/HttpStatusCodes";
import { RequestModel } from "./Domain/Core/Entity/RequestModel";
import { MicroServiceUseCases } from "./Domain/MicroService/MicroServiceCases";
import app from "./server";
// **** Run **** //

const SERVER_START_MSG =
  "Express server started on port: " + EnvVars.Port.toString();

const server = app.listen(EnvVars.Port, () => {
  initKeyStore().then();
  logger.info(SERVER_START_MSG);
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
        microserviceId as string
      );

      const response = await new MicroServiceUseCases().watchMicroServiceLogs(
        request
      );

      if (response.errorCode) {
        return ws.send(JSON.stringify(response));
      }

      if (!response.data) {
        return ws.send(
          JSON.stringify(
            response.withError(
              HttpStatusCodes.NOT_FOUND,
              "No Logs found for microservice with id: " + microserviceId
            )
          )
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
