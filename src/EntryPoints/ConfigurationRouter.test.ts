import HttpStatusCodes from "@src/common/HttpStatusCodes.js";
import type { IConfigurationRepository } from "@src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ConfigurationUseCase } from "@src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import type { Menu } from "@src/Domain/Menu/Entity/Menu.js";
import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import { createConfigurationRouter } from "./ConfigurationRouter.js";

interface MenuApiResponse {
  data: Menu;
}

// Mock dependencies
vi.mock("@variamosple/variamos-security", () => ({
  hasPermissions:
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      next();
    },
}));

describe("ConfigurationRouter Integration Tests", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockRepo = mock<IConfigurationRepository>();
    const configurationUseCase = new ConfigurationUseCase(mockRepo);
    app.use(
      "/v1/configurations",
      createConfigurationRouter(configurationUseCase),
    );
  });

  describe("GET /v1/configurations/menu", () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it("should return 200 and the configurations menu (default / production)", async () => {
      const response = await supertest(app).get("/v1/configurations/menu");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as MenuApiResponse;
      expect(response.body.transactionId).toBe("getMenu");
      expect(body.data).toBeDefined();
      expect(body.data.items).toBeDefined();
      expect(body.data.items.length).toBeGreaterThan(0);

      // Default referer is empty/none, and NODE_ENV is test (which acts as prod/else here)
      // Check that Admin location is NOT mutated or defaults
      const adminItem = body.data.items.find((item) => item.title === "Admin");
      expect(adminItem?.location).toBe(
        "https://app.variamos.com/variamos_admin/",
      );
    });

    it("should rewrite URLs to localhost in development environment", async () => {
      process.env.NODE_ENV = "development";

      const response = await supertest(app).get("/v1/configurations/menu");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as MenuApiResponse;

      // Home item: https://app.variamos.com/ -> http://localhost:3000/
      const homeItem = body.data.items.find((item) => item.title === "Home");
      expect(homeItem?.location).toBe("http://localhost:3000/");

      // Admin item: https://app.variamos.com/variamos_admin/ -> http://localhost:3000/variamos_admin/
      const adminItem = body.data.items.find((item) => item.title === "Admin");
      expect(adminItem?.location).toBe("http://localhost:3000/variamos_admin/");
    });

    it("should rewrite Admin location and options location when referer has /variamos_admin/ in non-development env", async () => {
      process.env.NODE_ENV = "test"; // treated as production in the controller logic (else branch)

      const response = await supertest(app)
        .get("/v1/configurations/menu")
        .set("Referer", "https://app.variamos.com/variamos_admin/some-subpage");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as MenuApiResponse;

      // Admin item location should be rewritten to "/variamos_admin/#/"
      const adminItem = body.data.items.find((item) => item.title === "Admin");
      expect(adminItem?.location).toBe("/variamos_admin/#/");

      // Options (My account) location should be rewritten to "/variamos_admin/#/my-account"
      const myAccountOption = body.data.options.find(
        (opt) => opt.title === "My account",
      );
      expect(myAccountOption?.location).toBe("/variamos_admin/#/my-account");
    });
  });
});
