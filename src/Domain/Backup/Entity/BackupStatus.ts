/**
 * What the status check of the server writes after the nightly database
 * backup (cron at 02:30 UTC, after the backup at 02:00): no data, only the
 * date, the size and the integrity of the last backup file.
 */
export interface BackupStatus {
  /** When the status check ran. */
  checkedAt: Date;
  /** Name of the last backup file; null when there is none. */
  file: string | null;
  createdAt: Date | null;
  sizeBytes: number | null;
  /** Size of the backup before it, to see a backup that shrank. */
  previousSizeBytes: number | null;
  /** The archive passes gzip -t. */
  intact: boolean;
}

type BackupProblemKind =
  | "status-missing"
  | "status-stale"
  | "no-backup"
  | "stale"
  | "corrupt"
  | "too-small"
  | "shrunk";

export interface BackupProblem {
  kind: BackupProblemKind;
  message: string;
}

/** A backup runs every night: past this age, one was missed. */
const BACKUP_MAX_AGE_MS = 26 * 60 * 60 * 1000;
/** Below this size, the dump of VariamosDB cannot be complete. */
const BACKUP_MIN_SIZE_BYTES = 1024 * 1024;

const dateOf = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const sizeOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;

const fieldOf = (value: object, key: string): unknown =>
  Object.entries(value).find(([name]) => name === key)?.[1];

/** The status written by the server, or null when it is not one. */
export const backupStatusOf = (raw: unknown): BackupStatus | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const checkedAt = dateOf(fieldOf(raw, "checkedAt"));
  const file = fieldOf(raw, "file");
  if (!checkedAt || (file !== null && typeof file !== "string")) return null;
  return {
    checkedAt,
    file: file === "" ? null : file,
    createdAt: dateOf(fieldOf(raw, "createdAt")),
    sizeBytes: sizeOf(fieldOf(raw, "sizeBytes")),
    previousSizeBytes: sizeOf(fieldOf(raw, "previousSizeBytes")),
    intact: fieldOf(raw, "intact") === true,
  };
};

/** "2026-11-15 02:00 UTC" */
const utcMinute = (date: Date): string =>
  `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

const megabytes = (bytes: number): string =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const lastBackupProblems = (
  status: BackupStatus,
  now: Date,
): BackupProblem[] => {
  const problems: BackupProblem[] = [];
  if (
    !status.createdAt ||
    status.createdAt.getTime() < now.getTime() - BACKUP_MAX_AGE_MS
  ) {
    const when = status.createdAt
      ? utcMinute(status.createdAt)
      : "an unknown date";
    problems.push({
      kind: "stale",
      message: `The last backup dates from ${when}: the nightly backup did not run or failed.`,
    });
  }
  if (!status.intact) {
    problems.push({
      kind: "corrupt",
      message: `The last backup (${status.file}) is not a valid gzip archive.`,
    });
  }
  const size = status.sizeBytes ?? 0;
  if (size < BACKUP_MIN_SIZE_BYTES) {
    problems.push({
      kind: "too-small",
      message: `The last backup holds only ${size} bytes.`,
    });
  } else if (
    status.previousSizeBytes !== null &&
    size < status.previousSizeBytes / 2
  ) {
    problems.push({
      kind: "shrunk",
      message: `The last backup (${megabytes(size)}) is less than half the one before (${megabytes(status.previousSizeBytes)}).`,
    });
  }
  return problems;
};

/** What is wrong with the backups at this time; empty when all is well. */
export const backupProblemsOf = (
  status: BackupStatus | null,
  now: Date,
): BackupProblem[] => {
  if (!status) {
    return [
      {
        kind: "status-missing",
        message:
          "The backup status cannot be read: the status check of the server may not run.",
      },
    ];
  }
  if (status.checkedAt.getTime() < now.getTime() - BACKUP_MAX_AGE_MS) {
    return [
      {
        kind: "status-stale",
        message: `The backup status was last written at ${utcMinute(status.checkedAt)}: the status check of the server (02:30 UTC) did not run.`,
      },
    ];
  }
  if (!status.file) {
    return [
      { kind: "no-backup", message: "No backup file was found on the server." },
    ];
  }
  return lastBackupProblems(status, now);
};
