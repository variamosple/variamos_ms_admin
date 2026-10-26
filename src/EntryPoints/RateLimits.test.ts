import express, { Router } from "express";
import logger from "jet-logger";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import type { IAccessJournal } from "#src/Domain/Activity/IAccessJournal.js";
import { AccountLockoutPolicy } from "#src/Domain/User/Entity/AccountLockoutPolicy.js";
import { AccountLockout } from "#src/Domain/User/Service/AccountLockoutService.js";
import { applyRateLimits, RATE_LIMITS } from "./RateLimits.js";

const MAX_ATTEMPTS = AccountLockoutPolicy.DEFAULT.maxAttempts;

/** The app answers each route with the status chosen by the test. */
function createApp(
  status: { value: number },
  lockout?: AccountLockout,
  journal?: IAccessJournal,
) {
  const app = express();
  app.set("trust proxy", "loopback, linklocal, uniquelocal");
  app.use(express.json());
  const router = Router();
  applyRateLimits(router, lockout, journal);
  router.post(/.*/, (_req, res) => {
    res.status(status.value).json({});
  });
  app.use(router);
  return app;
}

const from = (address: string) => ({ "X-Forwarded-For": address });

async function send(
  app: express.Express,
  path: string,
  times: number,
  body: object = {},
  address = "203.0.113.1",
) {
  let last: supertest.Response | undefined;
  for (let i = 0; i < times; i++) {
    last = await supertest(app).post(path).set(from(address)).send(body);
  }
  return last as supertest.Response;
}

describe("rate limits", () => {
  it("refuses sign-in failures beyond the account limit, from any address", async () => {
    const app = createApp({ value: 400 });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await send(
        app,
        "/auth/sign-in",
        1,
        { email: "Ana@Example.com", password: "x" },
        `203.0.113.${i + 1}`,
      );
    }

    const refused = await send(
      app,
      "/auth/sign-in",
      1,
      { email: " ana@example.com ", password: "x" },
      "198.51.100.7",
    );

    expect(refused.status).toBe(429);
    expect(refused.headers["retry-after"]).toBeDefined();
    expect(refused.body).toMatchObject({
      transactionId: "signIn",
      errorCode: "TOO_MANY_REQUESTS",
      message: "Too many attempts. Please try again later.",
    });

    const otherAccount = await send(app, "/auth/sign-in", 1, {
      email: "bob@example.com",
    });
    expect(otherAccount.status).toBe(400);
  });

  it("does not count successful sign-ins", async () => {
    const app = createApp({ value: 200 });

    const last = await send(app, "/auth/sign-in", MAX_ATTEMPTS + 5, {
      email: "ana@example.com",
    });

    expect(last.status).toBe(200);
  });

  it("limits sign-in failures per address across accounts", async () => {
    const app = createApp({ value: 400 });
    const { limit } = RATE_LIMITS.signInPerAddress;
    for (let i = 0; i < limit; i++) {
      await send(app, "/auth/sign-in", 1, { email: `user${i}@example.com` });
    }

    const refused = await send(app, "/auth/sign-in", 1, {
      email: "new@example.com",
    });
    const otherAddress = await send(
      app,
      "/auth/sign-in",
      1,
      { email: "new@example.com" },
      "198.51.100.7",
    );

    expect(refused.status).toBe(429);
    expect(otherAddress.status).toBe(400);
  });

  it("limits recovery e-mails per address e-mail", async () => {
    const app = createApp({ value: 200 });
    const { limit } = RATE_LIMITS.forgotPasswordPerEmail;
    const body = { email: "ana@example.com" };

    expect((await send(app, "/auth/forgot-password", limit, body)).status).toBe(
      200,
    );
    expect((await send(app, "/auth/forgot-password", 1, body)).status).toBe(
      429,
    );
  });

  it("limits sign-ups per address e-mail, from any address", async () => {
    const app = createApp({ value: 200 });
    const { limit } = RATE_LIMITS.signUpPerEmail;
    const body = { email: "Ana@Example.com" };

    expect((await send(app, "/auth/sign-up", limit, body)).status).toBe(200);
    expect(
      (
        await send(
          app,
          "/auth/sign-up",
          1,
          { email: "ana@example.com" },
          "198.51.100.7",
        )
      ).status,
    ).toBe(429);
  });

  it("limits sign-ups per address, whatever the e-mail", async () => {
    const app = createApp({ value: 200 });
    const { limit } = RATE_LIMITS.signUpPerAddress;
    const signUp = (n: number, address = "203.0.113.1") =>
      supertest(app)
        .post("/auth/sign-up")
        .set(from(address))
        .send({ email: `student${n}@example.com` });

    for (let n = 0; n < limit; n++) {
      expect((await signUp(n)).status).toBe(200);
    }
    expect((await signUp(limit)).status).toBe(429);
    expect((await signUp(limit, "198.51.100.7")).status).toBe(200);
  });

  it.each([
    ["/auth/reset-password", RATE_LIMITS.resetPasswordPerAddress.limit],
    ["/auth/guest/sign-in", RATE_LIMITS.guestSignInPerAddress.limit],
    ["/bugs", RATE_LIMITS.bugReportPerAddress.limit],
  ])("limits %s per address", async (path, limit) => {
    const app = createApp({ value: 200 });

    expect((await send(app, path, limit)).status).toBe(200);
    expect((await send(app, path, 1)).status).toBe(429);
    expect((await send(app, path, 1, {}, "198.51.100.7")).status).toBe(200);
  });

  it("ignores an address forged by the client in X-Forwarded-For", async () => {
    const app = createApp({ value: 200 });
    const { limit } = RATE_LIMITS.guestSignInPerAddress;
    await send(app, "/auth/guest/sign-in", limit);

    // nginx appends the real address after the forged one
    const forged = await send(
      app,
      "/auth/guest/sign-in",
      1,
      {},
      "198.51.100.99, 203.0.113.1",
    );

    expect(forged.status).toBe(429);
  });

  it("leaves other routes alone", async () => {
    const app = createApp({ value: 200 });

    expect((await send(app, "/auth/logout", 50)).status).toBe(200);
  });

  describe("account lockout", () => {
    const signIn = (app: express.Express, email = "ana@example.com") =>
      send(app, "/auth/sign-in", 1, { email, password: "x" });

    const lockoutOf = (maxAttempts: number, durationMinutes: number) =>
      new AccountLockout({
        getPolicy: async () =>
          AccountLockoutPolicy.fromConfiguration({
            maxAttempts,
            durationMinutes,
          }),
      });

    beforeEach(() => {
      vi.spyOn(logger, "warn").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it("follows the configured attempts and duration", async () => {
      const status = { value: 401 };
      const app = createApp(status, lockoutOf(3, 20));
      for (let i = 0; i < 3; i++) {
        expect((await signIn(app)).status).toBe(401);
      }

      const refused = await signIn(app);

      expect(refused.status).toBe(429);
      expect(Number(refused.headers["retry-after"])).toBeGreaterThan(19 * 60);
      expect(Number(refused.headers["retry-after"])).toBeLessThanOrEqual(
        20 * 60,
      );
    });

    it("records the lock and each refused attempt in the access journal", async () => {
      const journal = mock<IAccessJournal>();
      journal.accountByEmail.mockResolvedValue({ id: "user-1", active: true });
      const app = createApp({ value: 401 }, lockoutOf(3, 15), journal);
      for (let i = 0; i < 3; i++) await signIn(app);

      await vi.waitFor(() =>
        expect(journal.record).toHaveBeenCalledWith(
          expect.objectContaining({
            event: "account.locked",
            reason: "too_many_failures",
            userId: "user-1",
            ip: "203.0.113.1",
          }),
        ),
      );

      expect((await signIn(app)).status).toBe(429);
      await vi.waitFor(() =>
        expect(journal.record).toHaveBeenCalledWith(
          expect.objectContaining({
            event: "sign-in",
            outcome: "failed",
            reason: "locked",
            userId: "user-1",
            statusCode: 429,
          }),
        ),
      );
      // The typed e-mail is only used to find the account
      expect(JSON.stringify(journal.record.mock.calls)).not.toContain(
        "ana@example.com",
      );
    });

    it("refuses a locked account even with the right password", async () => {
      const status = { value: 401 };
      const app = createApp(status, lockoutOf(3, 15));
      for (let i = 0; i < 3; i++) await signIn(app);

      status.value = 200;

      expect((await signIn(app)).status).toBe(429);
    });

    it("clears the count after a successful sign-in", async () => {
      const status = { value: 401 };
      const app = createApp(status, lockoutOf(3, 15));
      await signIn(app);
      await signIn(app);
      status.value = 200;
      await signIn(app);
      status.value = 401;

      await signIn(app);
      await signIn(app);

      expect((await signIn(app)).status).toBe(401);
      expect((await signIn(app)).status).toBe(429);
    });

    it("does not count server errors", async () => {
      const status = { value: 500 };
      const app = createApp(status, lockoutOf(3, 15));
      for (let i = 0; i < 5; i++) await signIn(app);

      status.value = 401;

      expect((await signIn(app)).status).toBe(401);
    });

    it("logs the lock without the address in clear", async () => {
      const app = createApp({ value: 401 }, lockoutOf(3, 15));
      for (let i = 0; i < 3; i++) await signIn(app, "ana@example.com");

      const logged = vi.mocked(logger.warn).mock.calls.flat().join("\n");
      expect(logged).toContain(
        "[LOCKOUT] a***@example.com locked for 15 min after 3 failed sign-ins",
      );
      expect(logged).not.toContain("ana@example.com");
    });
  });
});
