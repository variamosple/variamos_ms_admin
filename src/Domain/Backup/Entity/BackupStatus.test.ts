import {
  type BackupStatus,
  backupProblemsOf,
  backupStatusOf,
} from "./BackupStatus.js";

const NOW = new Date("2026-11-15T03:00:00Z");
const MB = 1024 * 1024;

const healthy: BackupStatus = {
  checkedAt: new Date("2026-11-15T02:30:00Z"),
  file: "db_backup_2026-11-15.sql.gz",
  createdAt: new Date("2026-11-15T02:01:00Z"),
  sizeBytes: 69 * MB,
  previousSizeBytes: 68 * MB,
  intact: true,
};

const kindsOf = (status: BackupStatus | null) =>
  backupProblemsOf(status, NOW).map((problem) => problem.kind);

describe("backup status (EV-86)", () => {
  it("reads the status written by the server", () => {
    expect(
      backupStatusOf({
        checkedAt: "2026-11-15T02:30:00Z",
        file: "db_backup_2026-11-15.sql.gz",
        createdAt: "2026-11-15T02:01:00Z",
        sizeBytes: 69 * MB,
        previousSizeBytes: 68 * MB,
        intact: true,
      }),
    ).toEqual(healthy);
  });

  it("reads an empty file name as no backup, and odd fields as unknown", () => {
    expect(
      backupStatusOf({
        checkedAt: "2026-11-15T02:30:00Z",
        file: "",
        createdAt: "yesterday",
        sizeBytes: -1,
        intact: "yes",
      }),
    ).toEqual({
      checkedAt: new Date("2026-11-15T02:30:00Z"),
      file: null,
      createdAt: null,
      sizeBytes: null,
      previousSizeBytes: null,
      intact: false,
    });
  });

  it("refuses what is not a status", () => {
    expect(backupStatusOf(null)).toBeNull();
    expect(backupStatusOf("ok")).toBeNull();
    expect(backupStatusOf({ file: "x" })).toBeNull();
    expect(
      backupStatusOf({ checkedAt: "2026-11-15T02:30:00Z", file: 3 }),
    ).toBeNull();
  });

  it("finds nothing wrong with a recent, intact and full backup", () => {
    expect(kindsOf(healthy)).toEqual([]);
  });

  it("says when the status cannot be read or was not written for a day", () => {
    expect(kindsOf(null)).toEqual(["status-missing"]);
    expect(
      kindsOf({ ...healthy, checkedAt: new Date("2026-11-14T00:59:00Z") }),
    ).toEqual(["status-stale"]);
  });

  it("says when there is no backup at all", () => {
    expect(kindsOf({ ...healthy, file: null })).toEqual(["no-backup"]);
  });

  it("says when the last backup is older than 26 hours", () => {
    const [problem] = backupProblemsOf(
      { ...healthy, createdAt: new Date("2026-11-14T00:59:00Z") },
      NOW,
    );
    expect(problem).toEqual({
      kind: "stale",
      message:
        "The last backup dates from 2026-11-14 00:59 UTC: the nightly backup did not run or failed.",
    });
    expect(kindsOf({ ...healthy, createdAt: null })).toEqual(["stale"]);
  });

  it("says when the last backup is damaged, nearly empty or shrank by half", () => {
    expect(kindsOf({ ...healthy, intact: false })).toEqual(["corrupt"]);
    expect(kindsOf({ ...healthy, sizeBytes: 20 })).toEqual(["too-small"]);
    expect(kindsOf({ ...healthy, sizeBytes: 30 * MB })).toEqual(["shrunk"]);
    expect(
      kindsOf({ ...healthy, sizeBytes: 40 * MB, previousSizeBytes: null }),
    ).toEqual([]);
  });
});
