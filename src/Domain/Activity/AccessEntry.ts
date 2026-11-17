/**
 * One access event of the access journal (T-24 lot 2, EV-88 lot C): a
 * sign-in, a lock or a refused request, with the account when it is known
 * and the address of the client. Never the identifier typed at sign-in.
 */
export interface AccessEntry {
  event:
    | "sign-in"
    | "sign-in.mfa"
    | "sign-in.google"
    | "account.locked"
    | "access.refused";
  outcome: "success" | "failed";
  reason: string | null;
  userId: string | null;
  ip: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  /**
   * The browser of a completed sign-in, for the new-device alert; never
   * written to the journal.
   */
  device?: SignInDevice;
}

/** The random identifier kept by a browser, and how it names itself. */
interface SignInDevice {
  id: string;
  userAgent: string | null;
}

/** An account found from the e-mail of a sign-in. */
export interface KnownAccount {
  id: string;
  active: boolean;
}
