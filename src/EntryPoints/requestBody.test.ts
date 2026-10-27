import express from "express";
import supertest from "supertest";
import { z } from "zod";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { optionalText, validBody } from "./requestBody.js";

const schema = z.object({ name: optionalText(5) });

describe("validBody", () => {
  const seen = vi.fn();
  const app = express();
  app.use(express.json());
  app.post("/", validBody(schema, "test"), (req, res) => {
    seen(req.body);
    res.status(200).json({});
  });

  beforeEach(() => {
    seen.mockClear();
  });

  it("hands the next handler the checked body, without unknown fields", async () => {
    await supertest(app)
      .post("/")
      .send({ name: "ana", isAdmin: true })
      .expect(200);

    expect(seen).toHaveBeenCalledWith({ name: "ana" });
  });

  it("stops the request on a mismatch, naming the field only", async () => {
    const response = await supertest(app).post("/").send({ name: "too-long" });

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    expect(response.body).toMatchObject({
      transactionId: "test",
      errorCode: DomainErrorCodes.INVALID_INPUT,
      message: 'The field "name" is invalid.',
    });
    expect(response.text).not.toContain("too-long");
    expect(seen).not.toHaveBeenCalled();
  });

  it("reads a request without a body as an empty one", async () => {
    await supertest(app).post("/").expect(200);

    expect(seen).toHaveBeenCalledWith({});
  });
});
