export interface SingInResponse {
  id?: string;
  redirect?: string;
  /** The password was right; the code of the second factor is expected. */
  mfaRequired?: boolean;
  /** Days the user may choose not to be asked again; 0 when off. */
  trustedDeviceDays?: number;
}
