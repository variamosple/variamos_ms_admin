import type { Request, RequestHandler, Response, Router } from "express";
import { ipKeyGenerator, type Options, rateLimit } from "express-rate-limit";
import logger from "jet-logger";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { maskEmail } from "#src/common/maskEmail.js";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  AccountLockout,
  DEFAULT_ACCOUNT_LOCKOUT_POLICY_PROVIDER,
} from "#src/Domain/User/Service/AccountLockoutService.js";
import { AUTH_ROUTE } from "./AuthRouter.js";
import { recordAccess } from "./accessJournal.js";
import { BUG_V1_ROUTE } from "./BugRouter.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Limits of the public routes (EV-74 lot 5), in memory: the service runs as
 * a single instance. Sign-in counts failures only, so a user who signs in
 * is never slowed down. The limit per account is the lockout of the
 * security.lockout.* keys (AccountLockout).
 */
export const RATE_LIMITS = {
  signInPerAddress: { windowMs: 15 * MINUTE_MS, limit: 100 },
  forgotPasswordPerEmail: { windowMs: HOUR_MS, limit: 5 },
  forgotPasswordPerAddress: { windowMs: HOUR_MS, limit: 20 },
  resetPasswordPerAddress: { windowMs: HOUR_MS, limit: 20 },
  guestSignInPerAddress: { windowMs: HOUR_MS, limit: 300 },
  bugReportPerAddress: { windowMs: HOUR_MS, limit: 20 },
  mfaFailuresPerAccount: { windowMs: 15 * MINUTE_MS, limit: 5 },
  signInMfaPerAddress: { windowMs: 15 * MINUTE_MS, limit: 50 },
} as const;

const addressKey = (req: Request) => ipKeyGenerator(req.ip ?? "");

/** The e-mail of the body, trimmed and lowercased, or null when absent. */
const bodyEmail = (req: Request): string | null => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.trim() !== ""
    ? email.trim().toLowerCase()
    : null;
};

/** The e-mail of the body, so that one account is limited from any address. */
const emailKey = (req: Request) => {
  const email = bodyEmail(req);
  return email ? `email:${email}` : `address:${addressKey(req)}`;
};

const tooManyAttempts = (transactionId: string, res: Response) =>
  res
    .status(HttpStatusCodes.TOO_MANY_REQUESTS)
    .json(
      new ResponseModel<void>(transactionId).withError(
        DomainErrorCodes.TOO_MANY_REQUESTS,
        "Too many attempts. Please try again later.",
      ),
    );

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
      tooManyAttempts(transactionId, res);
    },
    ...options,
  });
}

/**
 * Refuses a locked account before its password is checked, with the same
 * answer as the other limits. A 4xx answer counts as a failure, a 2xx or
 * 3xx clears the count; a 5xx or an unfinished answer is not counted.
 */
function accountLockoutGuard(
  lockout: AccountLockout,
  journal?: IAccessJournal,
): RequestHandler {
  return async (req, res, next) => {
    const email = bodyEmail(req);
    if (!email) {
      next();
      return;
    }
    const admission = await lockout.admit(email);
    if (admission.locked) {
      if (journal) {
        recordAccess(journal, req, res, {
          event: "sign-in",
          outcome: "failed",
          reason: "locked",
          userId: (await journal.accountByEmail(email))?.id,
        });
      }
      res.set("Retry-After", String(Math.ceil(admission.retryAfterMs / 1000)));
      tooManyAttempts("signIn", res);
      return;
    }
    const { attempt } = admission;
    res.on("close", () => {
      if (!res.writableFinished || res.statusCode >= 500) {
        attempt.abandoned();
      } else if (res.statusCode < 400) {
        attempt.succeeded();
      } else {
        const lock = attempt.failed();
        if (lock) {
          logger.warn(
            `[LOCKOUT] ${maskEmail(email)} locked for ${lock.durationMinutes} min after ${lock.attempts} failed sign-ins`,
          );
          if (journal) void recordLock(journal, req, email);
        }
      }
    });
    next();
  };
}

// The lock itself, once the answer that caused it is sent (T-24)
async function recordLock(
  journal: IAccessJournal,
  req: Request,
  email: string,
): Promise<void> {
  const account = await journal.accountByEmail(email);
  await journal.record({
    event: "account.locked",
    outcome: "failed",
    reason: "too_many_failures",
    userId: account?.id ?? null,
    ip: req.ip ?? null,
    method: req.method,
    path: req.originalUrl.split("?")[0],
    statusCode: null,
  });
}

/**
 * Wrong passwords and codes on the two-factor routes, per signed-in account
 * (SPC-2026-10-17-001). Place it after the session check; one instance
 * shared by the routes keeps one count.
 */
export function mfaFailureLimiter(): RequestHandler {
  return limiter("mfa", RATE_LIMITS.mfaFailuresPerAccount, {
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request) => {
      const id = (req.user as { id?: unknown } | null | undefined)?.id;
      return id ? `user:${String(id)}` : `address:${addressKey(req)}`;
    },
  });
}

/** Adds the limits in front of the routers; call before mounting them. */
export function applyRateLimits(
  router: Router,
  lockout = new AccountLockout(DEFAULT_ACCOUNT_LOCKOUT_POLICY_PROVIDER),
  accessJournal?: IAccessJournal,
): void {
  const countFailuresOnly = { skipSuccessfulRequests: true };

  router.post(
    `${AUTH_ROUTE}/sign-in`,
    limiter("signIn", RATE_LIMITS.signInPerAddress, countFailuresOnly),
    accountLockoutGuard(lockout, accessJournal),
  );
  // The code after the password; limited per account in MfaSignInUseCase
  router.post(
    `${AUTH_ROUTE}/sign-in/mfa`,
    limiter("signInMfa", RATE_LIMITS.signInMfaPerAddress, countFailuresOnly),
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
