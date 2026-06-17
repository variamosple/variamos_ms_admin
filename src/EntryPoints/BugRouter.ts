import { Router, Request, Response, RequestHandler } from "express";
import { BugUseCases } from "@src/Domain/Bug/BugUseCases";
import { BugFilter } from "@src/Domain/Bug/Entity/BugFilter";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import logger from "jet-logger";

/**
 * Maps semantic Domain error codes to standard HTTP Status codes
 */
function mapDomainErrorToHttp(
  errorCode?: string | number,
  defaultSuccessCode = HttpStatusCodes.OK,
): number {
  if (!errorCode) return defaultSuccessCode;

  switch (errorCode) {
    case "BAD_REQUEST":
    case 400:
      return HttpStatusCodes.BAD_REQUEST; // 400
    case "NOT_FOUND":
    case 404:
      return HttpStatusCodes.NOT_FOUND; // 404
    case "UNAUTHORIZED":
    case 401:
      return HttpStatusCodes.UNAUTHORIZED; // 401
    case "INTERNAL_ERROR":
    case 500:
      return HttpStatusCodes.INTERNAL_SERVER_ERROR; // 500
    default:
      return typeof errorCode === "number"
        ? errorCode
        : HttpStatusCodes.INTERNAL_SERVER_ERROR;
  }
}

/**
 * Factory function to create Bug Router with decoupled dependency injection
 */
export function createBugRouter(
  bugUseCases: BugUseCases,
  upload: any,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();

  // Get all bugs
  router.get("/", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "queryBugs";
    const { repo, status, priority } = req.query;
    try {
      const filter = new BugFilter(
        repo as string,
        status as string,
        priority as string,
      );
      const request = new RequestModel<BugFilter>(transactionId, filter);
      const response = await bugUseCases.queryBugs(request);

      const code = mapDomainErrorToHttp(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  });

  // Get local bugs (Inbox)
  // Get local bugs (Inbox)
  router.get("/local", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "queryLocalBugs";
    const { status, priority } = req.query;
    try {
      const filter = new BugFilter(
        undefined,
        status as string,
        priority as string,
      );
      const request = new RequestModel<BugFilter>(transactionId, filter);
      const response = await bugUseCases.queryLocalBugs(request);

      const code = mapDomainErrorToHttp(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  });

  // Get managed repositories
  router.get("/repos", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "queryBugRepos";
    try {
      const request = new RequestModel<void>(transactionId);
      const response = await bugUseCases.queryBugRepos(request);

      const code = mapDomainErrorToHttp(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  });

  // Create a new bug
  router.post(
    "/",
    upload.single("file"),
    async (req: Request, res: Response) => {
      const transactionId = "createBug";
      const {
        title,
        description,
        priority,
        category,
        githubRepo,
        reporterEmail,
      } = req.body;
      let adminId: string | undefined = undefined;
      if ((req as any).sessionUser) {
        adminId = (req as any).sessionUser.id;
      }

      try {
        const payload = {
          title,
          description,
          priority,
          category,
          githubRepo,
          createdById: adminId,
          reporterEmail,
          file: req.file,
        };
        const request = new RequestModel<typeof payload>(
          transactionId,
          payload,
        );
        const response = await bugUseCases.createBug(request);

        const code = mapDomainErrorToHttp(
          response.errorCode,
          HttpStatusCodes.CREATED,
        );
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
      }
    },
  );

  // Get status log history
  router.get(
    "/:id/history",
    authMiddleware,
    async (req: Request, res: Response) => {
      const transactionId = "queryHistory";
      const { id } = req.params;

      try {
        const request = new RequestModel<string>(transactionId, id);
        const response = await bugUseCases.queryHistory(request);

        const code = mapDomainErrorToHttp(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
      }
    },
  );

  // Update status
  router.post(
    "/:id/status",
    authMiddleware,
    async (req: Request, res: Response) => {
      const transactionId = "updateStatus";
      const { id } = req.params;
      const { status, comment } = req.body;
      const adminId = (req as any).sessionUser.id;

      try {
        const payload = { id, status, comment, adminId };
        const request = new RequestModel<typeof payload>(
          transactionId,
          payload,
        );
        const response = await bugUseCases.updateStatus(request);

        const code = mapDomainErrorToHttp(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
      }
    },
  );

  // Restore bug
  router.post(
    "/:id/restore",
    authMiddleware,
    async (req: Request, res: Response) => {
      const transactionId = "restoreBug";
      const { id } = req.params;
      const adminId = (req as any).sessionUser.id;

      try {
        const payload = { id, adminId };
        const request = new RequestModel<typeof payload>(
          transactionId,
          payload,
        );
        const response = await bugUseCases.restoreBug(request);

        const code = mapDomainErrorToHttp(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
      }
    },
  );

  // Reject bug
  router.post(
    "/:id/reject",
    authMiddleware,
    async (req: Request, res: Response) => {
      const transactionId = "rejectBug";
      const { id } = req.params;
      const adminId = (req as any).sessionUser.id;

      try {
        const payload = { id, adminId };
        const request = new RequestModel<typeof payload>(
          transactionId,
          payload,
        );
        const response = await bugUseCases.rejectBug(request);

        const code = mapDomainErrorToHttp(response.errorCode);
        res.status(code).json(response);
      } catch (error) {
        logger.err(error);
        res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
      }
    },
  );

  // Synchronize with GitHub
  router.post("/sync", authMiddleware, async (req: Request, res: Response) => {
    const transactionId = "syncBugs";
    try {
      const request = new RequestModel<void>(transactionId);
      const response = await bugUseCases.syncBugs(request);

      const code = mapDomainErrorToHttp(response.errorCode);
      if (response.errorCode) {
        res.status(code).json({ error: response.message });
      } else {
        res.status(code).json({
          message: "GitHub bugs synchronization completed successfully.",
        });
      }
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  });

  return router;
}

export const BUG_V1_ROUTE = "/bugs";
