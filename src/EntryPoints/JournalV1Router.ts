import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import type {
  JournalQueryInput,
  JournalQueryUseCase,
} from "#src/Domain/Activity/JournalQueryUseCase.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";

export const ACTIVITY_LOGS_V1_ROUTE = "/v1/activity-logs";
export const ACCESS_LOGS_V1_ROUTE = "/v1/access-logs";

// One permission for both journals (T-24 lot 3, decision of 2026-10-23)
const JOURNAL_PERMISSION = "activity-logs::query";

function journalRouter(
  transactionId: string,
  query: (
    request: RequestModel<JournalQueryInput>,
  ) => Promise<ResponseModel<unknown>>,
): Router {
  const router = Router();
  router.get(
    "/",
    hasPermissions([JOURNAL_PERMISSION]),
    async (req: Request, res) => {
      try {
        const response = await query(
          new RequestModel<JournalQueryInput>(
            transactionId,
            req.query as JournalQueryInput,
          ),
        );
        res
          .status(mapDomainErrorToHttpStatus(response.errorCode))
          .json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );
  return router;
}

/** Read-only pages of the activity journal. */
export const createActivityLogsRouter = (useCase: JournalQueryUseCase) =>
  journalRouter("queryActivityLogs", (request) =>
    useCase.queryActivity(request),
  );

/** Read-only pages of the access journal. */
export const createAccessLogsRouter = (useCase: JournalQueryUseCase) =>
  journalRouter("queryAccessLogs", (request) => useCase.queryAccess(request));
