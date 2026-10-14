import express from "express";
import supertest from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createHealthRouter, HEALTH_ROUTE } from "./HealthRouter.js";

// Mock VARIAMOS_ORM to test behavior without requiring a live PostgreSQL instance
vi.mock("@src/Infrastructure/VariamosORM.js", () => ({
  default: {
    authenticate: vi.fn(),
  },
  DB_SCHEMA: "public",
}));

import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM.js";

describe("HealthRouter - Black-Box Contract & Resilience Tests", () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use(HEALTH_ROUTE, createHealthRouter());
    return app;
  };

  it("should return HTTP 200 with UP status when database is reachable", async () => {
    vi.mocked(VARIAMOS_ORM.authenticate).mockResolvedValueOnce();

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
    vi.mocked(VARIAMOS_ORM.authenticate).mockRejectedValueOnce(
      new Error("Database connection refused"),
    );

    const app = buildApp();
    const response = await supertest(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("DEGRADED");
    expect(response.body.checks.database.status).toBe("DOWN");
  });
});
