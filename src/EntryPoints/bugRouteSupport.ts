import type { RequestHandler } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import type { BugAssignmentUseCase } from "#src/Domain/Bug/UseCase/BugAssignmentUseCase.js";
import type { BugAttachmentUseCase } from "#src/Domain/Bug/UseCase/BugAttachmentUseCase.js";
import type { BugLifecycleUseCase } from "#src/Domain/Bug/UseCase/BugLifecycleUseCase.js";
import type { BugQueryUseCase } from "#src/Domain/Bug/UseCase/BugQueryUseCase.js";
import type { BugSubmissionUseCase } from "#src/Domain/Bug/UseCase/BugSubmissionUseCase.js";
import type { BugSyncUseCase } from "#src/Domain/Bug/UseCase/BugSyncUseCase.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { MAX_ATTACHMENT_SIZE_BYTES } from "#src/Domain/Core/File/AllowedFileType.js";
import type { UploadedFile } from "#src/Domain/Core/File/UploadedFile.js";

/** What the bug routes use. */
export interface BugRouterDependencies {
  bugSubmissionUseCase: BugSubmissionUseCase;
  bugLifecycleUseCase: BugLifecycleUseCase;
  bugSyncUseCase: BugSyncUseCase;
  bugQueryUseCase: BugQueryUseCase;
  bugAttachmentUseCase: BugAttachmentUseCase;
  upload: MulterUpload;
  authMiddleware: RequestHandler;
  bugAssignmentUseCase: BugAssignmentUseCase;
}

/**
 * Factory function to create Bug Router with decoupled dependency injection
 */
export interface MulterUpload {
  single(fieldName: string): RequestHandler;
}

const FILE_FIELD = "file";

const MAX_ATTACHMENT_SIZE_MB = MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024);

function isMulterError(error: unknown): error is { code?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "MulterError"
  );
}

/**
 * Runs the upload middleware and answers its limit errors itself: 413 for a
 * file over the size limit, 400 for any other upload error.
 */
export function acceptSingleFile(
  upload: MulterUpload,
  transactionId: string,
): RequestHandler {
  const single = upload.single(FILE_FIELD);
  return (req, res, next) => {
    single(req, res, (error?: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (!isMulterError(error)) {
        next(error);
        return;
      }
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      res
        .status(
          tooLarge
            ? HttpStatusCodes.PAYLOAD_TOO_LARGE
            : HttpStatusCodes.BAD_REQUEST,
        )
        .json(
          new ResponseModel(transactionId).withError(
            DomainErrorCodes.INVALID_INPUT,
            tooLarge
              ? `The file exceeds the ${MAX_ATTACHMENT_SIZE_MB} MB limit.`
              : `Only one file can be attached, in the "${FILE_FIELD}" field.`,
          ),
        );
    });
  };
}

export function toUploadedFile(
  file?: Express.Multer.File,
): UploadedFile | null {
  if (!file?.buffer) return null;
  return { content: file.buffer, originalName: file.originalname };
}
