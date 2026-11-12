import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { BugAttachment } from "../Entity/BugAttachment.js";

/** The files attached to bugs. */
export interface IBugAttachmentRepository {
  updateAttachmentPath(
    request: RequestModel<{ id: number; filePath: string }>,
  ): Promise<ResponseModel<void>>;
  createAttachment(
    request: RequestModel<{
      filePath: string;
      fileType: string;
      bugId: string;
    }>,
  ): Promise<ResponseModel<BugAttachment>>;
  deleteAttachment(request: RequestModel<string>): Promise<ResponseModel<void>>;
  findAttachmentById(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugAttachment | null>>;
}
