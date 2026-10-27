import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import logger from "#src/common/logger.js";
import type { IStorageService } from "#src/Domain/Core/Service/IStorageService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_ROUTE = "/uploads";

export class DiskStorageService implements IStorageService {
  /**
   * @param publicDir directory that holds the `uploads` folder; stored paths
   * such as `/uploads/<name>` are resolved against it.
   */
  public constructor(
    private readonly publicDir: string = path.join(__dirname, "../../public"),
  ) {}

  public async saveFile(
    content: Uint8Array,
    extension: string,
  ): Promise<string> {
    const fileName = `${randomUUID()}.${extension}`;
    const uploadsDir = path.join(this.publicDir, UPLOADS_ROUTE);
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    // "wx" refuses to overwrite an existing file
    await fs.promises.writeFile(path.join(uploadsDir, fileName), content, {
      flag: "wx",
    });
    return `${UPLOADS_ROUTE}/${fileName}`;
  }

  public async deleteFile(filePath: string): Promise<void> {
    // Resolve relative database storage paths against the public assets directory
    const absolutePath = path.join(this.publicDir, filePath);
    return new Promise((resolve) => {
      fs.unlink(absolutePath, (err) => {
        if (err) {
          logger.err(
            `Failed to delete physical file: ${absolutePath}. ${err.message}`,
          );
        } else {
          logger.info(`Successfully deleted physical file: ${absolutePath}`);
        }
        resolve();
      });
    });
  }
}

export const DiskStorageServiceInstance = new DiskStorageService();
