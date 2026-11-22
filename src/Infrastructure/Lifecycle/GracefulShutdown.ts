import type { Server } from "node:http";
import type { WebSocketServer } from "ws";
import logger from "#src/common/logger.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";

/**
 * Time left to the requests under way. Docker sends SIGKILL 10 s after
 * SIGTERM: the rest is for the database.
 */
const SHUTDOWN_GRACE_MS = 8000;

/** What the service closes when it is asked to stop (ADM-N21). */
export interface ShutdownParts {
  server: Pick<
    Server,
    "close" | "closeIdleConnections" | "closeAllConnections"
  >;
  /** The long-lived connections, closed first: they hold the server. */
  closeSockets: () => void;
  /** The background tasks, the health checks and the resource sampling. */
  stopJobs: () => void;
  closeDatabase: () => Promise<void>;
  graceMs?: number;
}

/** Tells the browsers of the container logs that the server is going. */
export function closeWebSockets(
  sockets: Pick<WebSocketServer, "clients" | "close">,
): void {
  for (const client of sockets.clients) {
    client.close(1001, "Server shutting down");
  }
  sockets.close();
}

const waitMs = (ms: number) =>
  new Promise<"late">((resolve) => {
    setTimeout(() => resolve("late"), ms).unref();
  });

/**
 * Stops the jobs, lets the requests under way finish within the grace time,
 * then closes the database. A request still open after it is cut.
 */
export async function shutDown(
  parts: ShutdownParts,
  reason: string,
): Promise<void> {
  const graceMs = parts.graceMs ?? SHUTDOWN_GRACE_MS;
  logger.info(`Shutting down (${reason})`);
  parts.stopJobs();
  parts.closeSockets();

  // No new connection; the idle ones go now, the busy ones when they answer
  const closed = new Promise<"closed">((resolve) => {
    parts.server.close(() => resolve("closed"));
  });
  parts.server.closeIdleConnections();
  if ((await Promise.race([closed, waitMs(graceMs)])) === "late") {
    logger.warn(`Requests still open after ${graceMs} ms: cut`);
    parts.server.closeAllConnections();
  }

  try {
    await parts.closeDatabase();
  } catch (error) {
    logger.err(`Database not closed: ${errorMessage(error)}`);
  }
  logger.info("Shut down");
}

interface SignalSource {
  on(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void): void;
}

/**
 * Shuts down on SIGTERM (docker stop) or SIGINT (Ctrl+C), then exits. A
 * second signal exits at once.
 */
export function onShutdownSignals(
  parts: ShutdownParts,
  {
    exit,
    signals = process,
  }: {
    /** process.exit, given by the entry point of the service. */
    exit: (code: number) => void;
    signals?: SignalSource;
  },
): void {
  let stopping = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (stopping) {
      logger.warn(`${signal} again: exiting at once`);
      exit(1);
      return;
    }
    stopping = true;
    void shutDown(parts, signal).then(
      () => exit(0),
      (error: unknown) => {
        logger.err(`Shutdown failed: ${errorMessage(error)}`);
        exit(1);
      },
    );
  };
  signals.on("SIGTERM", onSignal);
  signals.on("SIGINT", onSignal);
}
