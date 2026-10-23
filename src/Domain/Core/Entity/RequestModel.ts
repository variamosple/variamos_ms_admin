export class RequestModel<Request> {
  public constructor(
    public transactionId?: string,
    public data?: Request,
    // The user who asks for the operation, for the activity journal (T-24)
    public actorId?: string,
  ) {}
}
