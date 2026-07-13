import { mock, MockProxy } from "jest-mock-extended";
import { BugAttachmentUseCase } from "./BugAttachmentUseCase";
import { IBugRepository } from "@src/Domain/Bug/Repository/IBugRepository";
import { IStorageService } from "@src/Domain/Core/Service/IStorageService";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { BugAttachment } from "@src/Domain/Bug/Entity/BugAttachment";
import { BugNote } from "@src/Domain/Bug/Entity/BugNote";

describe("BugAttachmentUseCase", () => {
  let useCase: BugAttachmentUseCase;
  let mockBugRepository: MockProxy<IBugRepository>;
  let mockStorageService: MockProxy<IStorageService>;

  beforeEach(() => {
    mockBugRepository = mock<IBugRepository>();
    mockStorageService = mock<IStorageService>();
    useCase = new BugAttachmentUseCase(mockBugRepository, mockStorageService);
  });

  describe("addAttachment", () => {
    it("should add attachment successfully", async () => {
      const mockAttachment = {
        id: 1,
        filePath: "/uploads/file.png",
        fileType: "image/png",
        bugId: "bug-123",
      };
      mockBugRepository.createAttachment.mockResolvedValue(
        new ResponseModel<BugAttachment>("tx-1").withResponse(mockAttachment),
      );

      const req = new RequestModel("tx-1", {
        bugId: "bug-123",
        file: { filename: "file.png", mimetype: "image/png" },
      });

      const res = await useCase.addAttachment(req);

      expect(res.data).toBe(mockAttachment);
      expect(mockBugRepository.createAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            filePath: "/uploads/file.png",
            fileType: "image/png",
            bugId: "bug-123",
          }),
        }),
      );
    });
  });

  describe("deleteAttachment", () => {
    it("should delete attachment successfully and delete physical file", async () => {
      const mockAttachment: BugAttachment = {
        id: 1,
        filePath: "/uploads/file.png",
        fileType: "image/png",
        bugId: "bug-123",
      };
      mockBugRepository.findAttachmentById.mockResolvedValue(
        new ResponseModel<BugAttachment | null>("tx-1").withResponse(mockAttachment),
      );
      mockBugRepository.deleteAttachment.mockResolvedValue(new ResponseModel<void>("tx-1"));

      const req = new RequestModel("tx-1", "att-123");
      const res = await useCase.deleteAttachment(req);

      expect(res.errorCode).toBeUndefined();
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith("/uploads/file.png");
      expect(mockBugRepository.deleteAttachment).toHaveBeenCalledWith(req);
    });
  });

  describe("createNote", () => {
    it("should create note successfully", async () => {
      const mockNote = BugNote.builder()
        .setId(1)
        .setBugId("bug-123")
        .setBody("Test note body")
        .setCreatedAt(new Date())
        .build();
      mockBugRepository.createNote.mockResolvedValue(
        new ResponseModel<BugNote>("tx-1").withResponse(mockNote),
      );

      const req = new RequestModel("tx-1", { bugId: "bug-123", body: "Test note body" });
      const res = await useCase.createNote(req);

      expect(res.data).toBe(mockNote);
      expect(mockBugRepository.createNote).toHaveBeenCalledWith(req);
    });
  });
});
