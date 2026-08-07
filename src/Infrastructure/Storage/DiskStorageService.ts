import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { IStorageService } from "@src/Domain/Core/Service/IStorageService.js";
import logger from "jet-logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DiskStorageService implements IStorageService {
  public async deleteFile(filePath: string): Promise<void> {
    // Resolve relative database storage paths against the public assets directory
    const absolutePath = path.join(__dirname, "../../public", filePath);
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
