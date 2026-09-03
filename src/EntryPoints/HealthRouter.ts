import os from "node:os";
import VARIAMOS_ORM from "@src/Infrastructure/VariamosORM.js";
import { Router } from "express";

export const HEALTH_ROUTE = "/health";

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const startTime = Date.now();
    let dbStatus: "UP" | "DOWN" = "UP";
    let dbLatencyMs = 0;

    try {
      const dbStart = Date.now();
      await VARIAMOS_ORM.authenticate();
      dbLatencyMs = Date.now() - dbStart;
    } catch {
      dbStatus = "DOWN";
    }

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const checks = {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      memory: {
        usedMb: Math.round(usedMemory / (1024 * 1024)),
        totalMb: Math.round(totalMemory / (1024 * 1024)),
        percentage: Number(((usedMemory / totalMemory) * 100).toFixed(1)),
      },
    };

    const overallStatus = dbStatus === "UP" ? "UP" : "DEGRADED";

    res.status(overallStatus === "UP" ? 200 : 503).json({
      status: overallStatus,
      serviceName: "variamos_ms_admin",
      version: process.env.npm_package_version || "1.0.0",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      checks,
    });
  });

  return router;
}
