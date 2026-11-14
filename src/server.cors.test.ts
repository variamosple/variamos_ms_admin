import { Router } from "express";
import request from "supertest";
import EnvVars from "#src/common/EnvVars.js";
import { createServer } from "./server.js";

/** CORS headers by origin, with the exact list (EV-75). */
describe("createServer CORS", () => {
  const routes = Router();
  routes.get("/ping", (_req, res) => {
    res.json({ ok: true });
  });
  const app = createServer(routes);
  const original = EnvVars.CORS.AllowedOrigins;

  beforeAll(() => {
    Object.defineProperty(EnvVars.CORS, "AllowedOrigins", {
      value: ["https://app.variamos.com"],
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(EnvVars.CORS, "AllowedOrigins", {
      value: original,
      configurable: true,
    });
  });

  it("allows a listed origin with the session cookie", async () => {
    const res = await request(app)
      .get("/ping")
      .set("Origin", "https://app.variamos.com");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://app.variamos.com",
    );
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("refuses an origin that only starts like a listed one", async () => {
    const res = await request(app)
      .get("/ping")
      .set("Origin", "https://app.variamos.com.evil.example");

    expect(res.status).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("serves the origin null without CORS headers", async () => {
    const res = await request(app).get("/ping").set("Origin", "null");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("serves a request without Origin", async () => {
    const res = await request(app).get("/ping");

    expect(res.status).toBe(200);
  });
});
