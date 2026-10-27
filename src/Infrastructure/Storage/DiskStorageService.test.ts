import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import logger from "#src/common/logger.js";
import { DiskStorageService } from "./DiskStorageService.js";

describe("DiskStorageService", () => {
  let publicDir: string;
  let service: DiskStorageService;

  beforeEach(() => {
    vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.spyOn(logger, "err").mockImplementation(() => {});
    publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "disk-storage-"));
    service = new DiskStorageService(publicDir);
  });

  afterEach(() => {
    fs.rmSync(publicDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes the content under a generated name and returns its public path", async () => {
    const content = new Uint8Array([1, 2, 3]);

    const filePath = await service.saveFile(content, "png");

    expect(filePath).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    const written = fs.readFileSync(path.join(publicDir, filePath));
    expect([...written]).toEqual([1, 2, 3]);
  });

  it("creates the uploads directory when it is missing", async () => {
    expect(fs.existsSync(path.join(publicDir, "uploads"))).toBe(false);

    await service.saveFile(new Uint8Array([1]), "txt");

    expect(fs.existsSync(path.join(publicDir, "uploads"))).toBe(true);
  });

  it("gives two saves of the same content different names", async () => {
    const first = await service.saveFile(new Uint8Array([1]), "txt");
    const second = await service.saveFile(new Uint8Array([1]), "txt");

    expect(first).not.toBe(second);
  });

  it("deletes a stored file", async () => {
    const filePath = await service.saveFile(new Uint8Array([1]), "txt");

    await service.deleteFile(filePath);

    expect(fs.existsSync(path.join(publicDir, filePath))).toBe(false);
  });

  it("resolves without throwing when the file to delete is missing", async () => {
    await expect(
      service.deleteFile("/uploads/missing.txt"),
    ).resolves.toBeUndefined();
    expect(logger.err).toHaveBeenCalled();
  });
});
