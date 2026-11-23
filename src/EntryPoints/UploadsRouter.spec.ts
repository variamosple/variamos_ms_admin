import { generateKeyPairSync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  createJwt,
  initKeyStore,
  type SessionUser,
} from "@variamosple/variamos-security";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { createUploadsRouter } from "./UploadsRouter.js";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const PDF_BYTES = Buffer.from("%PDF-1.7\n");
const HTML_BYTES = Buffer.from("<html><script>alert(1)</script></html>");

const sessionOf = (permissions: string[]): SessionUser => ({
  id: "operator-1",
  name: "Operator",
  user: "operator",
  email: "operator@example.com",
  roles: [],
  permissions,
});

describe("UploadsRouter", () => {
  let keyDir: string;
  let operatorCookie: string;
  let otherAccountCookie: string;
  let rootDir: string;
  let uploadsDir: string;
  let app: express.Application;

  // A key pair of the test alone, read by the real session check
  beforeAll(async () => {
    keyDir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-router-keys-"));
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    fs.writeFileSync(path.join(keyDir, "private.pem"), privateKey);
    fs.writeFileSync(path.join(keyDir, "public.pem"), publicKey);
    vi.stubEnv("VARIAMOS_PRIVATE_KEY_PATH", path.join(keyDir, "private.pem"));
    vi.stubEnv("VARIAMOS_PUBLIC_KEY_PATH", path.join(keyDir, "public.pem"));
    // Tokens of a quarter of an hour, whatever the test environment sets
    vi.stubEnv("VARIAMOS_JWT_EXP_IN_SECONDS", "900");
    await initKeyStore();
    // Signed here: the environment stubs are undone after each test
    operatorCookie = `authToken=${await createJwt(sessionOf(["bugs::query"]))}`;
    otherAccountCookie = `authToken=${await createJwt(sessionOf(["my-account::query"]))}`;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    fs.rmSync(keyDir, { recursive: true, force: true });
  });

  // Every file test below reads as an operator of the bug reports
  const asOperator = (url: string) =>
    request(app).get(url).set("Cookie", operatorCookie);

  const store = (name: string, content: Buffer) =>
    fs.writeFileSync(path.join(uploadsDir, name), content);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-router-"));
    uploadsDir = path.join(rootDir, "uploads");
    fs.mkdirSync(uploadsDir);
    fs.writeFileSync(path.join(rootDir, "secret.txt"), "outside uploads");
    app = express();
    app.use(cookieParser());
    app.use("/uploads", createUploadsRouter(uploadsDir));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  describe("who may read an attachment (ADM-N54)", () => {
    const name = "4b0c1a52-1111-4222-8333-944455556666.png";

    it("refuses a visitor without a session", async () => {
      store(name, PNG_BYTES);

      const res = await request(app).get(`/uploads/${name}`);

      expect(res.status).toBe(401);
      expect(res.headers["content-type"]).not.toContain("image/png");
    });

    it("refuses a session without the permission of the bug reports", async () => {
      store(name, PNG_BYTES);

      const res = await request(app)
        .get(`/uploads/${name}`)
        .set("Cookie", otherAccountCookie);

      expect(res.status).toBe(403);
    });

    it("refuses a forged token", async () => {
      store(name, PNG_BYTES);

      const res = await request(app)
        .get(`/uploads/${name}`)
        .set("Cookie", "authToken=not.a.token");

      expect(res.status).toBe(401);
    });

    it("serves the file to an operator of the bug reports", async () => {
      store(name, PNG_BYTES);

      const res = await asOperator(`/uploads/${name}`);

      expect(res.status).toBe(200);
    });
  });

  it("shows an image inline with its detected type and safe headers", async () => {
    store("4b0c1a52-1111-4222-8333-944455556666.png", PNG_BYTES);

    const res = await asOperator(
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

    const res = await asOperator("/uploads/report.pdf");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="report.pdf"',
    );
  });

  it("downloads a text log as plain text", async () => {
    store("server.log", Buffer.from("ERROR boot failed"));

    const res = await asOperator("/uploads/server.log");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="server.log"',
    );
  });

  it("never serves a legacy HTML upload as HTML", async () => {
    store("1697000000000-123456789.html", HTML_BYTES);

    const res = await asOperator("/uploads/1697000000000-123456789.html");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("does not trust a legacy image extension when the content is not an image", async () => {
    store("1697000000000-987654321.png", HTML_BYTES);

    const res = await asOperator("/uploads/1697000000000-987654321.png");

    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
  });

  it("downloads a legacy SVG instead of rendering it", async () => {
    store("drawing.svg", Buffer.from("<svg><script>alert(1)</script></svg>"));

    const res = await asOperator("/uploads/drawing.svg");

    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
  });

  it("answers 404 for a missing file", async () => {
    const res = await asOperator("/uploads/missing.png");

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

    const res = await asOperator(`/uploads/${name}`);

    expect(res.status).toBe(404);
  });

  it("answers 404 for a directory", async () => {
    fs.mkdirSync(path.join(uploadsDir, "folder"));

    const res = await asOperator("/uploads/folder");

    expect(res.status).toBe(404);
  });

  it("does not serve files outside the uploads directory", async () => {
    const res = await asOperator("/uploads/../secret.txt");

    expect(res.status).toBe(404);
    expect(res.text).not.toContain("outside uploads");
  });
});
