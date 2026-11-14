import { createJwt, type SessionUser } from "@variamosple/variamos-security";
import type { CookieOptions, Request, Response } from "express";
import { isAllowedOrigin } from "#src/common/allowedOrigins.js";
import { describeError } from "#src/common/describeError.js";
import EnvVars from "#src/common/EnvVars.js";
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

export const getRedirectUrl = (
  transactionId: string,
  req: Request,
  res: Response,
  remove = true,
): URL | undefined => {
  const redirectUrl = queryText(req.cookies.redirectTo);

  if (!redirectUrl) {
    return undefined;
  }

  if (remove) {
    res.clearCookie(
      "redirectTo",
      getCookieOptions({ sameSite: "none", maxAge: false }),
    );
  }

  return getUrl(transactionId, redirectUrl);
};

export const getUrl = (
  transactionId: string,
  url?: string,
): URL | undefined => {
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

export interface CookieOptionsInput {
  domain?: string;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
  maxAge?: boolean;
}

export const getCookieOptions = (
  options: CookieOptionsInput = {},
): CookieOptions => {
  const domain = options.domain ?? EnvVars.CookieProps.Options.domain;
  const httpOnly = options.httpOnly ?? EnvVars.CookieProps.Options.httpOnly;
  const sameSite = options.sameSite ?? "strict";
  const maxAge = options.maxAge ?? true;

  const cookieOptions: CookieOptions = {
    domain,
    path: EnvVars.CookieProps.Options.path,
    sameSite,
    httpOnly,
    secure: sameSite === "none" ? true : EnvVars.CookieProps.Options.secure,
    maxAge: maxAge ? EnvVars.CookieProps.Options.maxAge : undefined,
  };

  return cookieOptions;
};

export const mfaPendingCookieOptions = (): CookieOptions => ({
  ...getCookieOptions({ maxAge: false }),
  maxAge: MFA_SIGN_IN_TTL_MS,
});

// Google posts its callback from its own site: only SameSite=None comes
// back with it. The token alone opens nothing, it only spares the code
// after a right password or Google credential.
export const mfaTrustedCookieOptions = (maxAgeMs: number): CookieOptions => ({
  ...getCookieOptions({ sameSite: "none", maxAge: false }),
  maxAge: maxAgeMs,
});

export const trustedDeviceToken = (req: Request): string | undefined => {
  return queryText(req.cookies?.[MFA_TRUSTED_COOKIE]);
};

/**
 * The helpers that depend on the home address, read once when the router
 * is created.
 */
export function createAuthWeb() {
  const HOME_URL = new URL(
    EnvVars.Auth.APP.HOME_REDIRECT_URI || "http://localhost:3000",
  );

  const HOME_URL_HOST_REGEX = new RegExp(`^${HOME_URL.hostname}$`);

  const isExternalDomain = (host?: string): boolean =>
    host !== undefined && host !== "" && !HOME_URL_HOST_REGEX.test(host);

  /** Creates the session cookie; gives the address to go to. */
  const openSession = async (
    transactionId: string,
    req: Request,
    res: Response,
    sessionUser: SessionUser,
  ): Promise<string> => {
    const redirect = getRedirectUrl(transactionId, req, res);

    const token = await createJwt(
      sessionUser,
      redirect?.hostname || EnvVars.CookieProps.Options.domain,
    );

    // The token stays in the cookie: never in an address, which ends up in
    // the history, the server logs and the Referer header (EV-75)
    res.cookie("authToken", token, getCookieOptions());

    return redirect
      ? redirect.toString()
      : `${EnvVars.Auth.APP.HOME_REDIRECT_URI}`;
  };

  return { isExternalDomain, openSession };
}

/** What the routes use from createAuthWeb. */
export type AuthWeb = ReturnType<typeof createAuthWeb>;
