import {
  hasPermissions,
  type SessionUser,
  validateSession,
} from "@variamosple/variamos-security";
import {
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import logger from "jet-logger";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { BugFilter } from "#src/Domain/Bug/Entity/BugFilter.js";
import type { BugAttachmentUseCase } from "#src/Domain/Bug/UseCase/BugAttachmentUseCase.js";
import type { BugLifecycleUseCase } from "#src/Domain/Bug/UseCase/BugLifecycleUseCase.js";
import type { BugQueryUseCase } from "#src/Domain/Bug/UseCase/BugQueryUseCase.js";
import type { BugSubmissionUseCase } from "#src/Domain/Bug/UseCase/BugSubmissionUseCase.js";
import type { BugSyncUseCase } from "#src/Domain/Bug/UseCase/BugSyncUseCase.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { MAX_ATTACHMENT_SIZE_BYTES } from "#src/Domain/Core/File/AllowedFileType.js";
import type { UploadedFile } from "#src/Domain/Core/File/UploadedFile.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";

/**
 * Factory function to create Bug Router with decoupled dependency injection
 */
export interface MulterUpload {
  single(fieldName: string): RequestHandler;
}

interface RequestWithUser extends Request {
  user: SessionUser;
}

const FILE_FIELD = "file";
const MAX_ATTACHMENT_SIZE_MB = MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024);

function isMulterError(error: unknown): error is { code?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "MulterError"
  );
}

/**
 * Runs the upload middleware and answers its limit errors itself: 413 for a
 * file over the size limit, 400 for any other upload error.
 */
function acceptSingleFile(
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

function toUploadedFile(file?: Express.Multer.File): UploadedFile | null {
  if (!file?.buffer) return null;
  return { content: file.buffer, originalName: file.originalname };
}

export function createBugRouter(
  bugSubmissionUseCase: BugSubmissionUseCase,
  bugLifecycleUseCase: BugLifecycleUseCase,
  bugSyncUseCase: BugSyncUseCase,
  bugQueryUseCase: BugQueryUseCase,
  bugAttachmentUseCase: BugAttachmentUseCase,
  upload: MulterUpload,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();

  // Get all bugs
  router.get("/", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "queryBugs";
    const { repo, status, priority, search } = req.query;
    try {
      const filter = new BugFilter(
        repo as string,
        status as string,
        priority as string,
        search as string,
      );
      const request = new RequestModel<BugFilter>(transactionId, filter);
      const response = await bugQueryUseCase.queryBugs(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json({ error: (error as Error).message });
    }
  });

  // Get local bugs (Inbox)
  router.get(
    "/local",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    async (req: Request, res: Response) => {
      const transactionId = "queryLocalBugs";
      const { repo, status, priority, search } = req.query;
      try {
        const filter = new BugFilter(
          repo as string,
          status as string,
          priority as string,
          search as string,
        );
        const request = new RequestModel<BugFilter>(transactionId, filter);
        const response = await bugQueryUseCase.queryLocalBugs(request);

        const code = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Get managed repositories
  router.get(
    "/repos",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    async (_req: Request, res: Response) => {
      const transactionId = "queryBugRepos";
      try {
        const request = new RequestModel<void>(transactionId);
        const response = await bugQueryUseCase.queryBugRepos(request);

        const code = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Get allowed categories
  router.get("/categories", async (_req: Request, res: Response) => {
    const transactionId = "queryCategories";
    try {
      const request = new RequestModel<void>(transactionId);
      const response = await bugQueryUseCase.queryCategories(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json({ error: (error as Error).message });
    }
  });

  // Create a new bug
  router.post(
    "/",
    acceptSingleFile(upload, "createBug"),
    async (req: Request, res: Response) => {
      const transactionId = "createBug";
      const {
        title,
        description,
        priority,
        category,
        githubRepo,
        reporterEmail,
      } = req.body as {
        title?: string;
        description?: string;
        priority?: string;
        category?: string;
        githubRepo?: string;
        reporterEmail?: string;
      };
      let adminId: string | undefined;
      if ((req as RequestWithUser).user) {
        adminId = (req as RequestWithUser).user.id;
      } else {
        const token =
          (req.cookies?.authToken as string | undefined) ||
          req.headers.authorization?.split(" ")[1];
        if (token) {
          try {
            const session = await validateSession(token);
            if (session?.data) {
              const sessionData = session.data as { id?: string; sub?: string };
              const resolvedId = sessionData.id || sessionData.sub;
              if (resolvedId) {
                adminId = resolvedId;
              }
            }
          } catch (e) {
            logger.err("POST /bugs: Error during session validation:");
            logger.err(e as Error);
          }
        }
      }

      // Without any session (user or guest), a bug can be reported but no
      // file can be attached.
      if (req.file && !adminId) {
        res
          .status(HttpStatusCodes.UNAUTHORIZED)
          .json(
            new ResponseModel(transactionId).withError(
              DomainErrorCodes.UNAUTHORIZED_ACCESS,
              "Sign in, or continue as a guest, to attach a file.",
            ),
          );
        return;
      }

      try {
        const validPriorities = ["low", "medium", "high"];
        const resolvedPriority = validPriorities.includes(priority || "")
          ? (priority as "low" | "medium" | "high")
          : "medium";

        const payload = {
          title: title || "",
          description: description || "",
          priority: resolvedPriority,
          category: category || "",
          githubRepo: githubRepo || undefined,
          createdById: adminId,
          reporterEmail: reporterEmail || undefined,
          file: toUploadedFile(req.file),
        };
        const request = new RequestModel<typeof payload>(
          transactionId,
          payload,
        );
        const response = await bugSubmissionUseCase.createBug(request);

        const code = mapDomainErrorToHttpStatus(
          response.errorCode,
          HttpStatusCodes.CREATED,
        );
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Get status log history
  router.get(
    "/:id/history",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    async (req: Request<{ id: string }>, res: Response) => {
      const transactionId = "queryHistory";
      const { id } = req.params;

      try {
        const request = new RequestModel<string>(transactionId, id);
        const response = await bugQueryUseCase.queryHistory(request);

        const code = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Update status
  router.post(
    "/:id/status",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    async (req: Request<{ id: string }>, res: Response) => {
      const transactionId = "updateStatus";
      const { id } = req.params;
      const {
        status,
        comment,
        title,
        description,
        priority,
        category,
        githubRepo,
      } = req.body as {
        status?: string;
        comment?: string;
        title?: string;
        description?: string;
        priority?: string;
        category?: string;
        githubRepo?: string;
      };
      const adminId = (req as RequestWithUser).user.id;
      const adminEmail = (req as RequestWithUser).user.email || "";

      try {
        const validPriorities = ["low", "medium", "high"];
        const resolvedPriority = validPriorities.includes(priority || "")
          ? (priority as "low" | "medium" | "high")
          : undefined;

        const payload = {
          id,
          status: status || "",
          comment: comment || undefined,
          adminId,
          adminEmail: adminEmail || undefined,
          title: title || undefined,
          description: description || undefined,
          priority: resolvedPriority,
          category: category || undefined,
          githubRepo: githubRepo || undefined,
        };
        const request = new RequestModel<typeof payload>(
          transactionId,
          payload,
        );
        const response = await bugLifecycleUseCase.updateStatus(request);

        const code = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Restore bug
  router.post(
    "/:id/restore",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    async (req: Request<{ id: string }>, res: Response) => {
      const transactionId = "restoreBug";
      const { id } = req.params;
      const adminId = (req as RequestWithUser).user.id;

      try {
        const payload = { id, adminId };
        const request = new RequestModel<typeof payload>(
          transactionId,
          payload,
        );
        const response = await bugLifecycleUseCase.restoreBug(request);

        const code = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Reject bug
  router.post(
    "/:id/reject",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    async (req: Request<{ id: string }>, res: Response) => {
      const transactionId = "rejectBug";
      const { id } = req.params;
      const adminId = (req as RequestWithUser).user.id;

      try {
        const payload = { id, adminId };
        const request = new RequestModel<typeof payload>(
          transactionId,
          payload,
        );
        const response = await bugLifecycleUseCase.rejectBug(request);

        const code = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Synchronize with GitHub
  router.post(
    "/sync",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    async (_req: Request, res: Response) => {
      const transactionId = "syncBugs";
      try {
        const request = new RequestModel<void>(transactionId);
        const response = await bugSyncUseCase.syncBugs(request);

        const code = mapDomainErrorToHttpStatus(response.errorCode);
        if (response.errorCode) {
          res.status(code).json({ error: response.message });
        } else {
          res.status(code).json({
            message: "GitHub bugs synchronization completed successfully.",
          });
        }
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Add attachment to bug
  router.post(
    "/:id/attachments",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    acceptSingleFile(upload, "addAttachment"),
    async (req: Request<{ id: string }>, res: Response) => {
      const transactionId = "addAttachment";
      const { id } = req.params;
      const file = toUploadedFile(req.file);
      if (!file) {
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: "File attachment is required." });
        return;
      }
      try {
        const payload = { bugId: id, file };
        const request = new RequestModel<typeof payload>(
          transactionId,
          payload,
        );
        const response = await bugAttachmentUseCase.addAttachment(request);
        const code = mapDomainErrorToHttpStatus(
          response.errorCode,
          HttpStatusCodes.CREATED,
        );
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Delete attachment
  router.delete(
    "/attachments/:id",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    async (req: Request<{ id: string }>, res: Response) => {
      const transactionId = "deleteAttachment";
      const { id } = req.params;
      try {
        const request = new RequestModel<string>(transactionId, id);
        const response = await bugAttachmentUseCase.deleteAttachment(request);
        const code = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Create bug note
  router.post(
    "/:id/notes",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    async (req: Request<{ id: string }>, res: Response) => {
      const transactionId = "createBugNote";
      const { id } = req.params;
      const { body } = req.body as { body?: string };
      const authorId = (req as RequestWithUser).user.id;

      try {
        const payload = { bugId: id, body: body || "", authorId };
        const request = new RequestModel(transactionId, payload);
        const response = await bugAttachmentUseCase.createNote(request);
        const code = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  // Query bug notes
  router.get(
    "/:id/notes",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    async (req: Request<{ id: string }>, res: Response) => {
      const transactionId = "queryBugNotes";
      const { id } = req.params;

      try {
        const request = new RequestModel(transactionId, id);
        const response = await bugQueryUseCase.queryNotes(request);
        const code = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ error: (error as Error).message });
      }
    },
  );

  return router;
}

export const BUG_V1_ROUTE = "/bugs";
