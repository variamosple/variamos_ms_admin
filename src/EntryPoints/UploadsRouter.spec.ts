import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import express from "express";
import request from "supertest";
import { createUploadsRouter } from "./UploadsRouter.js";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const PDF_BYTES = Buffer.from("%PDF-1.7\n");
const HTML_BYTES = Buffer.from("<html><script>alert(1)</script></html>");

describe("UploadsRouter", () => {
  let rootDir: string;
  let uploadsDir: string;
  let app: express.Application;

  const store = (name: string, content: Buffer) =>
    fs.writeFileSync(path.join(uploadsDir, name), content);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-router-"));
    uploadsDir = path.join(rootDir, "uploads");
    fs.mkdirSync(uploadsDir);
    fs.writeFileSync(path.join(rootDir, "secret.txt"), "outside uploads");
    app = express();
    app.use("/uploads", createUploadsRouter(uploadsDir));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it("shows an image inline with its detected type and safe headers", async () => {
    store("4b0c1a52-1111-4222-8333-944455556666.png", PNG_BYTES);

    const res = await request(app).get(
      "/uploads/4b0c1a52-1111-4222-8333-944455556666.png",
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["content-disposition"]).toBe("inline");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe(
      "default-src 'none'; sandbox",
    );
    expect(Buffer.from(res.body)).toEqual(PNG_BYTES);
  });

  it("downloads a PDF as an attachment", async () => {
    store("report.pdf", PDF_BYTES);

    const res = await request(app).get("/uploads/report.pdf");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="report.pdf"',
    );
  });

  it("downloads a text log as plain text", async () => {
    store("server.log", Buffer.from("ERROR boot failed"));

    const res = await request(app).get("/uploads/server.log");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="server.log"',
    );
  });

  it("never serves a legacy HTML upload as HTML", async () => {
    store("1697000000000-123456789.html", HTML_BYTES);

    const res = await request(app).get("/uploads/1697000000000-123456789.html");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("does not trust a legacy image extension when the content is not an image", async () => {
    store("1697000000000-987654321.png", HTML_BYTES);

    const res = await request(app).get("/uploads/1697000000000-987654321.png");

    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
  });

  it("downloads a legacy SVG instead of rendering it", async () => {
    store("drawing.svg", Buffer.from("<svg><script>alert(1)</script></svg>"));

    const res = await request(app).get("/uploads/drawing.svg");

    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
  });

  it("answers 404 for a missing file", async () => {
    const res = await request(app).get("/uploads/missing.png");

    expect(res.status).toBe(404);
  });

  // Encoded "../" and "/" that would leave the uploads directory once decoded
  const encodedDot = "%2E";
  const encodedSlash = "%2F";
  it.each([
    `${encodedDot}${encodedDot}${encodedSlash}secret.txt`,
    `..${encodedSlash}secret.txt`,
    `${encodedSlash}etc${encodedSlash}hosts`,
    ".hidden",
  ])("answers 404 for the unsafe name %s", async (name) => {
    store(".hidden", Buffer.from("dotfile"));

    const res = await request(app).get(`/uploads/${name}`);

    expect(res.status).toBe(404);
  });

  it("answers 404 for a directory", async () => {
    fs.mkdirSync(path.join(uploadsDir, "folder"));

    const res = await request(app).get("/uploads/folder");

    expect(res.status).toBe(404);
  });

  it("does not serve files outside the uploads directory", async () => {
    const res = await request(app).get("/uploads/../secret.txt");

    expect(res.status).toBe(404);
    expect(res.text).not.toContain("outside uploads");
  });
});
