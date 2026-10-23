import { Router } from "express";
import request from "supertest";
import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { INTERNAL_ERROR_MESSAGE } from "#src/EntryPoints/errorResponse.js";
import { createServer } from "./server.js";

/** The global error handler: no internal detail ever reaches the client (T-16). */
describe("createServer error handler", () => {
  const routes = Router();
  routes.post("/echo", (req, res) => {
    res.json(req.body);
  });
  routes.get("/throws", () => {
    throw new Error(
      'duplicate key value violates unique constraint "users_email_key"',
    );
  });
  routes.get("/rejects", async () => {
    throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
  });
  routes.get("/domain", () => {
    throw new DomainError(DomainErrorCodes.ENTITY_NOT_FOUND, "Bug not found.");
  });
  const app = createServer(routes);

  it.each(["/throws", "/rejects"])(
    "answers 500 with the generic message: %s",
    async (path) => {
      const res = await request(app).get(path);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        errorCode: DomainErrorCodes.SYSTEM_ERROR,
        message: INTERNAL_ERROR_MESSAGE,
      });
    },
  );

  it("shows the message of a DomainError", async () => {
    const res = await request(app).get("/domain");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      errorCode: DomainErrorCodes.ENTITY_NOT_FOUND,
      message: "Bug not found.",
    });
  });

  it("answers 400 without the parser message for a body that is not JSON", async () => {
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send("{ not json");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errorCode: DomainErrorCodes.INVALID_INPUT,
      message: "The request could not be read.",
    });
  });
});
