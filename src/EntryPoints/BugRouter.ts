import { Router, Request, Response } from "express";
import { BugUseCases } from "@src/Domain/Bug/BugUseCases";
import { BugFilter } from "@src/Domain/Bug/Entity/BugFilter";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { isAuthenticated } from "@variamosple/variamos-security";
import multer from "multer";
import path from "path";
import logger from "jet-logger";
import { GitHubIssuesServiceInstance } from "@src/Infrastructure/GitHub/GitHubIssuesService";
import { DiskStorageServiceInstance } from "@src/Infrastructure/Storage/DiskStorageService";

import { GitHubBugRepositoryInstance } from "@src/DataProviders/Bug/GitHubBugRepository";
import { LocalBugRepositoryInstance } from "@src/DataProviders/Bug/LocalBugRepository";

const bugV1Router = Router();

const bugUseCases = new BugUseCases(
  GitHubIssuesServiceInstance,
  DiskStorageServiceInstance,
  GitHubBugRepositoryInstance,
  LocalBugRepositoryInstance,
);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, "../public/uploads"));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// Get all bugs
bugV1Router.get("/", isAuthenticated, async (req: Request, res: Response) => {
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

    const code = response.errorCode || HttpStatusCodes.OK;
    res.status(code).json(response);
  } catch (error) {
    logger.err(error);
    res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
  }
});

// Get local bugs (Inbox)
bugV1Router.get(
  "/local",
  isAuthenticated,
  async (req: Request, res: Response) => {
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

      const code = response.errorCode || HttpStatusCodes.OK;
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  },
);

// Get managed repositories
bugV1Router.get(
  "/repos",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const transactionId = "queryBugRepos";
    try {
      const request = new RequestModel<void>(transactionId);
      const response = await bugUseCases.queryBugRepos(request);

      const code = response.errorCode || HttpStatusCodes.OK;
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  },
);

// Create a new bug
bugV1Router.post(
  "/",
  isAuthenticated,
  upload.single("file"),
  async (req: Request, res: Response) => {
    const transactionId = "createBug";
    const { title, description, priority, category, githubRepo, reporterEmail } = req.body;
    const adminId = (req as any).sessionUser?.id; // Guest will have undefined adminId

    try {
      const payload = {
        title,
        description,
        priority,
        category,
        githubRepo,
        createdById: adminId || undefined,
        reporterEmail,
        file: req.file,
      };
      const request = new RequestModel<typeof payload>(transactionId, payload);
      const response = await bugUseCases.createBug(request);

      const code = response.errorCode || HttpStatusCodes.CREATED;
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  },
);

// Get status log history
bugV1Router.get(
  "/:id/history",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const transactionId = "queryHistory";
    const { id } = req.params;

    try {
      const request = new RequestModel<string>(transactionId, id);
      const response = await bugUseCases.queryHistory(request);

      const code = response.errorCode || HttpStatusCodes.OK;
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  },
);

// Update status
bugV1Router.post(
  "/:id/status",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const transactionId = "updateStatus";
    const { id } = req.params;
    const { status, comment } = req.body;
    const adminId = (req as any).sessionUser?.id || "default-admin-id";

    try {
      const payload = { id, status, comment, adminId };
      const request = new RequestModel<typeof payload>(transactionId, payload);
      const response = await bugUseCases.updateStatus(request);

      const code = response.errorCode || HttpStatusCodes.OK;
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  },
);

// Restore bug
bugV1Router.post(
  "/:id/restore",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const transactionId = "restoreBug";
    const { id } = req.params;
    const adminId = (req as any).sessionUser?.id || "default-admin-id";

    try {
      const payload = { id, adminId };
      const request = new RequestModel<typeof payload>(transactionId, payload);
      const response = await bugUseCases.restoreBug(request);

      const code = response.errorCode || HttpStatusCodes.OK;
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  },
);

// Reject bug
bugV1Router.post(
  "/:id/reject",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const transactionId = "rejectBug";
    const { id } = req.params;
    const adminId = (req as any).sessionUser?.id || "default-admin-id";

    try {
      const payload = { id, adminId };
      const request = new RequestModel<typeof payload>(transactionId, payload);
      const response = await bugUseCases.rejectBug(request);

      const code = response.errorCode || HttpStatusCodes.OK;
      res.status(code).json(response);
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  },
);

// Synchronize with GitHub
bugV1Router.post(
  "/sync",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const transactionId = "syncBugs";
    try {
      const request = new RequestModel<void>(transactionId);
      const response = await bugUseCases.syncBugs(request);

      const code = response.errorCode || HttpStatusCodes.OK;
      if (response.errorCode) {
        res.status(code).json({ error: response.message });
      } else {
        res
          .status(code)
          .json({
            message: "GitHub bugs synchronization completed successfully.",
          });
      }
    } catch (error) {
      logger.err(error);
      res.status(HttpStatusCodes.BAD_REQUEST).json({ error: error.message });
    }
  },
);

export const BUG_V1_ROUTE = "/bugs";
export default bugV1Router;
