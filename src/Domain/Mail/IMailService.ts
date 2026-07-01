export interface IMailService {
  sendPasswordResetMail(to: string, recoveryLink: string): Promise<boolean>;
}
