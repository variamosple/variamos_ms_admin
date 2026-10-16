/**
 * Attachment file types accepted by the bug tracker.
 *
 * The type is detected from the file content (signature, or valid text for
 * logs), never from the name or MIME type declared by the client. The stored
 * extension and the served Content-Type come from this list only.
 */
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

export interface AllowedFileType {
  readonly mimeType: string;
  readonly extension: string;
  readonly isImage: boolean;
}

export const PNG: AllowedFileType = {
  mimeType: "image/png",
  extension: "png",
  isImage: true,
};
export const JPEG: AllowedFileType = {
  mimeType: "image/jpeg",
  extension: "jpg",
  isImage: true,
};
export const GIF: AllowedFileType = {
  mimeType: "image/gif",
  extension: "gif",
  isImage: true,
};
export const WEBP: AllowedFileType = {
  mimeType: "image/webp",
  extension: "webp",
  isImage: true,
};
export const PDF: AllowedFileType = {
  mimeType: "application/pdf",
  extension: "pdf",
  isImage: false,
};
export const TEXT: AllowedFileType = {
  mimeType: "text/plain",
  extension: "txt",
  isImage: false,
};
export const LOG: AllowedFileType = {
  mimeType: "text/plain",
  extension: "log",
  isImage: false,
};

export const ALLOWED_FILE_TYPES: readonly AllowedFileType[] = [
  PNG,
  JPEG,
  GIF,
  WEBP,
  PDF,
  TEXT,
  LOG,
];

export const ALLOWED_FILE_TYPES_LABEL = "PNG, JPEG, GIF, WebP, PDF, TXT, LOG";

const TEXT_EXTENSIONS: Record<string, AllowedFileType> = {
  txt: TEXT,
  log: LOG,
};

function startsWith(content: Uint8Array, signature: readonly number[]) {
  if (content.length < signature.length) return false;
  return signature.every((byte, index) => content[index] === byte);
}

function asciiAt(content: Uint8Array, offset: number, text: string) {
  if (content.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (content[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function detectBinaryType(content: Uint8Array): AllowedFileType | null {
  if (startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return PNG;
  }
  if (startsWith(content, [0xff, 0xd8, 0xff])) return JPEG;
  if (asciiAt(content, 0, "GIF87a") || asciiAt(content, 0, "GIF89a")) {
    return GIF;
  }
  if (asciiAt(content, 0, "RIFF") && asciiAt(content, 8, "WEBP")) return WEBP;
  if (asciiAt(content, 0, "%PDF-")) return PDF;
  return null;
}

function isPlainText(content: Uint8Array): boolean {
  if (content.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
    return true;
  } catch {
    return false;
  }
}

function declaredExtension(declaredName: string): string {
  const dot = declaredName.lastIndexOf(".");
  return dot === -1 ? "" : declaredName.slice(dot + 1).toLowerCase();
}

/**
 * Returns the allowed type of a file, or null when the file must be refused.
 * Binary types are detected by their signature, whatever the declared name.
 * Text is accepted only for a `.txt` or `.log` name and valid UTF-8 content.
 */
export function detectAllowedFileType(
  content: Uint8Array,
  declaredName: string,
): AllowedFileType | null {
  if (content.length === 0) return null;
  const binaryType = detectBinaryType(content);
  if (binaryType) return binaryType;
  const textType = TEXT_EXTENSIONS[declaredExtension(declaredName)];
  if (textType && isPlainText(content)) return textType;
  return null;
}
