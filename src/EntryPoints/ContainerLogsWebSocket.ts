import type { IncomingMessage, Server } from "node:http";
import type { Readable } from "node:stream";
import { parseCookie } from "cookie";
import logger from "jet-logger";
import { type RawData, WebSocket, WebSocketServer } from "ws";
import { describeError } from "#src/common/describeError.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";

/** Same permission as GET /v1/micro-services/:id/logs. */
export const CONTAINER_LOGS_PERMISSION = "micro-services::query";
const MAX_SERVICE_ID_LENGTH = 128;
const POLICY_VIOLATION = 1008;

export interface ContainerLogsAccess {
  errorCode?: unknown;
  data?: { exp?: number } | null;
}

export interface ContainerLogsDependencies {
  /** Browser origins allowed to open the socket (the CORS patterns). */
  allowedOrigins: readonly RegExp[];
  /** Checks the session token and the logs permission. */
  checkAccess: (token: string) => Promise<ContainerLogsAccess>;
  watchLogs: (
    request: RequestModel<string>,
  ) => Promise<ResponseModel<NodeJS.ReadableStream>>;
  now?: () => number;
}

/**
 * A browser always sends Origin; a client without one (script, command line
 * tool) is not exposed to cross-site WebSocket hijacking and still needs the
 * permission.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: readonly RegExp[],
): boolean {
  if (!origin) return true;
  return allowedOrigins.some((pattern) => pattern.test(origin));
}

function serviceIdOf(message: RawData): string | null {
  try {
    const text = Buffer.isBuffer(message)
      ? message.toString("utf8")
      : String(message);
    const id = (JSON.parse(text) as { microserviceId?: unknown })
      .microserviceId;
    return typeof id === "string" &&
      id.trim() !== "" &&
      id.length <= MAX_SERVICE_ID_LENGTH
      ? id
      : null;
  } catch {
    return null;
  }
}

/**
 * Live container logs (EV-71 lot 1): the session must hold the logs
 * permission, the origin must be listed, the socket closes when the session
 * expires, and a connection follows one log stream at a time.
 */
export function attachContainerLogsWebSocket(
  server: Server,
  deps: ContainerLogsDependencies,
): WebSocketServer {
  const now = deps.now ?? Date.now;
  const webSocketServer = new WebSocketServer({
    server,
    verifyClient: (info: { origin?: string }) =>
      isAllowedOrigin(info.origin, deps.allowedOrigins),
  });

  webSocketServer.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    let stream: Readable | null = null;
    let expiryTimer: NodeJS.Timeout | null = null;
    const stopStream = () => {
      stream?.destroy();
      stream = null;
    };

    // Messages sent right after opening wait for the access check
    const authorized = (async () => {
      const token = parseCookie(req.headers.cookie ?? "").authToken ?? "";
      const access = await deps.checkAccess(token);
      if (access.errorCode) {
        ws.close(POLICY_VIOLATION, "Access denied");
        return false;
      }
      const exp = access.data?.exp;
      if (typeof exp === "number") {
        expiryTimer = setTimeout(
          () => ws.close(POLICY_VIOLATION, "Session expired"),
          Math.max(0, exp * 1000 - now()),
        );
      }
      return true;
    })().catch((error) => {
      logger.err(describeError(error));
      ws.close(POLICY_VIOLATION, "Access denied");
      return false;
    });

    ws.on("message", async (message) => {
      if (!(await authorized)) return;
      const microserviceId = serviceIdOf(message);
      if (!microserviceId) {
        ws.send(
          JSON.stringify({ error: "A valid microserviceId is required." }),
        );
        return;
      }
      stopStream();
      try {
        const response = await deps.watchLogs(
          new RequestModel("watchMicroServiceLogs", microserviceId),
        );
        if (response.errorCode || !response.data) {
          ws.send(
            JSON.stringify(
              response.errorCode
                ? response
                : response.withError(
                    DomainErrorCodes.ENTITY_NOT_FOUND,
                    `No Logs found for microservice with id: ${microserviceId}`,
                  ),
            ),
          );
          return;
        }
        const logStream = response.data as Readable;
        stream = logStream;
        logStream.on("data", (chunk: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(chunk.toString("utf8"));
        });
        logStream.on("end", () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ message: "Log stream ended" }));
          }
        });
      } catch (error) {
        logger.err(describeError(error));
        ws.send(JSON.stringify({ error: "Could not read the logs." }));
      }
    });

    ws.on("close", () => {
      stopStream();
      if (expiryTimer) clearTimeout(expiryTimer);
    });
  });

  return webSocketServer;
}
