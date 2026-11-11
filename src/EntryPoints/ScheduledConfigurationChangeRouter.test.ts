import express from "express";
import supertest from "supertest";
import { mock } from "vitest-mock-extended";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import type { ScheduledConfigurationChange } from "#src/Domain/Configuration/Entity/ScheduledConfigurationChange.js";
import type { ScheduledConfigurationChangeUseCase } from "#src/Domain/Configuration/UseCase/ScheduledConfigurationChangeUseCase.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { createScheduledConfigurationChangeRouter } from "./ScheduledConfigurationChangeRouter.js";

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

const CHANGE: ScheduledConfigurationChange = {
  id: 3,
  key: "security.password.min_length",
  previousValue: 8,
  newValue: 14,
  baseUpdatedAt: new Date("2026-11-01T08:00:00Z"),
  dueAt: new Date("2026-11-15T13:00:00Z"),
  status: "scheduled",
  reason: null,
  createdBy: "admin-1",
  updatedBy: null,
  createdAt: new Date("2026-11-11T12:00:00Z"),
  updatedAt: new Date("2026-11-11T12:00:00Z"),
  resolvedAt: null,
};

const answer = (change = CHANGE) =>
  new ResponseModel<ScheduledConfigurationChange>("t").withResponse(change);

describe("ScheduledConfigurationChangeRouter (EV-115 lot B)", () => {
  const useCase = mock<ScheduledConfigurationChangeUseCase>();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "admin-1" } as never;
    next();
  });
  app.use("/changes", createScheduledConfigurationChangeRouter(useCase));

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists the changes with their dates as instants, without announcement", async () => {
    useCase.list.mockResolvedValue(
      new ResponseModel<ScheduledConfigurationChange[]>("t").withResponse([
        CHANGE,
      ]),
    );

    const response = await supertest(app).get("/changes");

    expect(response.status).toBe(HttpStatusCodes.OK);
    expect(response.body.data).toEqual([
      {
        id: 3,
        key: "security.password.min_length",
        previousValue: 8,
        newValue: 14,
        dueAt: "2026-11-15T13:00:00.000Z",
        status: "scheduled",
        reason: null,
        createdBy: "admin-1",
        updatedBy: null,
        createdAt: "2026-11-11T12:00:00.000Z",
        updatedAt: "2026-11-11T12:00:00.000Z",
        resolvedAt: null,
      },
    ]);
  });

  it("plans a change for the signed-in administrator, with the dated announcement", async () => {
    useCase.schedule.mockResolvedValue(answer());

    const response = await supertest(app).post("/changes").send({
      key: "security.password.min_length",
      value: 14,
      dueAt: "2026-11-15T08:00:00-05:00",
    });

    expect(response.status).toBe(HttpStatusCodes.OK);
    expect(useCase.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          key: "security.password.min_length",
          value: 14,
          dueAt: "2026-11-15T08:00:00-05:00",
          operatorId: "admin-1",
        },
      }),
    );
    expect(response.body.data.announcement).toEqual({
      title: "Password rules updated",
      body: "From 15 November 2026 at 13:00 UTC, passwords must have at least 14 characters.",
      note: "The rules apply when you next choose a password; your current password keeps working.",
    });
  });

  it.each([
    [{ key: "k", value: 1, dueAt: "next monday" }, "dueAt"],
    [{ key: "k", value: 1, dueAt: "2026-11-15T13:00:00" }, "dueAt"],
    [{ key: 3, value: 1, dueAt: "2026-11-15T13:00:00Z" }, "key"],
  ])("refuses the body %j", async (body, field) => {
    const response = await supertest(app).post("/changes").send(body);

    expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    expect(response.body.message).toBe(`The field "${field}" is invalid.`);
    expect(useCase.schedule).not.toHaveBeenCalled();
  });

  it("answers a second planned change of a setting with its refusal", async () => {
    useCase.schedule.mockResolvedValue(
      new ResponseModel<ScheduledConfigurationChange>("t").withError(
        DomainErrorCodes.DUPLICATE_ENTITY,
        "A change of this setting is already planned: edit or cancel it.",
      ),
    );

    const response = await supertest(app)
      .post("/changes")
      .send({ key: "k", value: 1, dueAt: "2026-11-15T13:00:00Z" });

    expect(response.status).toBe(HttpStatusCodes.CONFLICT);
    expect(response.body.data).toBeUndefined();
  });

  it("edits a planned change by its id", async () => {
    useCase.reschedule.mockResolvedValue(answer());

    const response = await supertest(app)
      .put("/changes/3")
      .send({ value: 14, dueAt: "2026-11-15T13:00:00Z" });

    expect(response.status).toBe(HttpStatusCodes.OK);
    expect(useCase.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          id: 3,
          value: 14,
          dueAt: "2026-11-15T13:00:00Z",
          operatorId: "admin-1",
        },
      }),
    );
    expect(response.body.data.announcement.title).toBe(
      "Password rules updated",
    );
  });

  it("cancels a planned change and offers the correction", async () => {
    useCase.cancel.mockResolvedValue(
      answer({
        ...CHANGE,
        status: "cancelled",
        resolvedAt: new Date("2026-11-12T09:00:00Z"),
      }),
    );

    const response = await supertest(app).post("/changes/3/cancel");

    expect(response.status).toBe(HttpStatusCodes.OK);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        status: "cancelled",
        resolvedAt: "2026-11-12T09:00:00.000Z",
        announcement: {
          title: "Planned change cancelled",
          body: "The change to the password rules announced for 15 November 2026 at 13:00 UTC will not happen.",
        },
      }),
    );
  });

  it.each([
    ["put", "/changes/abc"],
    ["post", "/changes/1e3/cancel"],
  ] as const)(
    "refuses %s %s, whose id is not a number",
    async (method, path) => {
      const response = await supertest(app)[method](path).send({
        value: 1,
        dueAt: "2026-11-15T13:00:00Z",
      });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body.message).toBe(
        "The id of the planned change is invalid.",
      );
    },
  );

  it("answers a failure of the database as an error", async () => {
    useCase.list.mockRejectedValue(new Error("db down"));

    const response = await supertest(app).get("/changes");

    expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
  });
});
