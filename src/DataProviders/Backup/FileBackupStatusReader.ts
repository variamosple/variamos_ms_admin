import { readFile } from "node:fs/promises";
import type { IBackupStatusReader } from "#src/Domain/Backup/UseCase/BackupAlerts.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";

/** Bounds the file read: the status holds a few short fields. */
const MAX_STATUS_BYTES = 4096;

/**
 * Reads the status file of the nightly backup, mounted read-only from the
 * server. A missing, too large or malformed file reads as null.
 */
export class FileBackupStatusReader implements IBackupStatusReader {
  public constructor(
    private readonly path: string,
    private readonly logger: ILogger,
  ) {}

  public async read(): Promise<unknown> {
    try {
      const text = await readFile(this.path, "utf8");
      if (text.length > MAX_STATUS_BYTES) return null;
      const parsed: unknown = JSON.parse(text);
      return parsed;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "ENOENT") {
        this.logger.warn(`Backup status unreadable: ${String(code ?? error)}`);
      }
      return null;
    }
  }
}
