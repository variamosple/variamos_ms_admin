import { Nullable } from "./Nullable";

export class ResponseModel<Type> {
  public constructor(
    public transactionId?: string,
    public errorCode?: string,
    public message?: string,
    public totalCount?: number,
    public data?: Nullable<Type>,
  ) {}

  public withResponse(data: Nullable<Type>, totalCount?: number): this {
    this.data = data;
    this.totalCount = totalCount;

    return this;
  }

  public withResponsePromise(data: Nullable<Type>, totalCount?: number): Promise<this> {
    this.data = data;
    this.totalCount = totalCount;

    return Promise.resolve(this);
  }

  public withError(errorCode: string, errorMessage: string): this {
    this.errorCode = errorCode;
    this.message = errorMessage;

    return this;
  }

  public withErrorPromise(errorCode: string, errorMessage: string): Promise<this> {
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
