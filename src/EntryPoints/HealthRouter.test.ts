import express from "express";
import supertest from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createHealthRouter, HEALTH_ROUTE } from "./HealthRouter.js";

// Stands for the database, without a live PostgreSQL instance
const authenticate = vi.fn<() => Promise<void>>();

describe("HealthRouter - Black-Box Contract & Resilience Tests", () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use(HEALTH_ROUTE, createHealthRouter(authenticate));
    return app;
  };

  it("should return HTTP 200 with UP status when database is reachable", async () => {
    authenticate.mockResolvedValueOnce();

    const app = buildApp();
    const response = await supertest(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("UP");
    expect(response.body.serviceName).toBe("variamos_ms_admin");
    expect(response.body.checks.database.status).toBe("UP");
    expect(typeof response.body.checks.database.latencyMs).toBe("number");
    expect(response.body.checks.memory).toBeDefined();
    expect(response.body.checks.memory.totalMb).toBeGreaterThan(0);
  });

  it("should return HTTP 503 with DEGRADED status when database authentication fails", async () => {
    authenticate.mockRejectedValueOnce(
      new Error("Database connection refused"),
    );

    const app = buildApp();
    const response = await supertest(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("DEGRADED");
    expect(response.body.checks.database.status).toBe("DOWN");
  });

  // The check after each deployment reads serviceName, status and
  // uptimeSeconds; the monitoring reads the whole contract (EV-108)
  it.each([
    ["reachable", () => authenticate.mockResolvedValueOnce()],
    [
      "unreachable",
      () => authenticate.mockRejectedValueOnce(new Error("refused")),
    ],
  ])(
    "keeps the shared /health contract when the database is %s",
    async (_case, setUp) => {
      setUp();

      const response = await supertest(buildApp()).get("/health");

      expect([200, 503]).toContain(response.status);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(response.body).toMatchObject({
        serviceName: "variamos_ms_admin",
        status: expect.stringMatching(/^(UP|DEGRADED|DOWN)$/),
        version: expect.any(String),
        timestamp: expect.any(String),
        checks: expect.any(Object),
      });
      expect(Number.isInteger(response.body.uptimeSeconds)).toBe(true);
      expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    },
  );
});
