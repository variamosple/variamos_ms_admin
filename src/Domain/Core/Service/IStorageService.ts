export interface IStorageService {
  /**
   * Delete a file from the external storage by its relative path.
   * @param filePath The relative path of the file to delete.
   */
  deleteFile(filePath: string): Promise<void>;
}
