import { mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IServiceAlertPolicyProvider } from "#src/Domain/MicroService/Service/ServiceAlertPolicyService.js";
import type { IServiceAlertNotifier } from "#src/Domain/MicroService/UseCase/ServiceAlerts.js";
import { BackupAlerts, type IBackupStatusReader } from "./BackupAlerts.js";

const NOW = new Date("2026-11-15T03:00:00Z");

const statusFile = (overrides: Record<string, unknown> = {}) => ({
  checkedAt: "2026-11-15T02:30:00Z",
  file: "db_backup_2026-11-15.sql.gz",
  createdAt: "2026-11-15T02:01:00Z",
  sizeBytes: 69 * 1024 * 1024,
  previousSizeBytes: 68 * 1024 * 1024,
  intact: true,
  ...overrides,
});

const setUp = (recipients: string[] = ["ops@example.com"]) => {
  const reader = mock<IBackupStatusReader>();
  const policy = mock<IServiceAlertPolicyProvider>();
  policy.getPolicy.mockResolvedValue({ recipients, failuresBeforeAlert: 3 });
  const notifier = mock<IServiceAlertNotifier>();
  const logger = mock<ILogger>();
  const alerts = new BackupAlerts(reader, policy, notifier, logger);
  return { alerts, reader, notifier, logger };
};

describe("backup alerts (EV-86)", () => {
  it("sends nothing while the backups are fine", async () => {
    const { alerts, reader, notifier } = setUp();
    reader.read.mockResolvedValue(statusFile());

    await alerts.check(NOW);

    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("sends a problem once, then when the backups are fine again", async () => {
    const { alerts, reader, notifier } = setUp();
    reader.read.mockResolvedValue(statusFile({ intact: false }));

    await alerts.check(NOW);
    await alerts.check(NOW);

    expect(notifier.notify).toHaveBeenCalledOnce();
    expect(notifier.notify).toHaveBeenCalledWith(["ops@example.com"], {
      title: "Database backup problem",
      body: "The last backup (db_backup_2026-11-15.sql.gz) is not a valid gzip archive. The backups are made by the nightly cron of the server (02:00 UTC).",
    });

    reader.read.mockResolvedValue(statusFile());
    await alerts.check(NOW);
    expect(notifier.notify).toHaveBeenLastCalledWith(["ops@example.com"], {
      title: "Database backup is fine again",
      body: "The last nightly backup of the database is recent, complete and intact.",
    });
  });

  it("sends again when the problem changes", async () => {
    const { alerts, reader, notifier } = setUp();
    reader.read.mockResolvedValue(statusFile({ intact: false }));
    await alerts.check(NOW);

    reader.read.mockResolvedValue(null);
    await alerts.check(NOW);

    expect(notifier.notify).toHaveBeenCalledTimes(2);
  });

  it("only logs a problem without an address", async () => {
    const { alerts, reader, notifier, logger } = setUp([]);
    reader.read.mockResolvedValue(null);

    await alerts.check(NOW);

    expect(notifier.notify).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Backup alert not sent, no address in monitoring.alerts.recipients: Database backup problem",
    );
  });

  it("reports the status and its problems", async () => {
    const { alerts, reader } = setUp();
    reader.read.mockResolvedValue(statusFile({ sizeBytes: 10 }));

    const report = await alerts.report(NOW);

    expect(report.status?.file).toBe("db_backup_2026-11-15.sql.gz");
    expect(report.problems.map((problem) => problem.kind)).toEqual([
      "too-small",
    ]);
  });
});
