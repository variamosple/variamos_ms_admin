import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { SERVICE_ALERT_KEYS } from "#src/Domain/MicroService/Entity/ServiceAlertPolicy.js";
import type { IServiceAlertPolicyProvider } from "#src/Domain/MicroService/Service/ServiceAlertPolicyService.js";
import type {
  IServiceAlertNotifier,
  ServiceAlert,
} from "#src/Domain/MicroService/UseCase/ServiceAlerts.js";
import {
  type BackupProblem,
  type BackupStatus,
  backupProblemsOf,
  backupStatusOf,
} from "../Entity/BackupStatus.js";

/** The status file written by the server; null when it cannot be read. */
export interface IBackupStatusReader {
  read(): Promise<unknown>;
}

export interface BackupReport {
  status: BackupStatus | null;
  problems: BackupProblem[];
}

/** The text of the mail for backups that went wrong, or are fine again. */
function backupAlertOf(problems: readonly BackupProblem[]): ServiceAlert {
  if (problems.length === 0) {
    return {
      title: "Database backup is fine again",
      body: "The last nightly backup of the database is recent, complete and intact.",
    };
  }
  return {
    title: "Database backup problem",
    body: `${problems.map((problem) => problem.message).join(" ")} The backups are made by the nightly cron of the server (02:00 UTC).`,
  };
}

/**
 * Checks the status of the nightly database backup and sends a mail to the
 * monitoring alerts addresses when it goes wrong, then when it is fine again.
 * The same problem is not sent twice while the service runs.
 */
export class BackupAlerts {
  /** The problems last seen; empty when all was fine. */
  private lastProblems = "";

  public constructor(
    private readonly reader: IBackupStatusReader,
    private readonly policyProvider: IServiceAlertPolicyProvider,
    private readonly notifier: IServiceAlertNotifier,
    private readonly logger: ILogger,
  ) {}

  public async report(now: Date = new Date()): Promise<BackupReport> {
    const status = backupStatusOf(await this.reader.read());
    return { status, problems: backupProblemsOf(status, now) };
  }

  public async check(now: Date = new Date()): Promise<void> {
    const { problems } = await this.report(now);
    const kinds = problems.map((problem) => problem.kind).join(",");
    if (kinds === this.lastProblems) return;
    this.lastProblems = kinds;
    const alert = backupAlertOf(problems);
    this.logger.warn(`Backup check: ${alert.title}`);
    const policy = await this.policyProvider.getPolicy();
    if (policy.recipients.length === 0) {
      this.logger.info(
        `Backup alert not sent, no address in ${SERVICE_ALERT_KEYS.recipients}: ${alert.title}`,
      );
      return;
    }
    await this.notifier.notify(policy.recipients, alert);
  }
}
