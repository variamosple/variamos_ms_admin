import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import HttpStatusCodes from "@src/common/HttpStatusCodes";

export function mapDomainErrorToHttpStatus(errorCode?: string | number | null): number {
  if (!errorCode) return HttpStatusCodes.OK;
  switch (errorCode) {
    case DomainErrorCodes.BAD_REQUEST:
      return HttpStatusCodes.BAD_REQUEST;
    case DomainErrorCodes.NOT_FOUND:
      return HttpStatusCodes.NOT_FOUND;
    case DomainErrorCodes.UNAUTHORIZED:
      return HttpStatusCodes.UNAUTHORIZED;
    case DomainErrorCodes.INTERNAL_ERROR:
      return HttpStatusCodes.INTERNAL_SERVER_ERROR;
    case DomainErrorCodes.CONFLICT:
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
