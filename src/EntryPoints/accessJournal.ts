import type { NextFunction, Request, Response } from "express";
import type { AccessEntry } from "#src/Domain/Activity/AccessEntry.js";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import { actorOf } from "./actor.js";

type AccessEvent = Pick<AccessEntry, "event" | "outcome" | "reason"> & {
  userId?: string | null;
};

// The path without its query string, which may carry a token
const pathOf = (req: Request): string => req.originalUrl.split("?")[0];

/**
 * Records an access event once the answer is sent, with its status, so that
 * the journal never delays the client. The refusal recorder then skips it.
 */
export function recordAccess(
  journal: IAccessJournal,
  req: Request,
  res: Response,
  event: AccessEvent,
): void {
  res.locals.accessRecorded = true;
  res.once("finish", () => {
    void journal.record({
      ...event,
      // A success whose answer failed afterwards (a 500) is no success
      outcome: res.statusCode >= 400 ? "failed" : event.outcome,
      userId: event.userId ?? null,
      ip: req.ip ?? null,
      method: req.method,
      path: pathOf(req),
      statusCode: res.statusCode,
    });
  });
}

const REFUSALS: Record<number, string> = {
  401: "unauthorized",
  403: "forbidden",
  429: "too_many_requests",
};

/**
 * Records every refused request (401, 403, 429), whoever refused it:
 * variamos_security, the role hierarchy or a rate limit (T-24, MA-AU-02).
 * Mount it before the routers.
 */
export function recordRefusals(journal: IAccessJournal) {
  // A session probe of the pages and the guest sign-in: no access attempt.
  // Suffixes of the auth routes, not imported: AuthRouter imports this file.
  const notRecorded = ["/auth/session-info", "/auth/guest/sign-in"];
  return (req: Request, res: Response, next: NextFunction): void => {
    res.once("finish", () => {
      const reason = REFUSALS[res.statusCode];
      if (!reason || res.locals.accessRecorded) return;
      const path = pathOf(req);
      if (notRecorded.some((ignored) => path.endsWith(ignored))) return;
      void journal.record({
        event: "access.refused",
        outcome: "failed",
        reason,
        userId: actorOf(req) ?? null,
        ip: req.ip ?? null,
        method: req.method,
        path,
        statusCode: res.statusCode,
      });
    });
    next();
  };
}
