import express, { Router } from "express";
import supertest from "supertest";
import { applyRateLimits, RATE_LIMITS } from "./RateLimits.js";

/** The app answers each route with the status chosen by the test. */
function createApp(status: { value: number }) {
  const app = express();
  app.set("trust proxy", "loopback, linklocal, uniquelocal");
  app.use(express.json());
  const router = Router();
  applyRateLimits(router);
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
    const { limit } = RATE_LIMITS.signInPerAccount;
    for (let i = 0; i < limit; i++) {
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

    const last = await send(
      app,
      "/auth/sign-in",
      RATE_LIMITS.signInPerAccount.limit + 5,
      { email: "ana@example.com" },
    );

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
});
