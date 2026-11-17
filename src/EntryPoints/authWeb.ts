import { createJwt, type SessionUser } from "@variamosple/variamos-security";
import type { CookieOptions, Request, Response } from "express";
import { isAllowedOrigin } from "#src/common/allowedOrigins.js";
import { describeError } from "#src/common/describeError.js";
import { isLocalDevOrigin } from "#src/common/localDevOrigins.js";
import logger from "#src/common/logger.js";
import { MFA_SIGN_IN_TTL_MS } from "#src/Domain/Mfa/Service/PendingMfaSignIns.js";
import { queryText } from "./queryText.js";

/** Holds the opaque token of a sign-in waiting for the second factor. */
export const MFA_PENDING_COOKIE = "mfaPending";

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

/**
 * The address to go back to, with the session token when it is the page of a
 * local interface allowed by AUTH_LOCAL_DEV_ORIGINS: that page cannot read the
 * cookie of app.variamos.com. Temporary (2026-11-17).
 */
export const withLocalDevToken = (
  redirect: URL | undefined,
  token: string,
): URL | undefined => {
  if (redirect && isLocalDevOrigin(redirect.origin)) {
    redirect.searchParams.set("authToken", token);
  }
  return redirect;
};

export const trustedDeviceToken = (req: Request): string | undefined => {
  return queryText(req.cookies?.[MFA_TRUSTED_COOKIE]);
};

/** The helpers given to the routes when the router is created. */
export function createAuthWeb(web: AuthWebSettings) {
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

  /** Creates the session cookie; gives the address to go to. */
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
    // the history, the server logs and the Referer header (EV-75), except
    // for a local interface, for a while (withLocalDevToken)
    res.cookie("authToken", token, cookieOptions());
    withLocalDevToken(redirect, token);

    return redirect ? redirect.toString() : `${web.homeRedirectUri}`;
  };

  return {
    web,
    cookieOptions,
    mfaPendingCookieOptions,
    mfaTrustedCookieOptions,
    redirectUrl,
    openSession,
  };
}

/** What the routes use from createAuthWeb. */
export type AuthWeb = ReturnType<typeof createAuthWeb>;
