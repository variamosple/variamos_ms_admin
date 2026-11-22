// The alerts of the monitoring: services down, backups and background tasks

import EnvVars from "#src/common/EnvVars.js";
import { MailServiceInstance } from "./CompositionAdapters.js";
import { ConfigurationRepositoryInstance } from "./CompositionRepositories.js";
import { FileBackupStatusReader } from "./DataProviders/Backup/FileBackupStatusReader.js";
import { BackupAlerts } from "./Domain/Backup/UseCase/BackupAlerts.js";
import { ServiceAlertPolicyService } from "./Domain/MicroService/Service/ServiceAlertPolicyService.js";
import { ServiceAlerts } from "./Domain/MicroService/UseCase/ServiceAlerts.js";
import { BackgroundTaskAlerts } from "./Domain/Scheduling/UseCase/BackgroundTaskAlerts.js";
import { JetLogger } from "./Infrastructure/Logging/JetLogger.js";
import { ServiceAlertNotifier } from "./Infrastructure/Notification/ServiceAlertNotifier.js";
import { BackgroundTaskRegistry } from "./Infrastructure/Scheduling/BackgroundTaskRegistry.js";

// The alerts go by mail; their addresses and the number of failures before
// one follow the configuration screen
const alertPolicy = new ServiceAlertPolicyService(
  ConfigurationRepositoryInstance,
  JetLogger,
);
const alertNotifier = new ServiceAlertNotifier(MailServiceInstance, JetLogger);
// A mail when a service stops answering, then when it answers again
export const ServiceAlertsInstance = new ServiceAlerts(
  alertPolicy,
  alertNotifier,
  JetLogger,
);

// A mail when the nightly database backup goes wrong, to the same addresses;
// off without the status file written by the server
export const BackupAlertsInstance = EnvVars.BACKUP.STATUS_FILE
  ? new BackupAlerts(
      new FileBackupStatusReader(EnvVars.BACKUP.STATUS_FILE, JetLogger),
      alertPolicy,
      alertNotifier,
      JetLogger,
    )
  : null;

// The background tasks, shown on the monitoring page; a task that keeps
// failing sends a mail to the monitoring alerts addresses (ADM-N34)
const backgroundTaskAlerts = new BackgroundTaskAlerts(
  alertPolicy,
  alertNotifier,
  JetLogger,
);
export const BackgroundTasks = new BackgroundTaskRegistry((status) =>
  backgroundTaskAlerts.afterRun(status),
);
