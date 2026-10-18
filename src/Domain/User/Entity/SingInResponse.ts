export interface SingInResponse {
  id?: string;
  redirect?: string;
  /** The password was right; the code of the second factor is expected. */
  mfaRequired?: boolean;
}
