import type { Request, Response, Router } from "express";
import { ipKeyGenerator, type Options, rateLimit } from "express-rate-limit";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { AUTH_ROUTE } from "./AuthRouter.js";
import { BUG_V1_ROUTE } from "./BugRouter.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Limits of the public routes (EV-74 lot 5), in memory: the service runs as
 * a single instance. Sign-in counts failures only, so a user who signs in
 * is never slowed down.
 */
export const RATE_LIMITS = {
  signInPerAccount: { windowMs: 15 * MINUTE_MS, limit: 10 },
  signInPerAddress: { windowMs: 15 * MINUTE_MS, limit: 100 },
  forgotPasswordPerEmail: { windowMs: HOUR_MS, limit: 5 },
  forgotPasswordPerAddress: { windowMs: HOUR_MS, limit: 20 },
  resetPasswordPerAddress: { windowMs: HOUR_MS, limit: 20 },
  guestSignInPerAddress: { windowMs: HOUR_MS, limit: 300 },
  bugReportPerAddress: { windowMs: HOUR_MS, limit: 20 },
} as const;

const addressKey = (req: Request) => ipKeyGenerator(req.ip ?? "");

/** The e-mail of the body, so that one account is limited from any address. */
const emailKey = (req: Request) => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.trim() !== ""
    ? `email:${email.trim().toLowerCase()}`
    : `address:${addressKey(req)}`;
};

function limiter(
  transactionId: string,
  { windowMs, limit }: { windowMs: number; limit: number },
  options: Partial<Options> = {},
) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: addressKey,
    // RateLimit headers, and Retry-After once the limit is reached
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res
        .status(HttpStatusCodes.TOO_MANY_REQUESTS)
        .json(
          new ResponseModel<void>(transactionId).withError(
            DomainErrorCodes.TOO_MANY_REQUESTS,
            "Too many attempts. Please try again later.",
          ),
        );
    },
    ...options,
  });
}

/** Adds the limits in front of the routers; call before mounting them. */
export function applyRateLimits(router: Router): void {
  const countFailuresOnly = { skipSuccessfulRequests: true };

  router.post(
    `${AUTH_ROUTE}/sign-in`,
    limiter("signIn", RATE_LIMITS.signInPerAddress, countFailuresOnly),
    limiter("signIn", RATE_LIMITS.signInPerAccount, {
      ...countFailuresOnly,
      keyGenerator: emailKey,
    }),
  );
  router.post(
    `${AUTH_ROUTE}/forgot-password`,
    limiter("forgotPassword", RATE_LIMITS.forgotPasswordPerAddress),
    limiter("forgotPassword", RATE_LIMITS.forgotPasswordPerEmail, {
      keyGenerator: emailKey,
    }),
  );
  router.post(
    `${AUTH_ROUTE}/reset-password`,
    limiter("resetPassword", RATE_LIMITS.resetPasswordPerAddress),
  );
  router.post(
    `${AUTH_ROUTE}/guest/sign-in`,
    limiter("guestSignIn", RATE_LIMITS.guestSignInPerAddress),
  );
  router.post(
    BUG_V1_ROUTE,
    limiter("createBug", RATE_LIMITS.bugReportPerAddress),
  );
}
