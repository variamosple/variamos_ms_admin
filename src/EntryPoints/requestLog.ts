import type { NextFunction, Request, Response } from "express";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";

/** An answer slower than this is written as a warning. */
export const SLOW_REQUEST_MS = 1000;

/** Polled by the deployment check and the monitoring: never written. */
const NOT_LOGGED = ["/health"];

const segmentsOf = (path: string): string[] => path.split("/").filter(Boolean);

/**
 * The route that answered, as declared (`/bugs/:id/assignees`), so that a
 * line never holds an identifier. When an error goes back up, Express has
 * already restored `baseUrl`: the prefix is taken from the path instead, as
 * many segments as the route does not declare. An address no route matched
 * keeps only the prefix of the router that answered, if any: scanners ask
 * for many such addresses.
 */
export function routeOf(req: Request): string {
  const declared: unknown = req.route?.path;
  if (typeof declared === "string") {
    const path = segmentsOf(pathOf(req));
    const own = segmentsOf(declared);
    const prefix = path.slice(0, Math.max(0, path.length - own.length));
    return `/${[...prefix, ...own].join("/")}`;
  }
  return req.baseUrl ? `${req.baseUrl}/*` : "(no route)";
}

const pathOf = (req: Request): string => req.originalUrl.split("?")[0] ?? "/";

/**
 * One line per answer, once it is sent: method, route, status and duration
 * (ADM-N41). No address, account, header, body or query string. A server
 * error is written as an error, a slow or abandoned answer as a warning.
 */
export function requestLog(logger: ILogger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (NOT_LOGGED.some((path) => pathOf(req).startsWith(path))) {
      next();
      return;
    }
    const start = performance.now();
    // "close" also comes when the client leaves before the answer: a route
    // so slow that the browser gave up is the one to see
    res.once("close", () => {
      const ms = Math.round(performance.now() - start);
      const sent = res.writableFinished;
      const status = sent ? String(res.statusCode) : "aborted";
      const line = `HTTP ${req.method} ${routeOf(req)} ${status} ${ms} ms`;
      if (sent && res.statusCode >= 500) logger.err(line);
      else if (!sent || ms >= SLOW_REQUEST_MS) logger.warn(line);
      else logger.info(line);
    });
    next();
  };
}
