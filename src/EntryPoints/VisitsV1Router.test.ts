import express from "express";
import supertest from "supertest";
import type { Mock } from "vitest";
import { mock } from "vitest-mock-extended";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { Visit } from "#src/Domain/Visit/Entity/Visit.js";
import { VisitUseCase } from "#src/Domain/Visit/UseCase/VisitUseCase.js";
import { RATE_LIMITS } from "./RateLimits.js";
import { createVisitsRouter } from "./VisitsV1Router.js";

interface CustomRequest {
  user?: { id: string };
}

// Mock dependencies
vi.mock("#src/Domain/Visit/UseCase/VisitUseCase");
vi.mock("@variamosple/variamos-security", () => ({
  isAuthenticated: (
    req: express.Request,
    _res: express.Response,
    next: () => void,
  ) => {
    const id = req.headers["x-test-user"];
    (req as CustomRequest).user = {
      id: typeof id === "string" ? id : "user-123",
    };
    next();
  },
}));

import type { ICountriesRepository } from "#src/Domain/Countries/Repository/ICountriesRepository.js";
import type { IVisitRepository } from "#src/Domain/Visit/Repository/IVisitRepository.js";

describe("VisitsV1Router Integration Tests - Extended Coverage", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockVisitUseCase = new VisitUseCase(
      mock<IVisitRepository>(),
      mock<ICountriesRepository>(),
    );
    app.use("/v1/visits", createVisitsRouter(mockVisitUseCase));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /v1/visits", () => {
    it("ignores an X-Forwarded-For header written by the client (ADM-N26)", async () => {
      (VisitUseCase.prototype.registerVisit as Mock).mockResolvedValue(
        new ResponseModel("createVisit").withResponse(
          new Visit("home-page", "user-123"),
        ),
      );

      const response = await supertest(app)
        .post("/v1/visits")
        .set("x-forwarded-for", "203.0.113.7")
        .send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(VisitUseCase.prototype.registerVisit).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "createVisit" }),
        expect.stringMatching(/^(::ffff:)?127\.0\.0\.1$/),
      );
    });

    it("should return 200 on success when using fallback client ip", async () => {
      const mockVisit = new Visit("home-page", "user-123");
      const expectedResponse = new ResponseModel("createVisit").withResponse(
        mockVisit,
      );
      (VisitUseCase.prototype.registerVisit as Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/v1/visits")
        .send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(VisitUseCase.prototype.registerVisit).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "createVisit" }),
        expect.stringMatching(/^(::ffff:)?127\.0\.0\.1$/),
      );
    });

    it("should return 400 when pageId is missing", async () => {
      const response = await supertest(app).post("/v1/visits").send({});

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return error status code when register fails", async () => {
      const expectedResponse = new ResponseModel("createVisit").withError(
        DomainErrorCodes.INVALID_INPUT,
        "register failed",
      );
      (VisitUseCase.prototype.registerVisit as Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/v1/visits")
        .send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when register throws an exception", async () => {
      (VisitUseCase.prototype.registerVisit as Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app)
        .post("/v1/visits")
        .send({ pageId: "home-page" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});

describe("POST /v1/visits behind the proxy (ADM-N26, ADM-N38)", () => {
  const appBehindProxy = () => {
    const proxied = express();
    // The same setting as server.ts
    proxied.set("trust proxy", "loopback, linklocal, uniquelocal");
    proxied.use(express.json());
    proxied.use(
      "/v1/visits",
      createVisitsRouter(
        new VisitUseCase(
          mock<IVisitRepository>(),
          mock<ICountriesRepository>(),
        ),
      ),
    );
    return proxied;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (VisitUseCase.prototype.registerVisit as Mock).mockResolvedValue(
      new ResponseModel("createVisit").withResponse(
        new Visit("home-page", "user-123"),
      ),
    );
  });

  it("takes the address the proxy saw, not the one the client wrote", async () => {
    await supertest(appBehindProxy())
      .post("/v1/visits")
      .set("x-forwarded-for", "203.0.113.7, 198.51.100.2")
      .send({ pageId: "home-page" });

    expect(VisitUseCase.prototype.registerVisit).toHaveBeenCalledWith(
      expect.anything(),
      "198.51.100.2",
    );
  });

  it("refuses the visits of an account past its limit, not those of another", async () => {
    const proxied = appBehindProxy();
    const { limit } = RATE_LIMITS.visitsPerAccount;
    const visit = (user: string) =>
      supertest(proxied)
        .post("/v1/visits")
        .set("x-test-user", user)
        .send({ pageId: "home-page" });

    for (let i = 0; i < limit; i++) {
      expect((await visit("busy")).status).toBe(HttpStatusCodes.OK);
    }
    const refused = await visit("busy");
    const other = await visit("calm");

    expect(refused.status).toBe(HttpStatusCodes.TOO_MANY_REQUESTS);
    expect(refused.headers["retry-after"]).toBeDefined();
    expect(other.status).toBe(HttpStatusCodes.OK);
    expect(VisitUseCase.prototype.registerVisit).toHaveBeenCalledTimes(
      limit + 1,
    );
  });

  it("allows 60 visits a minute per account", () => {
    expect(RATE_LIMITS.visitsPerAccount).toEqual({
      windowMs: 60 * 1000,
      limit: 60,
    });
  });
});
