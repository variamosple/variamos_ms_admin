export interface IMailService {
  sendPasswordResetMail(
    to: string,
    recoveryLink: string,
    validForMs: number,
  ): Promise<boolean>;
  /** Tells the owner that an administrator turned their second factor off. */
  sendMfaResetMail(to: string): Promise<boolean>;
  /**
   * Tells the owner of an address that someone tried to create an account
   * with it, since the sign-up answer does not say so (UX-33).
   */
  sendExistingAccountMail(
    to: string,
    signInLink: string,
    forgotPasswordLink: string,
  ): Promise<boolean>;
  /** Sends a security alert to an account at the top of the role ladder. */
  sendSecurityAlertMail(
    to: string,
    title: string,
    body: string,
  ): Promise<boolean>;
}
