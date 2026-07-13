import { Router, Request, Response, RequestHandler } from "express";
import { BugSubmissionUseCase } from "@src/Domain/Bug/UseCase/BugSubmissionUseCase";
import { BugLifecycleUseCase } from "@src/Domain/Bug/UseCase/BugLifecycleUseCase";
import { BugSyncUseCase } from "@src/Domain/Bug/UseCase/BugSyncUseCase";
import { BugQueryUseCase } from "@src/Domain/Bug/UseCase/BugQueryUseCase";
import { BugAttachmentUseCase } from "@src/Domain/Bug/UseCase/BugAttachmentUseCase";
import { BugFilter } from "@src/Domain/Bug/Entity/BugFilter";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import logger from "jet-logger";
import { validateSession, SessionUser } from "@variamosple/variamos-security";
import { mapDomainErrorToHttpStatus } from "./errorMapper";

/**
 * Factory function to create Bug Router with decoupled dependency injection
 */
export interface MulterUpload {
  single(fieldName: string): RequestHandler;
}

interface RequestWithUser extends Request {
  user: SessionUser;
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
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Get local bugs (Inbox)
  router.get("/local", authMiddleware, async (req: Request, res: Response) => {
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
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Get managed repositories
  router.get("/repos", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "queryBugRepos";
    try {
      const request = new RequestModel<void>(transactionId);
      const response = await bugQueryUseCase.queryBugRepos(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Get allowed categories
  router.get("/categories", async (req: Request, res: Response) => {
    const transactionId = "queryCategories";
    try {
      const request = new RequestModel<void>(transactionId);
      const response = await bugQueryUseCase.queryCategories(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Create a new bug
  router.post("/", upload.single("file"), async (req: Request, res: Response) => {
    const transactionId = "createBug";
    const { title, description, priority, category, githubRepo, reporterEmail } = req.body as {
      title?: string;
      description?: string;
      priority?: string;
      category?: string;
      githubRepo?: string;
      reporterEmail?: string;
    };
    let adminId: string | undefined = undefined;
    if ((req as RequestWithUser).user) {
      adminId = (req as RequestWithUser).user?.id;
    } else {
      const token =
        (req.cookies?.authToken as string | undefined) || req.headers.authorization?.split(" ")[1];
      logger.info(
        "POST /bugs: Extracted token: " + (token ? token.substring(0, 15) + "..." : "none"),
      );
      if (token) {
        try {
          const session = await validateSession(token);
          logger.info("POST /bugs: Session validation result: " + JSON.stringify(session));
          if (session && session.data) {
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
        createdById: adminId || undefined,
        reporterEmail: reporterEmail || undefined,
        file: req.file
          ? {
              filename: req.file.filename,
              mimetype: req.file.mimetype,
            }
          : null,
      };
      const request = new RequestModel<typeof payload>(transactionId, payload);
      const response = await bugSubmissionUseCase.createBug(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode, HttpStatusCodes.CREATED);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Get status log history
  router.get("/:id/history", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "queryHistory";
    const { id } = req.params;

    try {
      const request = new RequestModel<string>(transactionId, id);
      const response = await bugQueryUseCase.queryHistory(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Update status
  router.post("/:id/status", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "updateStatus";
    const { id } = req.params;
    const { status, comment, title, description, priority, category, githubRepo } = req.body as {
      status?: string;
      comment?: string;
      title?: string;
      description?: string;
      priority?: string;
      category?: string;
      githubRepo?: string;
    };
    const adminId = (req as RequestWithUser).user?.id || "";
    const adminEmail = (req as RequestWithUser).user?.email || "";

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
      const request = new RequestModel<typeof payload>(transactionId, payload);
      const response = await bugLifecycleUseCase.updateStatus(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Restore bug
  router.post("/:id/restore", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "restoreBug";
    const { id } = req.params;
    const adminId = (req as RequestWithUser).user?.id || "";

    try {
      const payload = { id, adminId };
      const request = new RequestModel<typeof payload>(transactionId, payload);
      const response = await bugLifecycleUseCase.restoreBug(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Reject bug
  router.post("/:id/reject", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "rejectBug";
    const { id } = req.params;
    const adminId = (req as RequestWithUser).user?.id || "";

    try {
      const payload = { id, adminId };
      const request = new RequestModel<typeof payload>(transactionId, payload);
      const response = await bugLifecycleUseCase.rejectBug(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Synchronize with GitHub
  router.post("/sync", authMiddleware, async (req: Request, res: Response) => {
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
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Add attachment to bug
  router.post(
    "/:id/attachments",
    authMiddleware,
    upload.single("file"),
    async (req: Request, res: Response) => {
      const transactionId = "addAttachment";
      const { id } = req.params;
      try {
        const payload = {
          bugId: id,
          file: req.file
            ? {
                filename: req.file.filename,
                mimetype: req.file.mimetype,
              }
            : null,
        };
        const request = new RequestModel<typeof payload>(transactionId, payload);
        const response = await bugAttachmentUseCase.addAttachment(request);
        const code = mapDomainErrorToHttpStatus(response.errorCode, HttpStatusCodes.CREATED);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
      }
    },
  );

  // Delete attachment
  router.delete("/attachments/:id", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "deleteAttachment";
    const { id } = req.params;
    try {
      const request = new RequestModel<string>(transactionId, id);
      const response = await bugAttachmentUseCase.deleteAttachment(request);
      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Create bug note
  router.post("/:id/notes", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "createBugNote";
    const { id } = req.params;
    const { body } = req.body as { body?: string };
    const authorId = (req as RequestWithUser).user?.id || "";

    try {
      const payload = { bugId: id, body: body || "", authorId };
      const request = new RequestModel(transactionId, payload);
      const response = await bugAttachmentUseCase.createNote(request);
      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  // Query bug notes
  router.get("/:id/notes", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "queryBugNotes";
    const { id } = req.params;

    try {
      const request = new RequestModel(transactionId, id);
      const response = await bugQueryUseCase.queryNotes(request);
      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: (error as Error).message });
    }
  });

  return router;
}

export const BUG_V1_ROUTE = "/bugs";
