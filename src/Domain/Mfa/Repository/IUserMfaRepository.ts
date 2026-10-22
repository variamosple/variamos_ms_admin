/** A second factor; `enabledAt` stays null until the first right code. */
export interface UserMfaRecord {
  userId: string;
  secretEncrypted: string;
  enabledAt: Date | null;
  lastUsedStep: number | null;
}

export interface IUserMfaRepository {
  findByUser(userId: string): Promise<UserMfaRecord | null>;
  /** Replaces a pending enrollment; never touches an enabled one. */
  savePending(userId: string, secretEncrypted: string): Promise<boolean>;
  /**
   * Turns the pending enrollment on, with its first step and the hashes of
   * new recovery codes. False when no enrollment is pending.
   */
  enable(userId: string, step: number, codeHashes: string[]): Promise<boolean>;
  /** Records a used step, only if it is later than the last one. */
  recordStep(userId: string, step: number): Promise<boolean>;
  /** Marks an unused recovery code as used; false when there is none. */
  useRecoveryCode(userId: string, codeHash: string): Promise<boolean>;
  countUnusedRecoveryCodes(userId: string): Promise<number>;
  /** Removes the factor, its recovery codes and its trusted browsers. */
  remove(userId: string): Promise<void>;
}
