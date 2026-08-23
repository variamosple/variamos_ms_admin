import HttpStatusCodes from "@src/common/HttpStatusCodes.js";
import {
  Configuration,
  ConfigurationKey,
} from "@src/Domain/Configuration/Entity/Configuration.js";
import type { IConfigurationRepository } from "@src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { ConfigurationUseCase } from "@src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import type { Menu } from "@src/Domain/Menu/Entity/Menu.js";
import express from "express";
import logger from "jet-logger";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import {
  type ConfigurationResponseDto,
  createConfigurationRouter,
} from "./ConfigurationRouter.js";

interface MenuApiResponse {
  data: Menu;
}

// Mock security permission helper
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

import type { IConfigEventPublisher } from "@src/Domain/Configuration/Event/IConfigEventPublisher.js";

describe("ConfigurationRouter Integration Tests", () => {
  let app: express.Application;
  let mockUseCase: ConfigurationUseCase;
  let mockRepo: IConfigurationRepository;
  let mockPublisher: IConfigEventPublisher;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    mockRepo = mock<IConfigurationRepository>();
    mockPublisher = mock<IConfigEventPublisher>();
    mockUseCase = new ConfigurationUseCase(mockRepo, mockPublisher);
    app.use("/v1/configurations", createConfigurationRouter(mockUseCase));
  });

  describe("GET /v1/configurations/menu", () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      vi.restoreAllMocks();
    });

    it("should return 200 and the configurations menu (default / production)", async () => {
      const response = await supertest(app).get("/v1/configurations/menu");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as MenuApiResponse;
      expect(response.body.transactionId).toBe("getMenu");
      expect(body.data).toBeDefined();
      expect(body.data.items).toBeDefined();
      expect(body.data.items.length).toBeGreaterThan(0);

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

      const homeItem = body.data.items.find((item) => item.title === "Home");
      expect(homeItem?.location).toBe("http://localhost:3000/");

      const adminItem = body.data.items.find((item) => item.title === "Admin");
      expect(adminItem?.location).toBe("http://localhost:3000/variamos_admin/");
    });

    it("should rewrite Admin location and options location when referer has /variamos_admin/ in non-development env", async () => {
      process.env.NODE_ENV = "test";

      const response = await supertest(app)
        .get("/v1/configurations/menu")
        .set("Referer", "https://app.variamos.com/variamos_admin/some-subpage");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as MenuApiResponse;

      const adminItem = body.data.items.find((item) => item.title === "Admin");
      expect(adminItem?.location).toBe("/variamos_admin/#/");

      const myAccountOption = body.data.options.find(
        (opt) => opt.title === "My account",
      );
      expect(myAccountOption?.location).toBe("/variamos_admin/#/my-account");
    });

    it("should handle missing items, Admin item, or My Account option (branch coverage)", async () => {
      vi.spyOn(JSON, "parse").mockReturnValueOnce({
        options: [],
      });

      const response = await supertest(app)
        .get("/v1/configurations/menu")
        .set("Referer", "https://app.variamos.com/variamos_admin/some-subpage");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.data.items).toBeUndefined();

      vi.spyOn(JSON, "parse").mockReturnValueOnce({
        items: [{ title: "Home", location: "url" }],
        options: [{ title: "My account", location: "url" }],
      });

      const response2 = await supertest(app)
        .get("/v1/configurations/menu")
        .set("Referer", "https://app.variamos.com/variamos_admin/some-subpage");

      expect(response2.status).toBe(HttpStatusCodes.OK);
    });
  });

  describe("GET /v1/configurations (query configurations)", () => {
    it("should return a list of configurations and mask secret values", async () => {
      const secretConfig = Configuration.builder()
        .setKey(new ConfigurationKey("notification.smtp.password"))
        .setValue("smtp-pass-123")
        .setType("string")
        .setCategory("notification")
        .setIsSecret(true)
        .setTargetServices(["variamos_ms_notifications"])
        .build();

      const publicConfig = Configuration.builder()
        .setKey(new ConfigurationKey("general.site_name"))
        .setValue("VariaMos")
        .setType("string")
        .setCategory("general")
        .setIsSecret(false)
        .setTargetServices(["all"])
        .build();

      vi.spyOn(mockUseCase, "queryConfigurations").mockResolvedValue(
        new ResponseModel<Configuration[]>("queryConfigurations").withResponse([
          secretConfig,
          publicConfig,
        ]),
      );

      const response = await supertest(app).get("/v1/configurations");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const data = response.body.data as ConfigurationResponseDto[];
      expect(data).toHaveLength(2);

      // Verify secret masking
      const secretItem = data.find(
        (c: ConfigurationResponseDto) => c.key === "notification.smtp.password",
      );
      expect(secretItem?.value).toBe("********");

      // Verify public config and all its mapped properties (kills ObjectLiteral mutant)
      const publicItem = data.find(
        (c: ConfigurationResponseDto) => c.key === "general.site_name",
      );
      expect(publicItem).toEqual({
        id: undefined,
        key: "general.site_name",
        value: "VariaMos",
        type: "string",
        category: "general",
        requiresMfa: false,
        isSecret: false,
        environmentScope: "all",
        isReadOnly: false,
        targetServices: ["all"],
        description: undefined,
        updatedBy: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      });
    });

    it("should cover false branch when queryConfigurations returns no data", async () => {
      vi.spyOn(mockUseCase, "queryConfigurations").mockResolvedValue(
        new ResponseModel<Configuration[]>("queryConfigurations").withError(
          DomainErrorCodes.UNAUTHORIZED_ACCESS,
          "Unauthorized",
        ),
      );

      const response = await supertest(app).get("/v1/configurations");

      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      expect(response.body.data).toBeUndefined();
    });
  });

  describe("PUT /v1/configurations/:key (update configuration)", () => {
    it("should return 403 FORBIDDEN when UseCase returns MFA_REQUIRED", async () => {
      vi.spyOn(mockUseCase, "updateConfiguration").mockResolvedValue(
        new ResponseModel<Configuration>("updateConfiguration").withError(
          DomainErrorCodes.MFA_REQUIRED,
          "MFA validation required",
        ),
      );

      const response = await supertest(app)
        .put("/v1/configurations/security.password.min_length")
        .send({ value: 14 });

      expect(response.status).toBe(HttpStatusCodes.FORBIDDEN);
      expect(response.body.errorCode).toBe(DomainErrorCodes.MFA_REQUIRED);
    });

    it("should return 200 OK and updated configuration on success", async () => {
      const updatedConfig = Configuration.builder()
        .setKey(new ConfigurationKey("general.site_name"))
        .setValue("New VariaMos Site")
        .setType("string")
        .setCategory("general")
        .setTargetServices(["all"])
        .build();

      vi.spyOn(mockUseCase, "updateConfiguration").mockResolvedValue(
        new ResponseModel<Configuration>("updateConfiguration").withResponse(
          updatedConfig,
        ),
      );

      const response = await supertest(app)
        .put("/v1/configurations/general.site_name")
        .send({ value: "New VariaMos Site" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.data.value).toBe("New VariaMos Site");
    });

    it("should return 500 INTERNAL_SERVER_ERROR when UseCase throws exception on update", async () => {
      const loggerSpy = vi.spyOn(logger, "err").mockImplementation(() => {});
      vi.spyOn(mockUseCase, "updateConfiguration").mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app)
        .put("/v1/configurations/general.site_name")
        .send({ value: "New VariaMos Site" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(loggerSpy).toHaveBeenCalled();
    });
  });

  describe("GET /v1/configurations error handling", () => {
    it("should return 500 INTERNAL_SERVER_ERROR when UseCase throws exception on query", async () => {
      const loggerSpy = vi.spyOn(logger, "err").mockImplementation(() => {});
      vi.spyOn(mockUseCase, "queryConfigurations").mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/v1/configurations");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(loggerSpy).toHaveBeenCalled();
    });
  });
});
