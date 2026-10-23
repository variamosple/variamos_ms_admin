import type { Request } from "express";

/** The signed-in user who asks for an operation, for the activity journal. */
export const actorOf = (req: Request): string | undefined =>
  (req.user as { id?: string } | undefined)?.id;
