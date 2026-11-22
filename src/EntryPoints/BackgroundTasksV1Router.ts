import { hasPermissions } from "@variamosple/variamos-security";
import { Router } from "express";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { IBackgroundTaskList } from "#src/Domain/Scheduling/Entity/BackgroundTaskStatus.js";
import { sendError } from "./errorResponse.js";

export const BACKGROUND_TASKS_V1_ROUTE = "/v1/background-tasks";

/**
 * The background tasks of the service and the state of their runs since it
 * started, for the monitoring page (ADM-N34). No cause of failure: it stays
 * in the log of the service.
 */
export function createBackgroundTasksRouter(
  tasks: IBackgroundTaskList,
): Router {
  const router = Router();
  router.get("/", hasPermissions(["micro-services::query"]), (_req, res) => {
    const transactionId = "queryBackgroundTasks";
    try {
      const list = tasks.list();
      res.json(
        new ResponseModel(transactionId).withResponse(list, list.length),
      );
    } catch (error) {
      sendError(res, error, transactionId);
    }
  });
  return router;
}
