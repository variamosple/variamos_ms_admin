import type { NextFunction, Request, Response } from "express";
import { mock } from "vitest-mock-extended";

vi.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (req: Request, _res: Response, next: NextFunction) => {
    (req as { user?: { id: string } }).user = { id: "admin-1" };
    next();
  },
}));

import express from "express";
import request from "supertest";
import { z } from "zod";
import { SECURITY_ALERT_KEYS } from "#src/Domain/Activity/SecurityAlertPolicy.js";
import { BUG_SYNC_INTERVAL_KEY } from "#src/Domain/Bug/Entity/BugSchedule.js";
import {
  Configuration,
  ConfigurationKey,
} from "#src/Domain/Configuration/Entity/Configuration.js";
import { SITE_NAME_KEY } from "#src/Domain/Configuration/Entity/SiteName.js";
import type { ConfigurationUseCase } from "#src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { MicroServiceAuditEntry } from "#src/Domain/MicroService/Entity/MicroServiceAuditEntry.js";
import { MicroServiceConfigItem } from "#src/Domain/MicroService/Entity/MicroServiceConfigItem.js";
import { MicroServiceDetailed } from "#src/Domain/MicroService/Entity/MicroServiceDetailed.js";
import type { MicroServiceManagementUseCase } from "#src/Domain/MicroService/UseCase/MicroServiceManagementUseCase.js";
import type { MicroServiceQueryUseCase } from "#src/Domain/MicroService/UseCase/MicroServiceQueryUseCase.js";
import {
  CONFIGURATION_V1_ROUTE,
  createConfigurationRouter,
} from "../ConfigurationRouter.js";
import {
  createMicroServicesRouter,
  MICRO_SERVICES_V1_ROUTE,
} from "../MicroServicesV1Router.js";

/*
 * Response contract of the service and configuration routes (EV-98, step
 * 1): the answers keep the shape VariaMosAdmin reads. The schemas copy
 * VariaMosAdmin/src/features/microservices/api/microServiceSchemas.ts and
 * shared/api/ConfigRepository.ts; the lists the screens read without a
 * schema follow their types (microservices/domain/Entity/MicroService.ts,
 * global-configuration/domain/Entity/Configuration.ts, the Menu of
 * @variamosple/variamos-components). They are loose: a field added by the
 * server breaks nothing, a field renamed, removed or of another type fails
 * here first. When the screen reads a new field, add it here in the same
 * pull request.
 */

// VariaMosAdmin/src/shared/api/parseResponse.ts
const envelope = <T extends z.ZodType>(data: T) =>
  z.looseObject({
    transactionId: z.optional(z.string()),
    errorCode: z.optional(z.nullable(z.union([z.number(), z.string()]))),
    message: z.optional(z.string()),
    totalCount: z.optional(z.number()),
    data,
  });
// VariaMosAdmin/src/shared/api/schemas.ts: optionalText
const optionalText = z.optional(z.nullable(z.string()));
const isoText = z.iso.datetime({ offset: true });

const healthStatus = z.enum(["UP", "DEGRADED", "DOWN", "NO_DATA"]);
const microServiceSchema = z.looseObject({
  serviceName: z.string(),
  displayName: z.string(),
  health: z.looseObject({
    status: healthStatus,
    serviceName: z.string(),
    version: z.optional(z.string()),
    uptimeSeconds: z.optional(z.number()),
    responseTimeMs: z.optional(z.number()),
    checkedAt: z.optional(isoText),
    checks: z.optional(
      z.record(
        z.string(),
        z.looseObject({
          status: healthStatus,
          latencyMs: z.optional(z.number()),
          message: z.optional(z.string()),
          details: z.optional(z.record(z.string(), z.unknown())),
        }),
      ),
    ),
  }),
  replicasCount: z.number(),
  containers: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      state: z.string(),
      status: z.string(),
      created: isoText,
      labels: z.record(z.string(), z.string()),
    }),
  ),
  uptimeSummary: z.optional(
    z.looseObject({
      serviceName: z.string(),
      currentStatus: healthStatus,
      uptime24hPercentage: z.number(),
      uptime30dPercentage: z.number(),
      averageResponseTimeMs: z.number(),
      history: z.array(
        z.looseObject({
          timestamp: isoText,
          status: healthStatus,
          responseTimeMs: z.number(),
          uptimePercentage: z.number(),
        }),
      ),
    }),
  ),
  targetUrl: z.optional(z.string()),
  version: z.optional(z.string()),
});
const configItemSchema = z.looseObject({
  id: z.optional(z.number()),
  serviceName: z.string(),
  key: z.string(),
  value: z.string(),
  type: z.string(),
  isSecret: z.boolean(),
  isReadOnly: z.boolean(),
  description: optionalText,
  updatedBy: optionalText,
  createdAt: optionalText,
  updatedAt: optionalText,
});
const auditEntrySchema = z.looseObject({
  id: z.optional(z.number()),
  serviceName: z.string(),
  actionType: z.string(),
  details: z.record(z.string(), z.unknown()),
  performedBy: z.string(),
  createdAt: z.string(),
});
const configurationSchema = z.looseObject({
  id: z.optional(z.number()),
  key: z.string(),
  value: z.unknown(),
  type: z.enum(["boolean", "string", "number", "array", "object"]),
  category: z.string(),
  requiresMfa: z.boolean(),
  isSecret: z.boolean(),
  environmentScope: z.enum(["production", "development", "test", "all"]),
  isReadOnly: z.boolean(),
  isApplied: z.optional(z.boolean()),
  accepts: z.optional(
    z.looseObject({
      text: z.string(),
      min: z.optional(z.number()),
      max: z.optional(z.number()),
      unit: z.optional(z.string()),
      format: z.optional(z.enum(["timeZone", "timeSpan"])),
    }),
  ),
  targetServices: z.array(z.string()),
  description: z.optional(z.string()),
  updatedBy: z.optional(z.string()),
  createdAt: z.optional(z.string()),
  updatedAt: z.optional(z.string()),
});
const menuItemBase = {
  title: z.string(),
  allowedRoles: z.optional(z.array(z.string())),
  allowedPermissions: z.optional(z.array(z.string())),
};
const menuSubItem = z.looseObject({ ...menuItemBase, location: z.string() });
const menuSchema = z.looseObject({
  items: z.array(
    z.looseObject({
      ...menuItemBase,
      type: z.enum(["location", "dropdown"]),
      location: z.optional(z.string()),
      children: z.optional(z.array(menuSubItem)),
    }),
  ),
  subMenu: z.array(
    z.looseObject({
      accessibleFrom: z.string(),
      items: z.array(menuSubItem),
    }),
  ),
  options: z.array(
    z.looseObject({
      ...menuItemBase,
      accessibleFrom: z.optional(z.string()),
      location: z.string(),
    }),
  ),
});
const publicSettingsSchema = z.looseObject({
  siteName: z.string().min(1).max(60),
});

/** The body follows the schema; the issues name the fields that do not. */
const expectContract = (schema: z.ZodType, body: unknown) => {
  const parsed = schema.safeParse(body);
  expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
};

const NOW = new Date("2026-11-02T10:00:00Z");

// A service with its health, containers and uptime, as the repository
// assembles it, and one without any check yet
const checkedService = () =>
  new MicroServiceDetailed({
    serviceName: "variamos_ms_admin",
    displayName: "Administration",
    health: {
      status: "UP",
      serviceName: "variamos_ms_admin",
      version: "2.3.0",
      uptimeSeconds: 3600,
      responseTimeMs: 12,
      checkedAt: NOW,
      checks: { database: { status: "UP", latencyMs: 3, details: { a: 1 } } },
    },
    replicasCount: 1,
    containers: [
      {
        id: "c1",
        name: "variamos_ms_admin_1",
        state: "running",
        status: "Up 1 hour",
        created: NOW,
        labels: { "com.docker.compose.service": "variamos_ms_admin" },
      },
    ],
    uptimeSummary: {
      serviceName: "variamos_ms_admin",
      currentStatus: "UP",
      uptime24hPercentage: 99.5,
      uptime30dPercentage: 99.9,
      averageResponseTimeMs: 14,
      history: [
        {
          timestamp: NOW,
          status: "UP",
          responseTimeMs: 12,
          uptimePercentage: 100,
        },
      ],
    },
    targetUrl: "http://variamos_ms_admin:4000",
    version: "2.3.0",
  });
const uncheckedService = () =>
  new MicroServiceDetailed({
    serviceName: "semantic_translator",
    displayName: "Semantic translator",
    health: { status: "NO_DATA", serviceName: "semantic_translator" },
    replicasCount: 0,
    containers: [],
  });

const configuration = (
  key: string,
  value: string | number,
  type: "number" | "string",
) =>
  Configuration.builder()
    .setId(1)
    .setKey(new ConfigurationKey(key))
    .setValue(value)
    .setType(type)
    .setCategory("general")
    .setEnvironmentScope("all")
    .setTargetServices(["variamos_ms_admin"])
    .setDescription("A setting")
    .setUpdatedBy("admin-1")
    .setCreatedAt(NOW)
    .setUpdatedAt(NOW)
    .build();
// Each form of "accepts": bounds and unit, a format, a text alone, none
const configurations = () => [
  configuration(BUG_SYNC_INTERVAL_KEY, 15, "number"),
  configuration(SECURITY_ALERT_KEYS.timeZone, "America/Bogota", "string"),
  configuration(SITE_NAME_KEY, "VariaMos", "string"),
  configuration("general.unread_by_any_code", "x", "string"),
];

const serviceQueries = mock<MicroServiceQueryUseCase>();
const serviceManagement = mock<MicroServiceManagementUseCase>();
const configurationUseCase = mock<ConfigurationUseCase>();

const app = express();
app.use(express.json());
app.use(
  MICRO_SERVICES_V1_ROUTE,
  createMicroServicesRouter(serviceQueries, serviceManagement),
);
app.use(
  CONFIGURATION_V1_ROUTE,
  createConfigurationRouter(configurationUseCase),
);

describe("Service and configuration routes keep the shape VariaMosAdmin reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /v1/micro-services", async () => {
    serviceQueries.queryMicroServices.mockResolvedValue(
      new ResponseModel<MicroServiceDetailed[]>("tx", {
        totalCount: 2,
      }).withResponse([checkedService(), uncheckedService()]),
    );

    const res = await request(app).get("/v1/micro-services");

    expect(res.status).toBe(200);
    expectContract(envelope(z.array(microServiceSchema)), res.body);
  });

  it("GET /v1/micro-services/:name/configurations", async () => {
    serviceQueries.queryConfigurations.mockResolvedValue(
      new ResponseModel<MicroServiceConfigItem[]>("tx").withResponse([
        new MicroServiceConfigItem({
          id: 1,
          serviceName: "variamos_ms_admin",
          key: "LOG_LEVEL",
          value: "info",
          type: "string",
          isSecret: false,
          isReadOnly: false,
          description: "Log level",
          updatedBy: "admin-1",
          createdAt: NOW,
          updatedAt: NOW,
        }),
        new MicroServiceConfigItem({
          serviceName: "variamos_ms_admin",
          key: "API_TOKEN",
          value: "********",
          type: "string",
          isSecret: true,
          isReadOnly: true,
        }),
      ]),
    );

    const res = await request(app).get(
      "/v1/micro-services/variamos_ms_admin/configurations",
    );

    expect(res.status).toBe(200);
    expectContract(envelope(z.array(configItemSchema)), res.body);
  });

  it("PUT /v1/micro-services/:name/configurations/:key", async () => {
    serviceManagement.updateConfiguration.mockResolvedValue(
      new ResponseModel<MicroServiceConfigItem>("tx").withResponse(
        new MicroServiceConfigItem({
          id: 1,
          serviceName: "variamos_ms_admin",
          key: "LOG_LEVEL",
          value: "debug",
          type: "string",
          isSecret: false,
          isReadOnly: false,
        }),
      ),
    );

    const res = await request(app)
      .put("/v1/micro-services/variamos_ms_admin/configurations/LOG_LEVEL")
      .send({ value: "debug" });

    expect(res.status).toBe(200);
    expectContract(envelope(configItemSchema), res.body);
  });

  it("GET /v1/micro-services/:name/audit-logs", async () => {
    serviceQueries.queryAuditLogs.mockResolvedValue(
      new ResponseModel<MicroServiceAuditEntry[]>("tx").withResponse([
        new MicroServiceAuditEntry({
          id: 1,
          serviceName: "variamos_ms_admin",
          actionType: "CONFIG_UPDATE",
          details: { key: "LOG_LEVEL", newValue: "debug" },
          performedBy: "admin-1",
          createdAt: NOW,
        }),
      ]),
    );

    const res = await request(app).get(
      "/v1/micro-services/variamos_ms_admin/audit-logs",
    );

    expect(res.status).toBe(200);
    expectContract(envelope(z.array(auditEntrySchema)), res.body);
  });

  // The router maps each configuration to its answer (isApplied, accepts)
  it("GET /v1/configurations", async () => {
    configurationUseCase.queryConfigurations.mockResolvedValue(
      new ResponseModel<Configuration[]>("tx").withResponse(configurations()),
    );

    const res = await request(app).get("/v1/configurations");

    expect(res.status).toBe(200);
    expectContract(envelope(z.array(configurationSchema)), res.body);
  });

  it("PUT /v1/configurations/:key", async () => {
    configurationUseCase.updateConfiguration.mockResolvedValue(
      new ResponseModel<Configuration>("tx").withResponse(
        configuration(BUG_SYNC_INTERVAL_KEY, 30, "number"),
      ),
    );

    const res = await request(app)
      .put(`/v1/configurations/${BUG_SYNC_INTERVAL_KEY}`)
      .send({ value: 30 });

    expect(res.status).toBe(200);
    expectContract(envelope(configurationSchema), res.body);
  });

  // The menu is written in the code: the real one is checked
  it("GET /v1/configurations/menu", async () => {
    const res = await request(app).get("/v1/configurations/menu");

    expect(res.status).toBe(200);
    expectContract(envelope(menuSchema), res.body);
  });

  it("GET /v1/configurations/public", async () => {
    configurationUseCase.getSiteName.mockResolvedValue("VariaMos");

    const res = await request(app).get("/v1/configurations/public");

    expect(res.status).toBe(200);
    expectContract(envelope(publicSettingsSchema), res.body);
  });
});
