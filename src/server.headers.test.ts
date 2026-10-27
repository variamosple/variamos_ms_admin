import { Router } from "express";
import request from "supertest";
import { createServer } from "./server.js";

/** Security headers in every environment, here the tests (EV-75 lot 4). */
describe("createServer security headers", () => {
  const routes = Router();
  routes.get("/ping", (_req, res) => {
    res.json({ ok: true });
  });
  const app = createServer(routes);

  it("sends the helmet headers and never X-Powered-By", async () => {
    const res = await request(app).get("/ping");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
