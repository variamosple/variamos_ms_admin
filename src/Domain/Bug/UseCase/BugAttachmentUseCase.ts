import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import type { BugAttachment } from "#src/Domain/Bug/Entity/BugAttachment.js";
import type { BugNote } from "#src/Domain/Bug/Entity/BugNote.js";
import type { IBugRepository } from "#src/Domain/Bug/Repository/IBugRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  ALLOWED_FILE_TYPES_LABEL,
  detectAllowedFileType,
} from "#src/Domain/Core/File/AllowedFileType.js";
import type { UploadedFile } from "#src/Domain/Core/File/UploadedFile.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IStorageService } from "#src/Domain/Core/Service/IStorageService.js";

export class BugAttachmentUseCase {
  public constructor(
    private readonly bugRepository: IBugRepository,
    private readonly storageService: IStorageService,
    private readonly logger: ILogger,
    private readonly journal: IActivityJournal,
  ) {}

  /** Recorded in the activity journal: the bug and its type, not the file. */
  public async addAttachment(
    request: RequestModel<{
      bugId: string;
      file: UploadedFile | null;
    }>,
  ): Promise<ResponseModel<BugAttachment>> {
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "bug.attachment.create",
        entityType: "bug",
        entityId: request.data?.bugId,
        transactionId: request.transactionId,
      },
      () => this.storeAttachment(request),
      (created) => ({
        after: {
          attachmentId: created.data?.id ?? null,
          fileType: created.data?.fileType ?? null,
        },
      }),
    );
  }

  private async storeAttachment(
    request: RequestModel<{
      bugId: string;
      file: UploadedFile | null;
    }>,
  ): Promise<ResponseModel<BugAttachment>> {
    const data = request.data;
    const response = new ResponseModel<BugAttachment>(request.transactionId);
    if (!data) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "Request data is required.",
      );
    }
    if (!data.file) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        "File is required.",
      );
    }
    const fileType = detectAllowedFileType(
      data.file.content,
      data.file.originalName,
    );
    if (!fileType) {
      return response.withErrorPromise(
        DomainErrorCodes.INVALID_INPUT,
        `Unsupported file type. Allowed: ${ALLOWED_FILE_TYPES_LABEL}.`,
      );
    }

    const filePath = await this.storageService.saveFile(
      data.file.content,
      fileType.extension,
    );
    try {
      const created = await this.bugRepository.createAttachment(
        new RequestModel(request.transactionId, {
          filePath,
          fileType: fileType.mimeType,
          bugId: data.bugId,
        }),
      );
      if (created.errorCode) {
        await this.storageService.deleteFile(filePath);
      }
      return created;
    } catch (error) {
      await this.storageService.deleteFile(filePath);
      throw error;
    }
  }

  /**
   * Recorded in the activity journal, the only trace of a deletion: the
   * attachment, and its bug and type once found.
   */
  public async deleteAttachment(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    let deleted: BugAttachment | undefined;
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "bug.attachment.delete",
        entityType: "bug",
        before: { attachmentId: request.data ?? null },
        transactionId: request.transactionId,
      },
      () =>
        this.removeAttachment(request, (attachment) => {
          deleted = attachment;
        }),
      () => ({
        entityId: deleted?.bugId,
        before: {
          attachmentId: request.data ?? null,
          fileType: deleted?.fileType ?? null,
        },
      }),
    );
  }

  private async removeAttachment(
    request: RequestModel<string>,
    onFound: (attachment: BugAttachment) => void,
  ): Promise<ResponseModel<void>> {
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
      return response.withErrorPromise(
        DomainErrorCodes.ENTITY_NOT_FOUND,
        "Attachment not found.",
      );
    }
    onFound(attachmentResp.data);
    const filePath = attachmentResp.data.filePath;
    if (filePath && filePath !== "/purged") {
      try {
        await this.storageService.deleteFile(filePath);
      } catch {
        this.logger.warn(`Failed to delete physical file: ${filePath}`);
      }
    }
    return this.bugRepository.deleteAttachment(request);
  }

  /** Recorded in the activity journal: the bug and the note, not its text. */
  public async createNote(
    request: RequestModel<{ bugId: string; body: string; authorId?: string }>,
  ): Promise<ResponseModel<BugNote>> {
    return withJournal(
      this.journal,
      {
        actorId: request.actorId ?? request.data?.authorId,
        action: "bug.note.create",
        entityType: "bug",
        entityId: request.data?.bugId,
        transactionId: request.transactionId,
      },
      () => this.bugRepository.createNote(request),
      (created) => ({ after: { noteId: created.data?.id ?? null } }),
    );
  }
}
