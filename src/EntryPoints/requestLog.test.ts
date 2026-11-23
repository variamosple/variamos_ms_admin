import express, { Router } from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { requestLog, SLOW_REQUEST_MS } from "./requestLog.js";

const logger = mock<ILogger>();

/** The admin's shape: a base router, then a router per resource. */
const app = () => {
  const bugs = Router();
  bugs.get("/", (_req, res) => {
    res.json([]);
  });
  bugs.get("/:id/assignees", (_req, res) => {
    res.json([]);
  });
  bugs.get("/:id/fail", () => {
    throw new Error("boom");
  });
  bugs.get("/:id/slow", (_req, res) => {
    vi.advanceTimersByTime(SLOW_REQUEST_MS);
    res.json({});
  });
  bugs.get("/:id/never", () => {
    // Never answers: the client gives up
  });
  const users = Router();
  users.use((_req, res) => {
    res.sendStatus(401);
  });
  const base = Router();
  base.use("/bugs", bugs);
  base.use("/users", users);
  base.get("/health", (_req, res) => {
    res.json({ status: "UP" });
  });

  const server = express();
  server.use(requestLog(logger));
  server.use("/", base);
  server.use((_req: express.Request, res: express.Response) => {
    res.sendStatus(404);
  });
  server.use(
    (
      _err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.sendStatus(500);
    },
  );
  return server;
};

const lines = (level: "info" | "warn" | "err") =>
  logger[level].mock.calls.map(([line]) => line);

describe("request log (ADM-N41)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the method, the declared route, the status and the duration", async () => {
    await supertest(app()).get("/bugs/b-41/assignees?token=secret");

    expect(lines("info")).toEqual([
      expect.stringMatching(/^HTTP GET \/bugs\/:id\/assignees 200 \d+ ms$/),
    ]);
  });

  it("never writes the identifier nor the query string", async () => {
    await supertest(app()).get("/bugs/b-41/assignees?token=secret");

    const [line] = lines("info");
    expect(line).not.toContain("b-41");
    expect(line).not.toContain("secret");
  });

  it("writes the root route of a router", async () => {
    await supertest(app()).get("/bugs");

    expect(lines("info")).toEqual([
      expect.stringMatching(/^HTTP GET \/bugs 200 /),
    ]);
  });

  it("writes a server error as an error, with its route", async () => {
    await supertest(app()).get("/bugs/b-41/fail");

    expect(lines("err")).toEqual([
      expect.stringMatching(/^HTTP GET \/bugs\/:id\/fail 500 /),
    ]);
    expect(lines("info")).toEqual([]);
  });

  it("writes a refusal before any route with the prefix of its router", async () => {
    await supertest(app()).get("/users/u-7/roles");

    expect(lines("info")).toEqual([
      expect.stringMatching(/^HTTP GET \/users\/\* 401 /),
    ]);
  });

  it("does not write the address no route answers", async () => {
    await supertest(app()).get("/wp-admin/setup.php");

    expect(lines("info")).toEqual([
      expect.stringMatching(/^HTTP GET \(no route\) 404 /),
    ]);
  });

  it("writes a slow answer as a warning", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    try {
      await supertest(app()).get("/bugs/b-41/slow");
    } finally {
      vi.useRealTimers();
    }

    expect(lines("warn")).toEqual([
      expect.stringMatching(
        new RegExp(`^HTTP GET /bugs/:id/slow 200 ${SLOW_REQUEST_MS} ms$`),
      ),
    ]);
  });

  it("writes an answer the client gave up on as a warning", async () => {
    await supertest(app())
      .get("/bugs/b-41/never")
      .timeout(50)
      .catch(() => undefined);

    await vi.waitFor(() =>
      expect(lines("warn")).toEqual([
        expect.stringMatching(/^HTTP GET \/bugs\/:id\/never aborted \d+ ms$/),
      ]),
    );
  });

  it("does not write the health checks", async () => {
    await supertest(app()).get("/health");

    expect(logger.info).not.toHaveBeenCalled();
  });
});
