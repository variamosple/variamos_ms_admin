import nodemailer from "nodemailer";
import logger from "jet-logger";
import EnvVars from "@src/common/EnvVars";

export class MailService {
  private static transporter = nodemailer.createTransport({
    host: EnvVars.SMTP.HOST,
    port: EnvVars.SMTP.PORT,
    secure: EnvVars.SMTP.PORT === 465, // true for port 465 (SSL), false for other ports (TLS/STARTTLS)
    auth:
      EnvVars.SMTP.USER && EnvVars.SMTP.PASSWORD
        ? {
            user: EnvVars.SMTP.USER,
            pass: EnvVars.SMTP.PASSWORD,
          }
        : undefined,
  });

  /**
   * Sends an email in text or HTML format
   */
  static async sendMail(
    to: string,
    subject: string,
    html: string,
  ): Promise<boolean> {
    try {
      // If in development/testing mode and no SMTP credentials are provided, simulate the email sending
      if (
        EnvVars.NodeEnv !== "production" &&
        (!EnvVars.SMTP.USER || !EnvVars.SMTP.PASSWORD)
      ) {
        logger.info(`[MAIL DEV ONLY] Simulate sending email to ${to}:                                                                                        
    Subject: ${subject}                                                                                                                                          
    Content: ${html}`);
        return true;
      }

      const info = await this.transporter.sendMail({
        from: EnvVars.SMTP.FROM,
        to,
        subject,
        html,
      });

      logger.info(
        `[MAIL] Email sent successfully to ${to}. MessageId: ${info.messageId}`,
      );
      return true;
    } catch (error) {
      logger.err(`[MAIL ERROR] Failed to send email to ${to}:`, error);
      return false;
    }
  }

  /**
   * Sends a password reset email containing the recovery link
   */
  static async sendPasswordResetMail(
    to: string,
    recoveryLink: string,
  ): Promise<boolean> {
    const subject = "VariaMos - Password Recovery Request";
    const logoUrl =
      "https://app.variamos.com/variamos_admin/images/VariaMosLogo.png";
    const html = `
      <div style="background-color: #f8f9fa; padding: 40px 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333;">
        <div style="max-width: 550px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border: 1px solid #e9ecef;">
          
          <!-- Header (Logo / Titre) -->
          <div style="background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 1px solid #e9ecef;">
            <img src="${logoUrl}" alt="VariaMos Logo" style="max-height: 45px; display: block; margin: 0 auto;" />
            <p style="color: #6c757d; margin: 8px 0 0 0; font-size: 13px; font-weight: 500; letter-spacing: 0.5px;">Platform Admin Panel</p>
          </div>

          <!-- Contenu principal -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #212529; font-size: 20px; margin-top: 0; font-weight: 600;">Hello,</h2>
            <p style="font-size: 15px; line-height: 1.6; color: #495057;">
              You have requested to reset the password for your <strong>VariaMos</strong> account.
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: #495057;">
              Please click the button below to choose a new password. This secure link is valid for the next <strong>24 hours</strong>:
            </p>

            <!-- Bouton d'action principal -->
            <div style="text-align: center; margin: 35px 0;">
              <a href="${recoveryLink}" style="background-color: #0d6efd; color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 2px 5px rgba(13, 110, 253, 0.2); transition: background-color 0.2s;">
                Reset Password
              </a>
            </div>

            <p style="font-size: 13px; line-height: 1.5; color: #6c757d;">
              If the button above does not work, you can copy and paste the following URL into your browser address bar:
              <br />
              <a href="${recoveryLink}" style="color: #0d6efd; word-break: break-all;">${recoveryLink}</a>
            </p>

            <hr style="border: 0; border-top: 1px solid #e9ecef; margin: 30px 0;" />

            <!-- Signature -->
            <p style="font-size: 15px; line-height: 1.6; color: #495057; margin-bottom: 0;">
              Best regards,<br />
              <strong>The VariaMos Team</strong>
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f1f3f5; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
            <p style="font-size: 12px; color: #868e96; margin: 0;">
              This is an automated email, please do not reply directly.
            </p>
            <p style="font-size: 12px; color: #868e96; margin: 5px 0 0 0;">
              &copy; ${new Date().getFullYear()} VariaMos Project. All rights reserved.
            </p>
          </div>

        </div>
      </div>
    `;
    return this.sendMail(to, subject, html);
  }
}
