import type { SessionUser } from "@variamosple/variamos-security";
import type { Request } from "express";

/** The signed-in user who asks for an operation, for the activity journal. */
export const actorOf = (req: Request): string | undefined => req.user?.id;

/**
 * The user that `isAuthenticated` set on the request. A route behind it
 * always has one; without it, the route is wired wrong and answers 500.
 */
export function signedInUser(req: Request): SessionUser {
  if (!req.user) {
    throw new Error(
      "No signed-in user: the route must sit behind isAuthenticated.",
    );
  }
  return req.user;
}
