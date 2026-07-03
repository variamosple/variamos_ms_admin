import { IStorageService } from "@src/Domain/Core/Service/IStorageService";
import logger from "jet-logger";
import * as fs from "fs";
import * as path from "path";

export class DiskStorageService implements IStorageService {
  async deleteFile(filePath: string): Promise<void> {
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
