import { open, stat } from "node:fs/promises";
import path from "node:path";
import { type Request, type Response, Router } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { detectAllowedFileType } from "#src/Domain/Core/File/AllowedFileType.js";

/**
 * Serves uploaded bug attachments.
 *
 * The response type comes from the file content, never from its name alone:
 * files stored before uploads were validated may carry a client-chosen
 * extension (`.html`, `.svg`). Only detected images are shown inline; any
 * other file is downloaded, and nothing is ever served as HTML or script.
 */

// Generated names (`<uuid>.<ext>`) and legacy names (`<timestamp>-<random>.<ext>`)
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SIGNATURE_LENGTH = 16;
const TEXT_EXTENSIONS = new Set(["txt", "log"]);

interface ServedType {
  contentType: string;
  inline: boolean;
}

async function readHead(filePath: string): Promise<Uint8Array> {
  const handle = await open(filePath, "r");
  try {
    const head = new Uint8Array(SIGNATURE_LENGTH);
    const { bytesRead } = await handle.read(head, 0, SIGNATURE_LENGTH, 0);
    return head.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function servedType(head: Uint8Array, name: string): ServedType {
  // An empty name never matches the text types: only signatures count here
  const detected = detectAllowedFileType(head, "");
  if (detected) {
    return { contentType: detected.mimeType, inline: detected.isImage };
  }
  const extension = path.extname(name).slice(1).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) {
    return { contentType: "text/plain; charset=utf-8", inline: false };
  }
  return { contentType: "application/octet-stream", inline: false };
}

function serveUpload(uploadsDir: string) {
  return async (req: Request<{ name: string }>, res: Response) => {
    const { name } = req.params;
    if (!SAFE_NAME.test(name) || name.includes("..")) {
      res.sendStatus(HttpStatusCodes.NOT_FOUND);
      return;
    }
    const filePath = path.join(uploadsDir, name);

    let type: ServedType;
    try {
      const info = await stat(filePath);
      if (!info.isFile()) {
        res.sendStatus(HttpStatusCodes.NOT_FOUND);
        return;
      }
      type = servedType(await readHead(filePath), name);
    } catch {
      res.sendStatus(HttpStatusCodes.NOT_FOUND);
      return;
    }

    res.setHeader("Content-Type", type.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader(
      "Content-Disposition",
      type.inline ? "inline" : `attachment; filename="${name}"`,
    );
    res.sendFile(name, { root: uploadsDir, dotfiles: "deny" }, (error) => {
      if (error && !res.headersSent) {
        res.sendStatus(HttpStatusCodes.NOT_FOUND);
      }
    });
  };
}

export function createUploadsRouter(uploadsDir: string): Router {
  const router = Router();
  router.get("/:name", serveUpload(uploadsDir));
  return router;
}
