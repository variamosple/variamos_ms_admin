import type { NextFunction, Request, Response } from "express";
import { RouteError } from "#src/common/classes.js";
import { describeError } from "#src/common/describeError.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import logger from "#src/common/logger.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { INTERNAL_ERROR_MESSAGE } from "#src/Domain/Core/Error/InternalErrorMessage.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";

export { INTERNAL_ERROR_MESSAGE };

const codeOfStatus = (status: number): DomainErrorCodes => {
  switch (status) {
    case HttpStatusCodes.UNAUTHORIZED:
      return DomainErrorCodes.UNAUTHORIZED_ACCESS;
    case HttpStatusCodes.FORBIDDEN:
      return DomainErrorCodes.FORBIDDEN;
    case HttpStatusCodes.NOT_FOUND:
      return DomainErrorCodes.ENTITY_NOT_FOUND;
    case HttpStatusCodes.TOO_MANY_REQUESTS:
      return DomainErrorCodes.TOO_MANY_REQUESTS;
    default:
      return status < 500
        ? DomainErrorCodes.INVALID_INPUT
        : DomainErrorCodes.SYSTEM_ERROR;
  }
};

// Errors raised by Express middleware (body parser): their message is
// technical, so each status gets its own plain one
const requestErrorMessage = (status: number) =>
  status === HttpStatusCodes.PAYLOAD_TOO_LARGE
    ? "The request is too large."
    : "The request could not be read.";

/**
 * Status and body for an error caught on a route: the message of a
 * DomainError or a RouteError, a generic one for anything else.
 */
export function errorResponse(
  error: unknown,
  transactionId?: string,
): { status: number; body: ResponseModel<never> } {
  const body = new ResponseModel<never>(transactionId);
  if (error instanceof DomainError) {
    body.withError(error.code, error.message);
    return { status: mapDomainErrorToHttpStatus(error.code), body };
  }
  if (error instanceof RouteError) {
    body.withError(codeOfStatus(error.status), error.message);
    return { status: error.status, body };
  }
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    body.withError(codeOfStatus(status), requestErrorMessage(status));
    return { status, body };
  }
  body.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
  return { status: HttpStatusCodes.INTERNAL_SERVER_ERROR, body };
}

/** Logs an unexpected error and answers with its safe response. */
export function sendError(
  res: Response,
  error: unknown,
  transactionId?: string,
): Response {
  if (!(error instanceof DomainError)) {
    logger.err(describeError(error));
  }
  const { status, body } = errorResponse(error, transactionId);
  return res.status(status).json(body);
}

/**
 * Last safeguard: a server error never sends its own message, whatever
 * route or layer built it (SQL text, stack, internal path).
 */
export function hideInternalErrorMessages(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      (res.statusCode >= 500 ||
        (body as { errorCode?: unknown }).errorCode ===
          DomainErrorCodes.SYSTEM_ERROR) &&
      res.statusCode !== HttpStatusCodes.SERVICE_UNAVAILABLE
    ) {
      const safe: Record<string, unknown> = { ...body };
      if ("message" in safe) safe.message = INTERNAL_ERROR_MESSAGE;
      if ("error" in safe) safe.error = INTERNAL_ERROR_MESSAGE;
      return json(safe);
    }
    return json(body);
  };
  next();
}
