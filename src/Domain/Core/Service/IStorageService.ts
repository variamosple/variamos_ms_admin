export interface IStorageService {
  deleteFile(filePath: string): Promise<void>;
}
