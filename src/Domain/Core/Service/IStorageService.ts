export interface IStorageService {
  /**
   * Stores the content under a server-generated name with the given extension
   * and returns its public path (for example `/uploads/<id>.png`).
   */
  saveFile(content: Uint8Array, extension: string): Promise<string>;
  deleteFile(filePath: string): Promise<void>;
}
