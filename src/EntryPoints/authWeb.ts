import { createJwt, type SessionUser } from "@variamosple/variamos-security";
import type { CookieOptions, Request, Response } from "express";
import { isAllowedOrigin } from "#src/common/allowedOrigins.js";
import { describeError } from "#src/common/describeError.js";
import logger from "#src/common/logger.js";
import { MFA_SIGN_IN_TTL_MS } from "#src/Domain/Mfa/Service/PendingMfaSignIns.js";
import { queryText } from "./queryText.js";
import type { SessionGate } from "./sessionGate.js";

/** Holds the opaque token of a sign-in waiting for the second factor. */
export const MFA_PENDING_COOKIE = "mfaPending";

/**
 * Holds the identifier of the session opened at sign-in (EV-74 lot 2). It is
 * 256 random bits and the registry keeps its hash only: signing it would add
 * nothing, and would make COOKIE_SECRET required.
 */
export const SESSION_ID_COOKIE = "adminSession";

/** The session identifier a request carries. */
export const sessionIdOf = (req: Request): string | undefined =>
  queryText(req.cookies?.[SESSION_ID_COOKIE]);

/** Holds the token of a browser where the code is not asked (lot 6). */
export const MFA_TRUSTED_COOKIE = "mfaTrustedDevice";

// A page to go back to after sign-in: a web address of an allowed site.
// A javascript: or data: address has the origin "null"; given to the
// browser, a javascript: one would run its script on the sign-in site.
export const isAllowedRedirect = (redirect: URL): boolean =>
  (redirect.protocol === "http:" || redirect.protocol === "https:") &&
  isAllowedOrigin(redirect.origin);

/**
 * What the authentication routes read from the configuration (EV-05): the
 * options of the session cookie, the pages of VariaMosAdmin they send the
 * browser to, and the Google client. Built once by the composition root;
 * the helpers read it at each call.
 */
export interface AuthWebSettings {
  cookie: {
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    /** Lifetime of the session cookie, in milliseconds. */
    maxAge: number;
  };
  loginRedirectUri: string | undefined;
  homeRedirectUri: string | undefined;
  googleClientId: string | undefined;
}

export interface CookieOptionsInput {
  domain?: string;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
  maxAge?: boolean;
}

const getUrl = (transactionId: string, url?: string): URL | undefined => {
  if (!url) {
    return undefined;
  }

  try {
    const redirect = new URL(url);

    return isAllowedRedirect(redirect) ? redirect : undefined;
  } catch (error) {
    // The query string or fragment may carry a token: never log them
    const urlWithoutQuery = url.split(/[?#]/)[0]?.slice(0, 200);
    logger.err(`${transactionId} Invalid URL: ${urlWithoutQuery}`);
    logger.err(describeError(error));
  }

  return undefined;
};

export const trustedDeviceToken = (req: Request): string | undefined => {
  return queryText(req.cookies?.[MFA_TRUSTED_COOKIE]);
};

/** The helpers given to the routes when the router is created. */
export function createAuthWeb(web: AuthWebSettings, sessions: SessionGate) {
  const cookieOptions = (options: CookieOptionsInput = {}): CookieOptions => {
    const sameSite = options.sameSite ?? "strict";
    return {
      domain: options.domain ?? web.cookie.domain,
      path: web.cookie.path,
      sameSite,
      httpOnly: options.httpOnly ?? web.cookie.httpOnly,
      secure: sameSite === "none" ? true : web.cookie.secure,
      maxAge: (options.maxAge ?? true) ? web.cookie.maxAge : undefined,
    };
  };

  const mfaPendingCookieOptions = (): CookieOptions => ({
    ...cookieOptions({ maxAge: false }),
    maxAge: MFA_SIGN_IN_TTL_MS,
  });

  // Google posts its callback from its own site: only SameSite=None comes
  // back with it. The token alone opens nothing, it only spares the code
  // after a right password or Google credential.
  const mfaTrustedCookieOptions = (maxAgeMs: number): CookieOptions => ({
    ...cookieOptions({ sameSite: "none", maxAge: false }),
    maxAge: maxAgeMs,
  });

  /** The page to go back to, kept in a cookie before sign-in. */
  const redirectUrl = (
    transactionId: string,
    req: Request,
    res: Response,
    remove = true,
  ): URL | undefined => {
    const redirect = queryText(req.cookies.redirectTo);

    if (!redirect) {
      return undefined;
    }

    if (remove) {
      res.clearCookie(
        "redirectTo",
        cookieOptions({ sameSite: "none", maxAge: false }),
      );
    }

    return getUrl(transactionId, redirect);
  };

  /**
   * Registers a session for the account and puts its identifier in a second
   * cookie, beside the token (EV-74 lot 2). The token alone no longer opens
   * the administration, nor is it refreshed.
   */
  const startSession = async (res: Response, userId: string) => {
    const id = await sessions.open(userId);
    res.cookie(SESSION_ID_COOKIE, id, cookieOptions());
  };

  /** Creates the session cookies; gives the address to go to. */
  const openSession = async (
    transactionId: string,
    req: Request,
    res: Response,
    sessionUser: SessionUser,
  ): Promise<string> => {
    const redirect = redirectUrl(transactionId, req, res);

    const token = await createJwt(
      sessionUser,
      redirect?.hostname || web.cookie.domain,
    );

    // The token stays in the cookie: never in an address, which ends up in
    // the history, the server logs and the Referer header (EV-75)
    res.cookie("authToken", token, cookieOptions());
    await startSession(res, sessionUser.id);

    return redirect ? redirect.toString() : `${web.homeRedirectUri}`;
  };

  return {
    web,
    cookieOptions,
    mfaPendingCookieOptions,
    mfaTrustedCookieOptions,
    redirectUrl,
    startSession,
    openSession,
  };
}

/** What the routes use from createAuthWeb. */
export type AuthWeb = ReturnType<typeof createAuthWeb>;
