import type { DomainErrorCodes } from "../Error/DomainErrorCodes.js";
import type { Nullable } from "./Nullable.js";

/** The outcome of a request, besides its transaction id. */
export interface ResponseModelFields<Type> {
  errorCode?: DomainErrorCodes;
  message?: string;
  totalCount?: number;
  data?: Nullable<Type>;
}

export class ResponseModel<Type> {
  public errorCode?: DomainErrorCodes;
  public message?: string;
  public totalCount?: number;
  public data?: Nullable<Type>;

  public constructor(
    public transactionId?: string,
    fields: ResponseModelFields<Type> = {},
  ) {
    const { errorCode, message, totalCount, data } = fields;
    this.errorCode = errorCode;
    this.message = message;
    this.totalCount = totalCount;
    this.data = data;
  }

  public withResponse(data: Nullable<Type>, totalCount?: number): this {
    this.data = data;
    this.totalCount = totalCount;

    return this;
  }

  public withResponsePromise(
    data: Nullable<Type>,
    totalCount?: number,
  ): Promise<this> {
    this.data = data;
    this.totalCount = totalCount;

    return Promise.resolve(this);
  }

  public withError(errorCode: DomainErrorCodes, errorMessage: string): this {
    this.errorCode = errorCode;
    this.message = errorMessage;

    return this;
  }

  public withErrorPromise(
    errorCode: DomainErrorCodes,
    errorMessage: string,
  ): Promise<this> {
    this.errorCode = errorCode;
    this.message = errorMessage;

    return Promise.resolve(this);
  }

  public copyErrorWithPromise<U>(response: ResponseModel<U>): Promise<this> {
    this.errorCode = response.errorCode;
    this.message = response.message;

    return Promise.resolve(this);
  }
}
