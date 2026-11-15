import { validateSession } from "@variamosple/variamos-security";
import type { Request } from "express";
import logger from "#src/common/logger.js";
import { queryText } from "./queryText.js";

/** The session token a request carries: its cookie, else its header. */
export const sessionTokenOf = (req: Request): string | undefined =>
  queryText(req.cookies?.authToken) || req.headers.authorization?.split(" ")[1];

/**
 * The account of a route open to visitors (EV-23): the signed-in user, else
 * the one a valid session token names; undefined for a visitor without a
 * session, or when the token cannot be read. Never refuses the request.
 */
export async function sessionAccountIdOf(
  req: Request,
  route: string,
): Promise<string | undefined> {
  if (req.user) return req.user.id;
  const token = sessionTokenOf(req);
  if (!token) return undefined;
  try {
    const session = await validateSession(token);
    // createJwt writes the account id in sub, and only there
    return session?.data?.sub || undefined;
  } catch (e) {
    logger.err(`${route}: Error during session validation:`);
    logger.err(e);
    return undefined;
  }
}
