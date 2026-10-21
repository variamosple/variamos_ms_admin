export interface IMailService {
  sendPasswordResetMail(
    to: string,
    recoveryLink: string,
    validForMs: number,
  ): Promise<boolean>;
  /** Tells the owner that an administrator turned their second factor off. */
  sendMfaResetMail(to: string): Promise<boolean>;
}
