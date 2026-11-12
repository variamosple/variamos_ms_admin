import { hasPermissions } from "@variamosple/variamos-security";
import type { Request, RequestHandler, Response, Router } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import {
  type BugPriorityValue,
  isBugPriority,
} from "#src/Domain/Bug/Entity/BugPriority.js";
import type { BugAttachmentUseCase } from "#src/Domain/Bug/UseCase/BugAttachmentUseCase.js";
import type { BugLifecycleUseCase } from "#src/Domain/Bug/UseCase/BugLifecycleUseCase.js";
import type { BugQueryUseCase } from "#src/Domain/Bug/UseCase/BugQueryUseCase.js";
import type { BugSyncUseCase } from "#src/Domain/Bug/UseCase/BugSyncUseCase.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { actorOf, signedInUser } from "./actor.js";
import { bugNoteBody, bugStatusBody } from "./adminRequestBodies.js";
import {
  acceptSingleFile,
  type BugRouterDependencies,
  toUploadedFile,
} from "./bugRouteSupport.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { checkedBody, validBody } from "./requestBody.js";

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

/** One bug followed up: history, status, synchronization, files and notes. */
export function addBugFollowUpRoutes(
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
