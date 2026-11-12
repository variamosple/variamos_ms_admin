import {
  hasPermissions,
  validateSession,
} from "@variamosple/variamos-security";
import {
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import logger from "#src/common/logger.js";
import { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import { BugFilter } from "#src/Domain/Bug/Entity/BugFilter.js";
import {
  type BugPriorityValue,
  isBugPriority,
} from "#src/Domain/Bug/Entity/BugPriority.js";
import type { BugAssignmentUseCase } from "#src/Domain/Bug/UseCase/BugAssignmentUseCase.js";
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
import { fieldOf } from "#src/Domain/Core/Value/fieldOf.js";
import { actorOf, signedInUser } from "./actor.js";
import {
  bugCreateBody,
  bugNoteBody,
  bugStatusBody,
} from "./adminRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { queryText } from "./queryText.js";
import { checkedBody, validBody } from "./requestBody.js";

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

/** A list of account ids, each a non-empty string. */
const isAccountIdList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((id) => typeof id === "string" && id.length > 0);

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

/**
 * Reporter e-mails are personal data: only moderators (bugs::update) see
 * them in the lists; the name stays (SEC-BE-10).
 */
function maskReporterEmails(
  req: Request,
  bugs: Bug[] | null | undefined,
): Bug[] | null | undefined {
  const permissions = req.user?.permissions ?? [];
  if (!bugs || permissions.includes("bugs::update")) return bugs;
  return bugs.map(
    (bug) =>
      // Rebuilt as the repository builds it, so that the copy stays a Bug
      new Bug(
        Object.assign(Bug.builder(), bug, {
          reporterEmail: undefined,
          createdBy: bug.createdBy && { ...bug.createdBy, email: undefined },
          updatedBy: bug.updatedBy && { ...bug.updatedBy, email: undefined },
        }),
      ),
  );
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** The page of a bug list, or null when the query string asks for none valid. */
function pageOf(
  query: Request["query"],
): { pageNumber: number; pageSize: number } | null {
  const read = (value: unknown, fallback: number, max: number) => {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return typeof value === "string" &&
      Number.isInteger(parsed) &&
      parsed >= 1 &&
      parsed <= max
      ? parsed
      : null;
  };
  const pageNumber = read(query.pageNumber, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = read(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return pageNumber === null || pageSize === null
    ? null
    : { pageNumber, pageSize };
}

function sendInvalidPage(res: Response, transactionId: string): void {
  res
    .status(HttpStatusCodes.BAD_REQUEST)
    .json(
      new ResponseModel(transactionId).withError(
        DomainErrorCodes.INVALID_INPUT,
        `pageNumber and pageSize are whole numbers from 1, pageSize at most ${MAX_PAGE_SIZE}.`,
      ),
    );
}

const queryBugs =
  (bugQueryUseCase: BugQueryUseCase): RequestHandler =>
  async (req: Request, res: Response) => {
    const transactionId = "queryBugs";
    const page = pageOf(req.query);
    if (!page) {
      sendInvalidPage(res, transactionId);
      return;
    }
    const { repo, status, priority, search, assignee, component } = req.query;
    try {
      const filter = new BugFilter({
        repo: queryText(repo),
        status: queryText(status),
        priority: queryText(priority),
        search: queryText(search),
        assigneeId:
          typeof assignee === "string" && assignee ? assignee : undefined,
        component: queryText(component),
        pageNumber: page.pageNumber,
        pageSize: page.pageSize,
      });
      const request = new RequestModel<BugFilter>(transactionId, filter);
      const response = await bugQueryUseCase.queryBugs(request);
      response.data = maskReporterEmails(req, response.data);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const queryLocalBugs =
  (bugQueryUseCase: BugQueryUseCase): RequestHandler =>
  async (req: Request, res: Response) => {
    const transactionId = "queryLocalBugs";
    const page = pageOf(req.query);
    if (!page) {
      sendInvalidPage(res, transactionId);
      return;
    }
    const { repo, status, priority, search, component } = req.query;
    try {
      const filter = new BugFilter({
        repo: queryText(repo),
        status: queryText(status),
        priority: queryText(priority),
        search: queryText(search),
        component: queryText(component),
        pageNumber: page.pageNumber,
        pageSize: page.pageSize,
      });
      const request = new RequestModel<BugFilter>(transactionId, filter);
      const response = await bugQueryUseCase.queryLocalBugs(request);
      response.data = maskReporterEmails(req, response.data);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const queryAssignableUsers =
  (bugAssignmentUseCase: BugAssignmentUseCase): RequestHandler =>
  async (_req: Request, res: Response) => {
    const transactionId = "queryAssignableUsers";
    try {
      const response = await bugAssignmentUseCase.queryAssignableUsers(
        new RequestModel<void>(transactionId),
      );
      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const setBugAssignees =
  (
    bugAssignmentUseCase: BugAssignmentUseCase,
  ): RequestHandler<{ id: string }> =>
  async (req: Request<{ id: string }>, res: Response) => {
    const transactionId = "setBugAssignees";
    const userIds: unknown = fieldOf(req.body, "userIds");
    if (!isAccountIdList(userIds)) {
      const response = new ResponseModel(transactionId).withError(
        DomainErrorCodes.INVALID_INPUT,
        "userIds must be a list of account ids.",
      );
      res.status(mapDomainErrorToHttpStatus(response.errorCode)).json(response);
      return;
    }
    try {
      const response = await bugAssignmentUseCase.setAssignees(
        new RequestModel(
          transactionId,
          { bugId: req.params.id, userIds },
          actorOf(req),
        ),
      );
      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const queryBugRepos =
  (bugQueryUseCase: BugQueryUseCase): RequestHandler =>
  async (_req: Request, res: Response) => {
    const transactionId = "queryBugRepos";
    try {
      const request = new RequestModel<void>(transactionId);
      const response = await bugQueryUseCase.queryBugRepos(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const queryCategories =
  (bugQueryUseCase: BugQueryUseCase): RequestHandler =>
  async (_req: Request, res: Response) => {
    const transactionId = "queryCategories";
    try {
      const request = new RequestModel<void>(transactionId);
      const response = await bugQueryUseCase.queryCategories(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

/**
 * The account of the reporter: the signed-in user, else the one a session
 * token names; undefined for a visitor without a session.
 */
async function reporterIdOf(req: Request): Promise<string | undefined> {
  if (req.user) return req.user.id;
  const token =
    queryText(req.cookies?.authToken) ||
    req.headers.authorization?.split(" ")[1];
  if (!token) return undefined;
  try {
    const session = await validateSession(token);
    // createJwt writes the account id in sub, and only there
    return session?.data?.sub || undefined;
  } catch (e) {
    logger.err("POST /bugs: Error during session validation:");
    logger.err(e);
    return undefined;
  }
}

const createBug =
  (bugSubmissionUseCase: BugSubmissionUseCase): RequestHandler =>
  async (req: Request, res: Response) => {
    const transactionId = "createBug";
    const {
      title,
      description,
      priority,
      category,
      component,
      githubRepo,
      reporterEmail,
    } = checkedBody(bugCreateBody, req);
    const adminId = await reporterIdOf(req);

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
      const resolvedPriority: BugPriorityValue =
        priority && isBugPriority(priority) ? priority : "medium";

      const payload = {
        title: title || "",
        description: description || "",
        priority: resolvedPriority,
        category: category || "",
        component: component || undefined,
        githubRepo: githubRepo || undefined,
        createdById: adminId,
        reporterEmail: reporterEmail || undefined,
        file: toUploadedFile(req.file),
      };
      const request = new RequestModel<typeof payload>(transactionId, payload);
      const response = await bugSubmissionUseCase.createBug(request);

      const code = mapDomainErrorToHttpStatus(
        response.errorCode,
        HttpStatusCodes.CREATED,
      );
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const queryHistory =
  (bugQueryUseCase: BugQueryUseCase): RequestHandler<{ id: string }> =>
  async (req: Request<{ id: string }>, res: Response) => {
    const transactionId = "queryHistory";
    const { id } = req.params;

    try {
      const request = new RequestModel<string>(transactionId, id);
      const response = await bugQueryUseCase.queryHistory(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const updateStatus =
  (bugLifecycleUseCase: BugLifecycleUseCase): RequestHandler<{ id: string }> =>
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
      component,
      githubRepo,
    } = checkedBody(bugStatusBody, req);
    const adminId = signedInUser(req).id;

    try {
      const resolvedPriority: BugPriorityValue | undefined =
        priority && isBugPriority(priority) ? priority : undefined;

      const payload = {
        id,
        status: status || "",
        comment: comment || undefined,
        adminId,
        title: title || undefined,
        description: description || undefined,
        priority: resolvedPriority,
        category: category || undefined,
        component: component || undefined,
        githubRepo: githubRepo || undefined,
      };
      const request = new RequestModel<typeof payload>(transactionId, payload);
      const response = await bugLifecycleUseCase.updateStatus(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const restoreBug =
  (bugLifecycleUseCase: BugLifecycleUseCase): RequestHandler<{ id: string }> =>
  async (req: Request<{ id: string }>, res: Response) => {
    const transactionId = "restoreBug";
    const { id } = req.params;
    const adminId = signedInUser(req).id;

    try {
      const payload = { id, adminId };
      const request = new RequestModel<typeof payload>(
        transactionId,
        payload,
        actorOf(req),
      );
      const response = await bugLifecycleUseCase.restoreBug(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const rejectBug =
  (bugLifecycleUseCase: BugLifecycleUseCase): RequestHandler<{ id: string }> =>
  async (req: Request<{ id: string }>, res: Response) => {
    const transactionId = "rejectBug";
    const { id } = req.params;
    const adminId = signedInUser(req).id;

    try {
      const payload = { id, adminId };
      const request = new RequestModel<typeof payload>(
        transactionId,
        payload,
        actorOf(req),
      );
      const response = await bugLifecycleUseCase.rejectBug(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const syncBugs =
  (bugSyncUseCase: BugSyncUseCase): RequestHandler =>
  async (req: Request, res: Response) => {
    const transactionId = "syncBugs";
    try {
      const request = new RequestModel<void>(
        transactionId,
        undefined,
        actorOf(req),
      );
      const response = await bugSyncUseCase.syncBugs(request);

      const code = mapDomainErrorToHttpStatus(response.errorCode);
      if (response.errorCode) {
        res.status(code).json(response);
      } else {
        res.status(code).json(
          new ResponseModel<void>(transactionId, {
            message: "GitHub bugs synchronization completed successfully.",
          }),
        );
      }
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const addAttachment =
  (
    bugAttachmentUseCase: BugAttachmentUseCase,
  ): RequestHandler<{ id: string }> =>
  async (req: Request<{ id: string }>, res: Response) => {
    const transactionId = "addAttachment";
    const { id } = req.params;
    const file = toUploadedFile(req.file);
    if (!file) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel(transactionId).withError(
            DomainErrorCodes.INVALID_INPUT,
            "File attachment is required.",
          ),
        );
      return;
    }
    try {
      const payload = { bugId: id, file };
      const request = new RequestModel<typeof payload>(
        transactionId,
        payload,
        actorOf(req),
      );
      const response = await bugAttachmentUseCase.addAttachment(request);
      const code = mapDomainErrorToHttpStatus(
        response.errorCode,
        HttpStatusCodes.CREATED,
      );
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const deleteAttachment =
  (
    bugAttachmentUseCase: BugAttachmentUseCase,
  ): RequestHandler<{ id: string }> =>
  async (req: Request<{ id: string }>, res: Response) => {
    const transactionId = "deleteAttachment";
    const { id } = req.params;
    try {
      const request = new RequestModel<string>(transactionId, id, actorOf(req));
      const response = await bugAttachmentUseCase.deleteAttachment(request);
      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const createBugNote =
  (
    bugAttachmentUseCase: BugAttachmentUseCase,
  ): RequestHandler<{ id: string }> =>
  async (req: Request<{ id: string }>, res: Response) => {
    const transactionId = "createBugNote";
    const { id } = req.params;
    const { body } = checkedBody(bugNoteBody, req);
    const authorId = signedInUser(req).id;

    try {
      const payload = { bugId: id, body: body || "", authorId };
      const request = new RequestModel(transactionId, payload, authorId);
      const response = await bugAttachmentUseCase.createNote(request);
      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const queryBugNotes =
  (bugQueryUseCase: BugQueryUseCase): RequestHandler<{ id: string }> =>
  async (req: Request<{ id: string }>, res: Response) => {
    const transactionId = "queryBugNotes";
    const { id } = req.params;

    try {
      const request = new RequestModel(transactionId, id);
      const response = await bugQueryUseCase.queryNotes(request);
      const code = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(code).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

/** The lists of bugs, their assignment, and the report form. */
function addBugListRoutes(
  router: Router,
  dependencies: BugRouterDependencies,
): void {
  const {
    bugSubmissionUseCase,
    bugQueryUseCase,
    upload,
    authMiddleware,
    bugAssignmentUseCase,
  } = dependencies;
  // Get all bugs
  router.get(
    "/",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    queryBugs(bugQueryUseCase),
  );

  // Get local bugs (Inbox)
  router.get(
    "/local",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    queryLocalBugs(bugQueryUseCase),
  );

  // Administrators a bug can be assigned to
  router.get(
    "/assignable-users",
    authMiddleware,
    hasPermissions(["bugs::update"]),
    queryAssignableUsers(bugAssignmentUseCase),
  );

  // Replace the administrators assigned to a bug
  router.put(
    "/:id/assignees",
    authMiddleware,
    hasPermissions(["bugs::update"]),
    setBugAssignees(bugAssignmentUseCase),
  );

  // Get managed repositories
  router.get(
    "/repos",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    queryBugRepos(bugQueryUseCase),
  );

  // Get allowed categories
  router.get("/categories", queryCategories(bugQueryUseCase));

  // Create a new bug
  router.post(
    "/",
    acceptSingleFile(upload, "createBug"),
    validBody(bugCreateBody, "createBug"),
    createBug(bugSubmissionUseCase),
  );
}

/** One bug followed up: history, status, synchronization, files and notes. */
function addBugFollowUpRoutes(
  router: Router,
  dependencies: BugRouterDependencies,
): void {
  const {
    bugLifecycleUseCase,
    bugSyncUseCase,
    bugQueryUseCase,
    bugAttachmentUseCase,
    upload,
    authMiddleware,
  } = dependencies;
  // Get status log history
  router.get(
    "/:id/history",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    queryHistory(bugQueryUseCase),
  );

  // Update status
  router.post(
    "/:id/status",
    authMiddleware,
    hasPermissions(["bugs::update"]),
    validBody(bugStatusBody, "updateStatus"),
    updateStatus(bugLifecycleUseCase),
  );

  // Restore bug
  router.post(
    "/:id/restore",
    authMiddleware,
    hasPermissions(["bugs::update"]),
    restoreBug(bugLifecycleUseCase),
  );

  // Reject bug
  router.post(
    "/:id/reject",
    authMiddleware,
    hasPermissions(["bugs::update"]),
    rejectBug(bugLifecycleUseCase),
  );

  // Synchronize with GitHub
  router.post(
    "/sync",
    authMiddleware,
    hasPermissions(["bugs::sync"]),
    syncBugs(bugSyncUseCase),
  );

  // Add attachment to bug
  router.post(
    "/:id/attachments",
    authMiddleware,
    hasPermissions(["bugs::update"]),
    acceptSingleFile(upload, "addAttachment"),
    addAttachment(bugAttachmentUseCase),
  );

  // Delete attachment
  router.delete(
    "/attachments/:id",
    authMiddleware,
    hasPermissions(["bugs::update"]),
    deleteAttachment(bugAttachmentUseCase),
  );

  // Create bug note
  router.post(
    "/:id/notes",
    authMiddleware,
    hasPermissions(["bugs::update"]),
    validBody(bugNoteBody, "createBugNote"),
    createBugNote(bugAttachmentUseCase),
  );

  // Query bug notes
  router.get(
    "/:id/notes",
    authMiddleware,
    hasPermissions(["bugs::query"]),
    queryBugNotes(bugQueryUseCase),
  );
}

export function createBugRouter(dependencies: BugRouterDependencies): Router {
  const router = Router();
  addBugListRoutes(router, dependencies);
  addBugFollowUpRoutes(router, dependencies);
  return router;
}

export const BUG_V1_ROUTE = "/bugs";
