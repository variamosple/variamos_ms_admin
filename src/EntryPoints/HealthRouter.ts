import os from "node:os";
import { Router } from "express";
import type { SessionSigningCheck } from "./sessionSigningCheck.js";

export const HEALTH_ROUTE = "/health";

/** Resolves when the database answers; the router bounds it to 1.5 s. */
type DatabaseCheck = () => Promise<void>;

/** What GET /health checks besides the process itself. */
export interface HealthChecks {
  database: DatabaseCheck;
  sessionSigning: SessionSigningCheck;
}

/**
 * The service is UP only when its database answers and it can still sign
 * and verify a session token; otherwise it is DEGRADED (503), which the
 * check after a deployment refuses (ADM-N01).
 */
export function createHealthRouter(
  checks: HealthChecks,
  version: () => string,
): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const startTime = Date.now();
    let dbStatus: "UP" | "DOWN" = "UP";
    let dbLatencyMs = 0;

    try {
      const dbStart = Date.now();
      await Promise.race([
        checks.database(),
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error("DB check timeout")), 1500);
        }),
      ]);
      dbLatencyMs = Date.now() - dbStart;
    } catch {
      dbStatus = "DOWN";
    }

    // The reason stays in the log of the start: /health is public
    const signingStatus: "UP" | "DOWN" = (await checks.sessionSigning()).ok
      ? "UP"
      : "DOWN";

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const results = {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      sessionSigning: {
        status: signingStatus,
      },
      memory: {
        usedMb: Math.round(usedMemory / (1024 * 1024)),
        totalMb: Math.round(totalMemory / (1024 * 1024)),
        percentage: Number(((usedMemory / totalMemory) * 100).toFixed(1)),
      },
    };

    const overallStatus =
      dbStatus === "UP" && signingStatus === "UP" ? "UP" : "DEGRADED";

    res.status(overallStatus === "UP" ? 200 : 503).json({
      status: overallStatus,
      serviceName: "variamos_ms_admin",
      version: version(),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      checks: results,
    });
  });

  return router;
}
