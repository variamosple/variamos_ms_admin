import type { DomainErrorCodes } from "./DomainErrorCodes.js";

/**
 * An error meant for the user: its code is stable and its message can be
 * shown as is (T-16). The message of any other error stays on the server.
 */
export class DomainError extends Error {
  public constructor(
    public readonly code: DomainErrorCodes,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
