/**
 * Browsers where a user chose not to be asked the sign-in code. Dates come
 * from the database clock, as for `user_mfa.enabled_at`.
 */
export interface ITrustedDeviceRepository {
  /** Trusts a browser for `days`; drops the user's expired and oldest ones. */
  add(userId: string, tokenHash: string, days: number): Promise<void>;
  /**
   * Whether the browser is still trusted: not expired, trusted less than
   * `days` ago and after the factor was turned on. Records the use if so.
   */
  use(userId: string, tokenHash: string, days: number): Promise<boolean>;
  /** Forgets every browser of the user; gives how many there were. */
  removeAll(userId: string): Promise<number>;
}
