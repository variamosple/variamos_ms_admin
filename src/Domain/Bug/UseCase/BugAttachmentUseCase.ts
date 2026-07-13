import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import { IStorageService } from "@src/Domain/Core/Service/IStorageService";
import { BugAttachment } from "@src/Domain/Bug/Entity/BugAttachment";
import { BugNote } from "@src/Domain/Bug/Entity/BugNote";
import logger from "jet-logger";

export class BugAttachmentUseCase {
  public constructor(
    private readonly bugRepository: IBugRepository,
    private readonly storageService: IStorageService,
  ) {}

  public async addAttachment(
    request: RequestModel<{
      bugId: string;
      file: {
        filename: string;
        mimetype: string;
      } | null;
    }>,
  ): Promise<ResponseModel<BugAttachment>> {
    const data = request.data;
    const response = new ResponseModel<BugAttachment>(request.transactionId);
    if (!data) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "Request data is required.");
    }
    if (!data.file) {
      return response.withErrorPromise(DomainErrorCodes.INVALID_INPUT, "File is required.");
    }
    const resolvedFile = {
      filePath: `/uploads/${data.file.filename}`,
      fileType: data.file.mimetype,
    };
    return this.bugRepository.createAttachment(
      new RequestModel(request.transactionId, {
        filePath: resolvedFile.filePath,
        fileType: resolvedFile.fileType,
        bugId: data.bugId,
      }),
    );
  }

  public async deleteAttachment(request: RequestModel<string>): Promise<ResponseModel<void>> {
    const id = request.data;
    const response = new ResponseModel<void>(request.transactionId);
    if (!id) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Attachment ID is required.",
      );
    }
    const attachmentResp = await this.bugRepository.findAttachmentById(
      new RequestModel(request.transactionId, id),
    );
    if (!attachmentResp.data) {
      return response.withErrorPromise(DomainErrorCodes.ENTITY_NOT_FOUND, "Attachment not found.");
    }
    const filePath = attachmentResp.data.filePath;
    if (filePath && filePath !== "/purged") {
      try {
        await this.storageService.deleteFile(filePath);
      } catch {
        logger.warn(`Failed to delete physical file: ${filePath}`);
      }
    }
    return this.bugRepository.deleteAttachment(request);
  }

  public async createNote(
    request: RequestModel<{ bugId: string; body: string; authorId?: string }>,
  ): Promise<ResponseModel<BugNote>> {
    return this.bugRepository.createNote(request);
  }
}
