import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, type Response, Router } from "express";
import {
  announcementOf,
  type ConfigurationAnnouncement,
  cancellationOf,
} from "#src/Domain/Configuration/Entity/AnnouncedConfigurationKeys.js";
import type { ConfigurationValue } from "#src/Domain/Configuration/Entity/Configuration.js";
import type {
  ScheduledChangeStatus,
  ScheduledConfigurationChange,
} from "#src/Domain/Configuration/Entity/ScheduledConfigurationChange.js";
import type { ScheduledConfigurationChangeUseCase } from "#src/Domain/Configuration/UseCase/ScheduledConfigurationChangeUseCase.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { scheduledChangeBody } from "./adminRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { readBody } from "./requestBody.js";

export const SCHEDULED_CHANGES_V1_ROUTE =
  "/v1/configurations/scheduled-changes";

interface ScheduledChangeResponseDto {
  id: number;
  key: string;
  previousValue: ConfigurationValue;
  newValue: ConfigurationValue;
  dueAt: string;
  status: ScheduledChangeStatus;
  reason: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** What to tell users after this answer, for the interface to offer. */
  announcement?: ConfigurationAnnouncement;
}

const toResponse = (
  change: ScheduledConfigurationChange,
  announcement?: ConfigurationAnnouncement | null,
): ScheduledChangeResponseDto => ({
  id: change.id,
  key: change.key,
  previousValue: change.previousValue,
  newValue: change.newValue,
  dueAt: change.dueAt.toISOString(),
  status: change.status,
  reason: change.reason,
  createdBy: change.createdBy,
  updatedBy: change.updatedBy,
  createdAt: change.createdAt.toISOString(),
  updatedAt: change.updatedAt.toISOString(),
  resolvedAt: change.resolvedAt?.toISOString() ?? null,
  ...(announcement ? { announcement } : {}),
});

// The dated announcement of a planned change
const planned = (change: ScheduledConfigurationChange) =>
  toResponse(change, announcementOf(change.key, change.newValue, change.dueAt));

const operatorOf = (req: Request) => req.user?.id || "system";

const ID = /^\d{1,9}$/;

const send = (
  res: Response,
  response: ResponseModel<ScheduledConfigurationChange>,
  toDto: (change: ScheduledConfigurationChange) => ScheduledChangeResponseDto,
) => {
  const answer = new ResponseModel<ScheduledChangeResponseDto>(
    response.transactionId,
    {
      errorCode: response.errorCode,
      message: response.message,
    },
  );
  if (response.data) answer.data = toDto(response.data);
  res.status(mapDomainErrorToHttpStatus(answer.errorCode)).json(answer);
};

const badId = (res: Response, transactionId: string) =>
  res
    .status(mapDomainErrorToHttpStatus(DomainErrorCodes.INVALID_INPUT))
    .json(
      new ResponseModel<never>(transactionId).withError(
        DomainErrorCodes.INVALID_INPUT,
        "The id of the planned change is invalid.",
      ),
    );

/**
 * Changes of the settings users notice planned for a later date (EV-115
 * lot B). Planning is a change of the setting: same permission.
 */
export function createScheduledConfigurationChangeRouter(
  useCase: ScheduledConfigurationChangeUseCase,
): Router {
  const router = Router();

  router.get(
    "/",
    hasPermissions(["configurations::query"]),
    async (_req: Request, res) => {
      const transactionId = "queryScheduledConfigurationChanges";
      try {
        const response = await useCase.list(transactionId);
        const answer = new ResponseModel<ScheduledChangeResponseDto[]>(
          transactionId,
        ).withResponse((response.data ?? []).map((c) => toResponse(c)));
        res.status(200).json(answer);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.post(
    "/",
    hasPermissions(["configurations::update"]),
    async (req: Request, res) => {
      const transactionId = "scheduleConfigurationChange";
      const body = readBody(scheduledChangeBody, req, res, transactionId);
      if (!body) return;
      try {
        const response = await useCase.schedule(
          new RequestModel(transactionId, {
            key: body.key ?? "",
            value: body.value,
            dueAt: body.dueAt ?? "",
            operatorId: operatorOf(req),
          }),
        );
        send(res, response, planned);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.put(
    "/:id",
    hasPermissions(["configurations::update"]),
    async (req: Request<{ id: string }>, res) => {
      const transactionId = "rescheduleConfigurationChange";
      if (!ID.test(req.params.id)) {
        badId(res, transactionId);
        return;
      }
      const body = readBody(scheduledChangeBody, req, res, transactionId);
      if (!body) return;
      try {
        const response = await useCase.reschedule(
          new RequestModel(transactionId, {
            id: Number(req.params.id),
            value: body.value,
            dueAt: body.dueAt ?? "",
            operatorId: operatorOf(req),
          }),
        );
        send(res, response, planned);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  router.post(
    "/:id/cancel",
    hasPermissions(["configurations::update"]),
    async (req: Request<{ id: string }>, res) => {
      const transactionId = "cancelConfigurationChange";
      if (!ID.test(req.params.id)) {
        badId(res, transactionId);
        return;
      }
      try {
        const response = await useCase.cancel(
          new RequestModel(transactionId, {
            id: Number(req.params.id),
            operatorId: operatorOf(req),
          }),
        );
        // The correction of an announcement users may have received
        send(res, response, (change) =>
          toResponse(change, cancellationOf(change.key, change.dueAt)),
        );
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  return router;
}
