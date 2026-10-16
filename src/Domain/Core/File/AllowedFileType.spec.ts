import {
  detectAllowedFileType,
  GIF,
  JPEG,
  LOG,
  PDF,
  PNG,
  TEXT,
  WEBP,
} from "./AllowedFileType.js";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

const PNG_BYTES = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const JPEG_BYTES = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00);
const GIF_BYTES = ascii("GIF89a....");
const WEBP_BYTES = new Uint8Array([
  ...ascii("RIFF"),
  0x00,
  0x00,
  0x00,
  0x00,
  ...ascii("WEBP"),
  ...ascii("VP8 "),
]);
const PDF_BYTES = ascii("%PDF-1.7\n");

describe("detectAllowedFileType", () => {
  it.each([
    ["PNG", PNG_BYTES, PNG],
    ["JPEG", JPEG_BYTES, JPEG],
    ["GIF87a", ascii("GIF87a...."), GIF],
    ["GIF89a", GIF_BYTES, GIF],
    ["WebP", WEBP_BYTES, WEBP],
    ["PDF", PDF_BYTES, PDF],
  ])("detects %s by its signature", (_label, content, expected) => {
    expect(detectAllowedFileType(content, "upload.bin")).toBe(expected);
  });

  it("uses the content, not the declared name, for binary files", () => {
    expect(detectAllowedFileType(PNG_BYTES, "report.pdf")).toBe(PNG);
    expect(detectAllowedFileType(PNG_BYTES, "notes.txt")).toBe(PNG);
  });

  it("refuses an HTML file renamed as an image", () => {
    expect(
      detectAllowedFileType(ascii("<html><script></script></html>"), "a.png"),
    ).toBeNull();
  });

  it("refuses SVG images", () => {
    expect(
      detectAllowedFileType(
        ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        "image.svg",
      ),
    ).toBeNull();
  });

  it("accepts UTF-8 text for .txt and .log names, case-insensitively", () => {
    expect(detectAllowedFileType(ascii("line 1\nline é"), "notes.txt")).toBe(
      TEXT,
    );
    expect(detectAllowedFileType(ascii("ERROR boot"), "server.LOG")).toBe(LOG);
  });

  it("refuses text under any other name", () => {
    expect(detectAllowedFileType(ascii("plain text"), "script.js")).toBeNull();
    expect(detectAllowedFileType(ascii("plain text"), "README")).toBeNull();
  });

  it("refuses binary content named as text", () => {
    expect(
      detectAllowedFileType(bytes(0x41, 0x00, 0x42), "dump.log"),
    ).toBeNull();
    expect(detectAllowedFileType(bytes(0xc3, 0x28), "invalid.txt")).toBeNull();
  });

  it("refuses an empty file", () => {
    expect(detectAllowedFileType(new Uint8Array(0), "empty.txt")).toBeNull();
  });

  it("refuses a truncated signature", () => {
    expect(detectAllowedFileType(bytes(0x89, 0x50, 0x4e), "a.png")).toBeNull();
    expect(detectAllowedFileType(ascii("RIFF1234"), "a.webp")).toBeNull();
  });
});
