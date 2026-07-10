import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import HttpStatusCodes from "@src/common/HttpStatusCodes";

export function mapDomainErrorToHttpStatus(
  errorCode?: string | number | null,
  defaultSuccessCode = HttpStatusCodes.OK,
): number {
  if (!errorCode) return defaultSuccessCode;
  switch (errorCode) {
    case DomainErrorCodes.INVALID_INPUT:
      return HttpStatusCodes.BAD_REQUEST;
    case DomainErrorCodes.ENTITY_NOT_FOUND:
      return HttpStatusCodes.NOT_FOUND;
    case DomainErrorCodes.UNAUTHORIZED_ACCESS:
      return HttpStatusCodes.UNAUTHORIZED;
    case DomainErrorCodes.SYSTEM_ERROR:
      return HttpStatusCodes.INTERNAL_SERVER_ERROR;
    case DomainErrorCodes.DUPLICATE_ENTITY:
      return HttpStatusCodes.CONFLICT;
    default:
      if (typeof errorCode === "number") return errorCode;
      if (typeof errorCode === "string") {
        const parsed = Number(errorCode);
        if (!isNaN(parsed)) return parsed;
      }
      return HttpStatusCodes.INTERNAL_SERVER_ERROR;
  }
}
