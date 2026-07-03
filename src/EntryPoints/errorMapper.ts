import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import HttpStatusCodes from "@src/common/HttpStatusCodes";

export function mapDomainErrorToHttpStatus(errorCode?: DomainErrorCodes | number | null): number {
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
    default:
      return typeof errorCode === "number" ? errorCode : HttpStatusCodes.INTERNAL_SERVER_ERROR;
  }
}
