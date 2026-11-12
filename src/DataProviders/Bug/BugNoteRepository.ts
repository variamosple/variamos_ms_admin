import logger from "#src/common/logger.js";
import { BugNote } from "#src/Domain/Bug/Entity/BugNote.js";
import type { IBugNoteRepository } from "#src/Domain/Bug/Repository/IBugNoteRepository.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { INTERNAL_ERROR_MESSAGE } from "#src/Domain/Core/Error/InternalErrorMessage.js";
import { UserModel } from "../User/User.js";
import { BugNoteModel } from "./BugNote.js";
import { resolveOperatorId } from "./bugRows.js";

/** The notes administrators write on bugs. */
export class BugNoteRepositoryImpl implements IBugNoteRepository {
  public async createNote(
    request: RequestModel<{ bugId: string; body: string; authorId?: string }>,
  ): Promise<ResponseModel<BugNote>> {
    const response = new ResponseModel<BugNote>(request.transactionId);
    try {
      const data = request.data;
      if (!data) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Note data is required.",
        );
      }
      const { bugId, body, authorId } = data;

      // Prevent FK violation by ensuring authorId exists in local user table
      const resolvedAuthorId = authorId
        ? await resolveOperatorId(authorId)
        : undefined;

      const dbNote = await BugNoteModel.create({
        bugId,
        body,
        authorId: resolvedAuthorId,
      });

      let authorName = "System";
      if (resolvedAuthorId) {
        const user = await UserModel.findByPk(resolvedAuthorId);
        if (user) authorName = user.name;
      }

      response.data = BugNote.builder()
        .setId(dbNote.id)
        .setBugId(dbNote.bugId)
        .setBody(dbNote.body)
        .setAuthorId(dbNote.authorId || "")
        .setAuthor({ name: authorName })
        .setCreatedAt(dbNote.createdAt)
        .build();
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }

  public async queryNotes(
    request: RequestModel<string>,
  ): Promise<ResponseModel<BugNote[]>> {
    const response = new ResponseModel<BugNote[]>(request.transactionId);
    try {
      const bugId = request.data;
      if (!bugId) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          "Bug ID is required.",
        );
      }
      const dbNotes = await BugNoteModel.findAll({
        where: { bugId },
        include: [{ model: UserModel, as: "author", attributes: ["name"] }],
        order: [["createdAt", "ASC"]],
      });

      response.data = dbNotes.map((dbNote) => {
        return BugNote.builder()
          .setId(dbNote.id)
          .setBugId(dbNote.bugId)
          .setBody(dbNote.body)
          .setAuthorId(dbNote.authorId || "")
          .setAuthor({ name: dbNote.author?.name || "System" })
          .setCreatedAt(dbNote.createdAt)
          .build();
      });
    } catch (error) {
      logger.err(error);
      response.withError(DomainErrorCodes.SYSTEM_ERROR, INTERNAL_ERROR_MESSAGE);
    }
    return response;
  }
}
