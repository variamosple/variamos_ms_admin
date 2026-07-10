export class RequestModel<Request> {
  public constructor(
    public transactionId?: string,
    public data?: Request,
  ) {}
}
