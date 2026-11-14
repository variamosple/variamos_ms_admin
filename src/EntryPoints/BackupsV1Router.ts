import { hasPermissions } from "@variamosple/variamos-security";
import { Router } from "express";
import type { BackupAlerts } from "#src/Domain/Backup/UseCase/BackupAlerts.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { sendError } from "./errorResponse.js";

export const BACKUPS_V1_ROUTE = "/v1/backups";

/** Null when the service has no backup status file (local, CI). */
export type BackupReports = Pick<BackupAlerts, "report"> | null;

/** The state of the nightly database backup, for the monitoring page. */
export function createBackupsRouter(backups: BackupReports): Router {
  const router = Router();
  router.get(
    "/status",
    hasPermissions(["micro-services::query"]),
    async (_req, res) => {
      const transactionId = "queryBackupStatus";
      try {
        const report = backups ? await backups.report() : null;
        res.json(
          new ResponseModel(transactionId).withResponse({
            configured: backups !== null,
            status: report?.status ?? null,
            problems: report?.problems ?? [],
          }),
        );
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );
  return router;
}
