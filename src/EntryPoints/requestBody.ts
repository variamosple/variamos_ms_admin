import type { Request, Response } from "express";
import { z } from "zod";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";

// Sizes well above every business rule: they stop a payload that no form
// sends, the domain still gives its own message for a value it refuses
export const EMAIL_MAX = 254;
export const NAME_MAX = 255;
export const SECRET_MAX = 1024;

/**
 * Text of at most `max` characters. A missing field reads as empty text: the
 * routes and the domain already treated a missing value and "" alike, and
 * refuse it with their usual message.
 */
export const text = (max: number) => z.string().max(max).default("");

/**
 * Reads the body of a request against its schema (EV-97 lot 6). The schema
 * checks the shape only: the type and size of each field; unknown fields
 * are dropped. On a mismatch, answers 400 INVALID_INPUT naming the field,
 * never its value, and returns undefined.
 */
export function readBody<S extends z.ZodType>(
  schema: S,
  req: Request,
  res: Response,
  transactionId: string,
): z.infer<S> | undefined {
  const parsed = schema.safeParse(req.body ?? {});
  if (parsed.success) return parsed.data;

  const field = (parsed.error.issues[0]?.path ?? []).map(String).join(".");
  res
    .status(HttpStatusCodes.BAD_REQUEST)
    .json(
      new ResponseModel<never>(transactionId).withError(
        DomainErrorCodes.INVALID_INPUT,
        field ? `The field "${field}" is invalid.` : "The request is invalid.",
      ),
    );
  return undefined;
}
