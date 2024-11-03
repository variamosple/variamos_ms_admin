export class ResponseModel<Type> {
  constructor(
    public transactionId?: string,
    public errorCode?: number,
    public message?: string,
    public totalCount?: number,
    public data?: Type
  ) {}

  withError(errorCode: number, errorMessage: string): this {
    this.errorCode = errorCode;
    this.message = errorMessage;

    return this;
  }

  withErrorPromise(errorCode: number, errorMessage: string): Promise<this> {
    this.errorCode = errorCode;
    this.message = errorMessage;

    return Promise.resolve(this);
  }
}
