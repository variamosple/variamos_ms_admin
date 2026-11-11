import type { ActivityEntry } from "#src/Domain/Activity/ActivityEntry.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import {
  Configuration,
  ConfigurationKey,
  type ConfigurationValue,
} from "../Entity/Configuration.js";
import {
  ALREADY_SET,
  CHANGED_BY_HAND,
  type ScheduledChangeOutcome,
  type ScheduledConfigurationChange,
} from "../Entity/ScheduledConfigurationChange.js";
import type {
  IScheduledConfigurationChangeRepository,
  PlannedChange,
} from "../Repository/IScheduledConfigurationChangeRepository.js";
import {
  RESOLVED_CHANGES_SHOWN_MS,
  ScheduledConfigurationChangeUseCase,
} from "./ScheduledConfigurationChangeUseCase.js";

const KEY = "security.password.min_length";
const NOW = new Date("2026-11-11T12:00:00Z");
const DUE = "2026-11-15T13:00:00.000Z";
const BASE = new Date("2026-11-01T08:00:00Z");

/** The table, in memory: one planned change per key, as its index says. */
class InMemoryChanges implements IScheduledConfigurationChangeRepository {
  public rows: ScheduledConfigurationChange[] = [];
  public listedSince?: Date;

  public async list(since: Date) {
    this.listedSince = since;
    return this.rows;
  }

  public async findById(id: number) {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  public async create(
    change: PlannedChange & { key: string; createdBy: string },
  ) {
    if (
      this.rows.some((r) => r.key === change.key && r.status === "scheduled")
    ) {
      return null;
    }
    const row: ScheduledConfigurationChange = {
      ...change,
      id: this.rows.length + 1,
      status: "scheduled",
      reason: null,
      updatedBy: null,
      createdAt: NOW,
      updatedAt: NOW,
      resolvedAt: null,
    };
    this.rows.push(row);
    return row;
  }

  public async reschedule(
    id: number,
    change: PlannedChange & { updatedBy: string },
  ) {
    const index = this.rows.findIndex(
      (r) => r.id === id && r.status === "scheduled",
    );
    if (index < 0) return null;
    this.rows[index] = { ...this.rows[index], ...change };
    return this.rows[index];
  }

  public async cancel(id: number, cancelledBy: string) {
    const row = this.rows.find((r) => r.id === id && r.status === "scheduled");
    if (!row) return null;
    Object.assign(row, { status: "cancelled", updatedBy: cancelledBy });
    return row;
  }

  public async resolveDue(
    now: Date,
    resolve: (
      c: ScheduledConfigurationChange,
    ) => Promise<ScheduledChangeOutcome>,
  ) {
    let resolved = 0;
    for (const row of this.rows) {
      if (row.status !== "scheduled" || row.dueAt > now) continue;
      const outcome = await resolve(row);
      Object.assign(row, outcome, { resolvedAt: now });
      resolved += 1;
    }
    return resolved;
  }
}

const setting = (
  value: ConfigurationValue,
  extra: { requiresMfa?: boolean } = {},
) =>
  Configuration.builder()
    .setKey(new ConfigurationKey(KEY))
    .setValue(value)
    .setType("number")
    .setCategory("security")
    .setRequiresMfa(extra.requiresMfa ?? false)
    .setTargetServices(["all"])
    .setUpdatedAt(BASE)
    .build();

describe("ScheduledConfigurationChangeUseCase (EV-115 lot B)", () => {
  let changes: InMemoryChanges;
  let current: Configuration | null;
  let journal: ActivityEntry[];
  const configurations = {
    queryByKey: vi.fn(),
    updateConfiguration: vi.fn(),
  };
  const notifier = { notifyNotApplied: vi.fn() };
  let useCase: ScheduledConfigurationChangeUseCase;

  beforeEach(() => {
    changes = new InMemoryChanges();
    current = setting(8);
    journal = [];
    configurations.queryByKey
      .mockReset()
      .mockImplementation(async () =>
        current
          ? new ResponseModel<Configuration>("q").withResponse(current)
          : new ResponseModel<Configuration>("q").withError(
              DomainErrorCodes.ENTITY_NOT_FOUND,
              "not found",
            ),
      );
    configurations.updateConfiguration
      .mockReset()
      .mockResolvedValue(new ResponseModel<Configuration>("u"));
    notifier.notifyNotApplied.mockReset().mockResolvedValue(undefined);
    useCase = new ScheduledConfigurationChangeUseCase(
      changes,
      configurations,
      { record: async (entry) => void journal.push(entry) },
      notifier,
      () => NOW,
    );
  });

  const schedule = (
    data: Partial<{
      key: string;
      value: ConfigurationValue;
      dueAt: string;
    }> = {},
  ) =>
    useCase.schedule(
      new RequestModel("schedule", {
        key: KEY,
        value: 12,
        dueAt: DUE,
        operatorId: "admin-1",
        ...data,
      }),
    );

  describe("planning a change", () => {
    it("keeps the value of the setting and its change date, and journals the plan", async () => {
      const response = await schedule();

      expect(response.errorCode).toBeUndefined();
      expect(response.data).toEqual(
        expect.objectContaining({
          key: KEY,
          previousValue: 8,
          newValue: 12,
          baseUpdatedAt: BASE,
          dueAt: new Date(DUE),
          createdBy: "admin-1",
          status: "scheduled",
        }),
      );
      expect(journal).toEqual([
        expect.objectContaining({
          actorId: "admin-1",
          action: "configuration.schedule",
          entityType: "configuration",
          entityId: KEY,
          outcome: "success",
          after: { id: 1, key: KEY, value: 12, dueAt: DUE },
        }),
      ]);
      // The setting itself is not touched before the date
      expect(configurations.updateConfiguration).not.toHaveBeenCalled();
    });

    it.each([
      [
        { key: "general.site_name" },
        DomainErrorCodes.INVALID_INPUT,
        "Only the settings users notice can be changed at a later date.",
      ],
      [
        { dueAt: "2026-11-11T11:00:00Z" },
        DomainErrorCodes.INVALID_INPUT,
        "The date of the change must be in the future.",
      ],
      [
        { value: 8 },
        DomainErrorCodes.INVALID_INPUT,
        "The setting already has this value.",
      ],
      [{ value: "12" }, DomainErrorCodes.INVALID_INPUT, expect.any(String)],
      [
        { value: 2 },
        DomainErrorCodes.INVALID_INPUT,
        expect.stringContaining("expects"),
      ],
    ])("refuses %j as a save would", async (data, code, message) => {
      const response = await schedule(data);

      expect(response.errorCode).toBe(code);
      expect(response.message).toEqual(message);
      expect(changes.rows).toEqual([]);
      expect(journal[0]).toEqual(
        expect.objectContaining({ outcome: "failed", errorCode: code }),
      );
    });

    it("refuses a setting locked behind a second factor, or missing", async () => {
      current = setting(8, { requiresMfa: true });
      expect((await schedule()).errorCode).toBe(DomainErrorCodes.MFA_REQUIRED);
      current = null;
      expect((await schedule()).errorCode).toBe(
        DomainErrorCodes.ENTITY_NOT_FOUND,
      );
    });

    it("refuses a second planned change of the same setting", async () => {
      await schedule();
      const second = await schedule({ value: 14 });

      expect(second.errorCode).toBe(DomainErrorCodes.DUPLICATE_ENTITY);
      expect(second.message).toBe(
        "A change of this setting is already planned: edit or cancel it.",
      );
    });
  });

  describe("editing and cancelling", () => {
    beforeEach(async () => {
      await schedule();
      journal = [];
    });

    const reschedule = (id: number, value: ConfigurationValue, dueAt = DUE) =>
      useCase.reschedule(
        new RequestModel("reschedule", {
          id,
          value,
          dueAt,
          operatorId: "admin-2",
        }),
      );

    it("plans the change again from the setting as it now is", async () => {
      current = setting(10);
      const response = await reschedule(1, 14, "2026-11-20T09:00:00Z");

      expect(response.data).toEqual(
        expect.objectContaining({
          previousValue: 10,
          newValue: 14,
          dueAt: new Date("2026-11-20T09:00:00Z"),
          updatedBy: "admin-2",
        }),
      );
      expect(journal).toEqual([
        expect.objectContaining({
          action: "configuration.schedule.update",
          entityId: "1",
          before: { key: KEY, value: 12, dueAt: DUE },
          after: { key: KEY, value: 14, dueAt: "2026-11-20T09:00:00.000Z" },
        }),
      ]);
    });

    it("cancels a planned change and journals what it was", async () => {
      const response = await useCase.cancel(
        new RequestModel("cancel", { id: 1, operatorId: "admin-2" }),
      );

      expect(response.data?.status).toBe("cancelled");
      expect(journal).toEqual([
        expect.objectContaining({
          action: "configuration.schedule.cancel",
          actorId: "admin-2",
          before: { key: KEY, value: 12, dueAt: DUE },
        }),
      ]);
    });

    it("refuses to touch a change that is no longer planned, or unknown", async () => {
      await useCase.cancel(
        new RequestModel("cancel", { id: 1, operatorId: "a" }),
      );

      expect((await reschedule(1, 14)).message).toBe(
        "This change is no longer planned.",
      );
      expect(
        (
          await useCase.cancel(
            new RequestModel("cancel", { id: 1, operatorId: "a" }),
          )
        ).message,
      ).toBe("This change is no longer planned.");
      expect((await reschedule(9, 14)).errorCode).toBe(
        DomainErrorCodes.ENTITY_NOT_FOUND,
      );
      expect(
        (
          await useCase.cancel(
            new RequestModel("cancel", { id: 9, operatorId: "a" }),
          )
        ).errorCode,
      ).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
    });
  });

  it("lists the planned changes and those resolved in the last 30 days", async () => {
    await schedule();
    const response = await useCase.list("list");

    expect(response.data).toHaveLength(1);
    expect(changes.listedSince).toEqual(
      new Date(NOW.getTime() - RESOLVED_CHANGES_SHOWN_MS),
    );
  });

  describe("at the due date", () => {
    const due = async () => {
      await schedule();
      changes.rows[0].dueAt = new Date("2026-11-11T11:59:00Z");
      journal = [];
      return useCase.applyDue();
    };

    it("applies the change under the name of its author", async () => {
      expect(await due()).toBe(1);

      expect(configurations.updateConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { key: KEY, value: 12, operatorId: "admin-1" },
        }),
      );
      expect(changes.rows[0]).toEqual(
        expect.objectContaining({ status: "applied", reason: null }),
      );
      expect(journal).toEqual([
        expect.objectContaining({
          action: "configuration.schedule.apply",
          outcome: "success",
          entityId: "1",
        }),
      ]);
      expect(notifier.notifyNotApplied).not.toHaveBeenCalled();
    });

    it("leaves a change not yet due", async () => {
      await schedule();
      expect(await useCase.applyDue()).toBe(0);
      expect(changes.rows[0].status).toBe("scheduled");
    });

    it("leaves a setting changed by hand, and tells the author", async () => {
      await schedule();
      current = setting(10);
      changes.rows[0].dueAt = NOW;
      await useCase.applyDue();

      expect(configurations.updateConfiguration).not.toHaveBeenCalled();
      expect(changes.rows[0]).toEqual(
        expect.objectContaining({
          status: "conflict",
          reason: CHANGED_BY_HAND,
        }),
      );
      expect(notifier.notifyNotApplied).toHaveBeenCalledWith(
        changes.rows[0],
        CHANGED_BY_HAND,
      );
      expect(journal.at(-1)).toEqual(
        expect.objectContaining({ outcome: "failed", errorCode: "conflict" }),
      );
    });

    it("counts a setting that already has the value as applied", async () => {
      await schedule();
      current = setting(12);
      changes.rows[0].dueAt = NOW;
      await useCase.applyDue();

      expect(changes.rows[0]).toEqual(
        expect.objectContaining({ status: "applied", reason: ALREADY_SET }),
      );
      expect(notifier.notifyNotApplied).not.toHaveBeenCalled();
    });

    it("records a value refused at the due date, and tells the author", async () => {
      configurations.updateConfiguration.mockResolvedValue(
        new ResponseModel("u").withError(
          DomainErrorCodes.INVALID_INPUT,
          "Configuration is read-only.",
        ),
      );
      await due();

      expect(changes.rows[0]).toEqual(
        expect.objectContaining({
          status: "refused",
          reason: "Configuration is read-only.",
        }),
      );
      expect(notifier.notifyNotApplied).toHaveBeenCalledWith(
        changes.rows[0],
        "Configuration is read-only.",
      );
    });

    it("refuses a change of a setting that no longer exists", async () => {
      await schedule();
      current = null;
      changes.rows[0].dueAt = NOW;
      await useCase.applyDue();

      expect(changes.rows[0]).toEqual(
        expect.objectContaining({
          status: "refused",
          reason: "The setting no longer exists.",
        }),
      );
    });

    it("keeps the change planned when the database fails, for the next pass", async () => {
      configurations.updateConfiguration.mockResolvedValue(
        new ResponseModel("u").withError(DomainErrorCodes.SYSTEM_ERROR, "down"),
      );
      await expect(due()).rejects.toThrow("down");

      configurations.queryByKey.mockResolvedValue(
        new ResponseModel("q").withError(DomainErrorCodes.SYSTEM_ERROR, ""),
      );
      await expect(useCase.applyDue()).rejects.toThrow(
        "The setting could not be read.",
      );
      expect(changes.rows[0].status).toBe("scheduled");
    });

    it("records the outcome even when the author cannot be told", async () => {
      notifier.notifyNotApplied.mockRejectedValue(new Error("service down"));
      await schedule();
      current = setting(10);
      changes.rows[0].dueAt = NOW;

      await expect(useCase.applyDue()).resolves.toBe(1);
      expect(changes.rows[0].status).toBe("conflict");
    });
  });
});
