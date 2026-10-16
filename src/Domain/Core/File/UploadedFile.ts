/**
 * A file received from a client, before validation. Its declared name is only
 * a hint: the stored type is detected from the content.
 */
export interface UploadedFile {
  content: Uint8Array;
  originalName: string;
}
