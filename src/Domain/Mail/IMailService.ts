export interface IMailService {
  sendPasswordResetMail(
    to: string,
    recoveryLink: string,
    validForMs: number,
  ): Promise<boolean>;
}
