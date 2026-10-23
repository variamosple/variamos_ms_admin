import express, { Router } from "express";
import request from "supertest";
import { RouteError } from "#src/common/classes.js";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  errorResponse,
  hideInternalErrorMessages,
  INTERNAL_ERROR_MESSAGE,
} from "./errorResponse.js";

const SQL_TEXT = 'relation "variamos.bugs" does not exist';

describe("errorResponse", () => {
  it("shows the message of a DomainError, with its status", () => {
    const { status, body } = errorResponse(
      new DomainError(
        DomainErrorCodes.INVALID_INPUT,
        "Bug title cannot be empty.",
      ),
      "tx",
    );

    expect(status).toBe(HttpStatusCodes.BAD_REQUEST);
    expect(body).toMatchObject({
      transactionId: "tx",
      errorCode: DomainErrorCodes.INVALID_INPUT,
      message: "Bug title cannot be empty.",
    });
  });

  it("shows the message of a RouteError, with a code for its status", () => {
    const { status, body } = errorResponse(
      new RouteError(HttpStatusCodes.FORBIDDEN, "Origin not allowed."),
    );

    expect(status).toBe(HttpStatusCodes.FORBIDDEN);
    expect(body).toMatchObject({
      errorCode: DomainErrorCodes.FORBIDDEN,
      message: "Origin not allowed.",
    });
  });

  it.each([
    [HttpStatusCodes.BAD_REQUEST, "The request could not be read."],
    [HttpStatusCodes.PAYLOAD_TOO_LARGE, "The request is too large."],
  ])("hides the technical message of a request error %i", (status, message) => {
    const parserError = Object.assign(
      new Error("Unexpected token } in JSON at position 12"),
      { status },
    );

    const response = errorResponse(parserError);

    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({
      errorCode: DomainErrorCodes.INVALID_INPUT,
      message,
    });
  });

  it.each([
    ["an Error", new Error(SQL_TEXT)],
    [
      "a server error with a status",
      Object.assign(new Error(SQL_TEXT), { status: 502 }),
    ],
    ["a value that is not an error", SQL_TEXT],
  ])("answers 500 with the generic message for %s", (_label, error) => {
    const { status, body } = errorResponse(error);

    expect(status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    expect(body).toMatchObject({
      errorCode: DomainErrorCodes.SYSTEM_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    });
    expect(JSON.stringify(body)).not.toContain("does not exist");
  });
});

describe("hideInternalErrorMessages", () => {
  const app = express();
  const routes = Router();
  app.use(hideInternalErrorMessages);
  app.use(routes);

  // A repository that copied an SQL error into its response
  routes.get("/system-error", (_req, res) => {
    res
      .status(500)
      .json(
        new ResponseModel("tx").withError(
          DomainErrorCodes.SYSTEM_ERROR,
          SQL_TEXT,
        ),
      );
  });
  routes.get("/system-error-ok-status", (_req, res) => {
    res.json(
      new ResponseModel("tx").withError(
        DomainErrorCodes.SYSTEM_ERROR,
        SQL_TEXT,
      ),
    );
  });
  routes.get("/raw-500", (_req, res) => {
    res.status(500).json({ error: SQL_TEXT });
  });
  routes.get("/invalid", (_req, res) => {
    res
      .status(400)
      .json(
        new ResponseModel("tx").withError(
          DomainErrorCodes.INVALID_INPUT,
          "Bug title cannot be empty.",
        ),
      );
  });
  routes.get("/unavailable", (_req, res) => {
    res
      .status(503)
      .json(
        new ResponseModel("tx").withError(
          DomainErrorCodes.UNAVAILABLE,
          "Two-factor authentication is not available yet.",
        ),
      );
  });
  routes.get("/list", (_req, res) => {
    res.status(500).json(["kept"]);
  });

  it.each(["/system-error", "/system-error-ok-status", "/raw-500"])(
    "replaces the message of a server error: %s",
    async (path) => {
      const res = await request(app).get(path);

      expect(JSON.stringify(res.body)).not.toContain("does not exist");
      expect(JSON.stringify(res.body)).toContain(INTERNAL_ERROR_MESSAGE);
    },
  );

  it("keeps the code and the transaction of the response", async () => {
    const res = await request(app).get("/system-error");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      transactionId: "tx",
      errorCode: DomainErrorCodes.SYSTEM_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    });
  });

  it.each([
    ["/invalid", "Bug title cannot be empty."],
    ["/unavailable", "Two-factor authentication is not available yet."],
  ])("leaves the message of an expected error: %s", async (path, message) => {
    const res = await request(app).get(path);

    expect(res.body.message).toBe(message);
  });

  it("leaves a list as it is", async () => {
    const res = await request(app).get("/list");

    expect(res.body).toEqual(["kept"]);
  });
});
