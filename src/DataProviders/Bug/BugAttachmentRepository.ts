import logger from "#src/common/logger.js";
import { BugAttachment } from "#src/Domain/Bug/Entity/BugAttachment.js";
import type { IBugAttachmentRepository } from "#src/Domain/Bug/Repository/IBugAttachmentRepository.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { INTERNAL_ERROR_MESSAGE } from "#src/Domain/Core/Error/InternalErrorMessage.js";
import { BugAttachmentModel } from "./BugAttachment.js";

/** The files attached to bugs. */
export class BugAttachmentRepositoryImpl implements IBugAttachmentRepository {
  public async updateAttachmentPath(
    request: RequestModel<{ id: number; filePath: string }>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Request data is required.",
        );
      }
      const { id, filePath } = data;
      await BugAttachmentModel.update({ filePath }, { where: { id } });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async createAttachment(
    request: RequestModel<{
      filePath: string;
      fileType: string;
      bugId: string;
    }>,
  ): Promise<ResponseModel<BugAttachment>> {
    const response = new ResponseModel<BugAttachment>(request.transactionId);
    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Attachment data is required.",
        );
      }
      const { filePath, fileType, bugId } = data;
      const attachment = await BugAttachmentModel.create({
        filePath,
        fileType,
        bugId,
      });
      response.data = BugAttachment.builder()
        .setId(attachment.id)
        .setFilePath(attachment.filePath)
        .setFileType(attachment.fileType)
        .setBugId(attachment.bugId)
        .build();
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async deleteAttachment(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const response = new ResponseModel<void>(request.transactionId);
    try {
      const id = request.data;
      if (!id) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Attachment ID is required.",
        );
      }
      await BugAttachmentModel.destroy({ where: { id } });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async findAttachmentById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugAttachment | null>> {
    const response = new ResponseModel<BugAttachment | null>(
      request.transactionId,
    );
    try {
      const id = request.data;
      if (!id) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Attachment ID is required.",
        );
      }
      const attachment = await BugAttachmentModel.findByPk(id);
      response.data = attachment
        ? BugAttachment.builder()
            .setId(attachment.id)
            .setFilePath(attachment.filePath)
            .setFileType(attachment.fileType)
            .setBugId(attachment.bugId)
            .build()
        : null;
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }
}
