import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { FileBackupStatusReader } from "./FileBackupStatusReader.js";

describe("backup status file (EV-86)", () => {
  let dir: string;
  const logger = mock<ILogger>();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "backup-status-"));
    logger.warn.mockClear();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const readerOf = (content?: string) => {
    const path = join(dir, "status.json");
    if (content !== undefined) writeFileSync(path, content);
    return new FileBackupStatusReader(path, logger);
  };

  it("reads the JSON written by the server", async () => {
    await expect(readerOf('{"file":"db.sql.gz"}').read()).resolves.toEqual({
      file: "db.sql.gz",
    });
  });

  it("reads a missing file as null, without a warning", async () => {
    await expect(readerOf().read()).resolves.toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("reads a malformed or oversized file as null", async () => {
    await expect(readerOf("{not json").read()).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    await expect(readerOf(`"${"x".repeat(5000)}"`).read()).resolves.toBeNull();
  });
});
