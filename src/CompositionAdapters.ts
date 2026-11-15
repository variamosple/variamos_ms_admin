import EnvVars from "#src/common/EnvVars.js";
import { MailServiceImpl } from "./Infrastructure/Mail/MailService.js";
import { NotificationClient } from "./Infrastructure/Notification/NotificationClient.js";

/*
 * The adapters that talk to other servers, made once with the settings read
 * from the environment (EV-05): the adapters never read EnvVars.
 */

export const MailServiceInstance = new MailServiceImpl({
  host: EnvVars.SMTP.HOST,
  port: EnvVars.SMTP.PORT,
  user: EnvVars.SMTP.USER,
  password: EnvVars.SMTP.PASSWORD,
  from: EnvVars.SMTP.FROM,
  production: EnvVars.NodeEnv === "production",
});

export const NotificationClientInstance = new NotificationClient({
  serviceUrl: EnvVars.NOTIFICATION.SERVICE_URL,
  internalToken: EnvVars.NOTIFICATION.INTERNAL_TOKEN,
});
