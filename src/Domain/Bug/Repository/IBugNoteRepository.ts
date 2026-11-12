import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { BugNote } from "../Entity/BugNote.js";

/** The notes administrators write on bugs. */
export interface IBugNoteRepository {
  createNote(
    request: RequestModel<{ bugId: string; body: string; authorId?: string }>,
  ): Promise<ResponseModel<BugNote>>;
  queryNotes(request: RequestModel<string>): Promise<ResponseModel<BugNote[]>>;
}
