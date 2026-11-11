import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { refusalOfConfigurationValue } from "../Entity/AppliedConfigurationKeys.js";
import type { ConfigurationValue } from "../Entity/Configuration.js";
import {
  canScheduleConfiguration,
  decisionAtDueDate,
  refusalOfDueDate,
  type ScheduledChangeOutcome,
  type ScheduledConfigurationChange,
  sameConfigurationValue,
} from "../Entity/ScheduledConfigurationChange.js";
import type {
  IScheduledConfigurationChangeRepository,
  PlannedChange,
} from "../Repository/IScheduledConfigurationChangeRepository.js";
import type { IScheduledChangeNotifier } from "../Service/IScheduledChangeNotifier.js";
import type { ConfigurationUseCase } from "./ConfigurationUseCase.js";

export interface ScheduleConfigurationChangeRequest {
  key: string;
  value: ConfigurationValue;
  /** An ISO 8601 instant. */
  dueAt: string;
  operatorId: string;
}

export interface RescheduleConfigurationChangeRequest {
  id: number;
  value: ConfigurationValue;
  dueAt: string;
  operatorId: string;
}

export interface CancelConfigurationChangeRequest {
  id: number;
  operatorId: string;
}

/** Resolved changes stay listed this long, so that a refusal is seen. */
export const RESOLVED_CHANGES_SHOWN_MS = 30 * 24 * 60 * 60 * 1000;

const APPLY_TRANSACTION = "applyScheduledConfigurationChange";

// Failures that a later pass may not meet: the change stays planned
const TRANSIENT_ERRORS: ReadonlySet<string> = new Set([
  DomainErrorCodes.SYSTEM_ERROR,
  DomainErrorCodes.UNAVAILABLE,
]);

const NO_LONGER_PLANNED = "This change is no longer planned.";

const journalValues = (change: ScheduledConfigurationChange) => ({
  key: change.key,
  value: change.newValue,
  dueAt: change.dueAt.toISOString(),
});

/**
 * Changes of the settings users notice, planned for a later date (EV-115
 * lot B). A change is checked as a save would be when it is planned, then
 * applied through the configuration use case, under the name of its
 * author, when it is due.
 */
export class ScheduledConfigurationChangeUseCase {
  public constructor(
    private readonly changes: IScheduledConfigurationChangeRepository,
    private readonly configurations: Pick<
      ConfigurationUseCase,
      "queryByKey" | "updateConfiguration"
    >,
    private readonly journal: IActivityJournal,
    private readonly notifier: IScheduledChangeNotifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async list(
    transactionId: string,
  ): Promise<ResponseModel<ScheduledConfigurationChange[]>> {
    const since = new Date(this.now().getTime() - RESOLVED_CHANGES_SHOWN_MS);
    return new ResponseModel<ScheduledConfigurationChange[]>(
      transactionId,
    ).withResponse(await this.changes.list(since));
  }

  public schedule(
    request: RequestModel<ScheduleConfigurationChangeRequest>,
  ): Promise<ResponseModel<ScheduledConfigurationChange>> {
    const data = request.data;
    return withJournal(
      this.journal,
      {
        actorId: data?.operatorId,
        action: "configuration.schedule",
        entityType: "configuration",
        entityId: data?.key,
        after: data ? { value: data.value, dueAt: data.dueAt } : null,
        transactionId: request.transactionId,
      },
      async () => {
        const response = new ResponseModel<ScheduledConfigurationChange>(
          request.transactionId,
        );
        if (!data) {
          return response.withError(
            DomainErrorCodes.INVALID_INPUT,
            "Request data is required.",
          );
        }
        const planned = await this.plan(response, data);
        if (!planned) return response;
        const created = await this.changes.create({
          ...planned,
          key: data.key,
          createdBy: data.operatorId,
        });
        return created
          ? response.withResponse(created)
          : response.withError(
              DomainErrorCodes.DUPLICATE_ENTITY,
              "A change of this setting is already planned: edit or cancel it.",
            );
      },
      (response) =>
        response.data
          ? { after: { id: response.data.id, ...journalValues(response.data) } }
          : {},
    );
  }

  public reschedule(
    request: RequestModel<RescheduleConfigurationChangeRequest>,
  ): Promise<ResponseModel<ScheduledConfigurationChange>> {
    const data = request.data;
    let before: ScheduledConfigurationChange | undefined;
    return withJournal(
      this.journal,
      {
        actorId: data?.operatorId,
        action: "configuration.schedule.update",
        entityType: "scheduled_configuration_change",
        entityId: data?.id,
        after: data ? { value: data.value, dueAt: data.dueAt } : null,
        transactionId: request.transactionId,
      },
      async () => {
        const response = new ResponseModel<ScheduledConfigurationChange>(
          request.transactionId,
        );
        if (!data) {
          return response.withError(
            DomainErrorCodes.INVALID_INPUT,
            "Request data is required.",
          );
        }
        before = (await this.changes.findById(data.id)) ?? undefined;
        if (!before) return this.notFound(response);
        if (before.status !== "scheduled") {
          return response.withError(
            DomainErrorCodes.INVALID_INPUT,
            NO_LONGER_PLANNED,
          );
        }
        // Planned again from the setting as it now is
        const planned = await this.plan(response, { ...data, key: before.key });
        if (!planned) return response;
        const updated = await this.changes.reschedule(data.id, {
          ...planned,
          updatedBy: data.operatorId,
        });
        return updated
          ? response.withResponse(updated)
          : response.withError(
              DomainErrorCodes.INVALID_INPUT,
              NO_LONGER_PLANNED,
            );
      },
      (response) =>
        response.data && before
          ? {
              before: journalValues(before),
              after: journalValues(response.data),
            }
          : {},
    );
  }

  public cancel(
    request: RequestModel<CancelConfigurationChangeRequest>,
  ): Promise<ResponseModel<ScheduledConfigurationChange>> {
    const data = request.data;
    return withJournal(
      this.journal,
      {
        actorId: data?.operatorId,
        action: "configuration.schedule.cancel",
        entityType: "scheduled_configuration_change",
        entityId: data?.id,
        transactionId: request.transactionId,
      },
      async () => {
        const response = new ResponseModel<ScheduledConfigurationChange>(
          request.transactionId,
        );
        if (!data) {
          return response.withError(
            DomainErrorCodes.INVALID_INPUT,
            "Request data is required.",
          );
        }
        const cancelled = await this.changes.cancel(data.id, data.operatorId);
        if (cancelled) return response.withResponse(cancelled);
        return (await this.changes.findById(data.id))
          ? response.withError(
              DomainErrorCodes.INVALID_INPUT,
              NO_LONGER_PLANNED,
            )
          : this.notFound(response);
      },
      (response) =>
        response.data ? { before: journalValues(response.data) } : {},
    );
  }

  /**
   * Applies the changes that are due, called every minute by the
   * background jobs. A change missed while the service was stopped is
   * applied at the next pass; the journal keeps the real time.
   */
  public applyDue(): Promise<number> {
    return this.changes.resolveDue(this.now(), (change) =>
      this.resolve(change),
    );
  }

  private async resolve(
    change: ScheduledConfigurationChange,
  ): Promise<ScheduledChangeOutcome> {
    const current = await this.configurations.queryByKey(
      new RequestModel(APPLY_TRANSACTION, change.key),
    );
    let outcome: ScheduledChangeOutcome;
    if (current.errorCode === DomainErrorCodes.ENTITY_NOT_FOUND) {
      outcome = { status: "refused", reason: "The setting no longer exists." };
    } else if (current.errorCode || !current.data) {
      throw new Error(current.message || "The setting could not be read.");
    } else {
      const decision = decisionAtDueDate(change, current.data);
      outcome = decision === "apply" ? await this.apply(change) : decision;
    }

    await this.journal.record({
      actorId: null,
      action: "configuration.schedule.apply",
      entityType: "scheduled_configuration_change",
      entityId: String(change.id),
      outcome: outcome.status === "applied" ? "success" : "failed",
      errorCode: outcome.status === "applied" ? null : outcome.status,
      before: null,
      after: { ...journalValues(change), reason: outcome.reason },
      transactionId: APPLY_TRANSACTION,
    });
    if (outcome.status !== "applied") {
      try {
        await this.notifier.notifyNotApplied(
          change,
          outcome.reason ?? outcome.status,
        );
      } catch {
        // The notifier logs its own failures; the outcome stays recorded
      }
    }
    return outcome;
  }

  private async apply(
    change: ScheduledConfigurationChange,
  ): Promise<ScheduledChangeOutcome> {
    const saved = await this.configurations.updateConfiguration(
      new RequestModel(APPLY_TRANSACTION, {
        key: change.key,
        value: change.newValue,
        operatorId: change.createdBy,
      }),
    );
    if (!saved.errorCode) return { status: "applied", reason: null };
    if (TRANSIENT_ERRORS.has(String(saved.errorCode))) {
      throw new Error(saved.message || "The setting could not be saved.");
    }
    return {
      status: "refused",
      reason: saved.message || "The setting refused the value.",
    };
  }

  /**
   * Checks a planned value and date as a save would; answers the change to
   * record, or null with the refusal set on the response.
   */
  private async plan(
    response: ResponseModel<ScheduledConfigurationChange>,
    data: {
      key: string;
      value: ConfigurationValue;
      dueAt: string;
      operatorId: string;
    },
  ): Promise<PlannedChange | null> {
    const refuse = (code: DomainErrorCodes, message: string) => {
      response.withError(code, message);
      return null;
    };
    if (data.value === undefined || data.value === null) {
      return refuse(DomainErrorCodes.INVALID_INPUT, "A value is required.");
    }
    if (!canScheduleConfiguration(data.key)) {
      return refuse(
        DomainErrorCodes.INVALID_INPUT,
        "Only the settings users notice can be changed at a later date.",
      );
    }
    const dueAt = new Date(data.dueAt);
    const dateRefusal = refusalOfDueDate(dueAt, this.now());
    if (dateRefusal) return refuse(DomainErrorCodes.INVALID_INPUT, dateRefusal);

    const current = await this.configurations.queryByKey(
      new RequestModel(response.transactionId, data.key),
    );
    if (current.errorCode || !current.data) {
      return refuse(
        (current.errorCode as DomainErrorCodes) ||
          DomainErrorCodes.ENTITY_NOT_FOUND,
        current.message || `Configuration with key '${data.key}' not found.`,
      );
    }
    const configuration = current.data;
    if (configuration.requiresMfa) {
      return refuse(
        DomainErrorCodes.MFA_REQUIRED,
        `Updating configuration '${data.key}' requires MFA validation.`,
      );
    }
    const valueRefusal = refusalOfConfigurationValue(data.key, data.value);
    if (valueRefusal)
      return refuse(DomainErrorCodes.INVALID_INPUT, valueRefusal);

    const previousValue = configuration.value;
    const baseUpdatedAt = configuration.updatedAt ?? null;
    if (sameConfigurationValue(previousValue, data.value)) {
      return refuse(
        DomainErrorCodes.INVALID_INPUT,
        "The setting already has this value.",
      );
    }
    // The checks of a save (type, read-only, secret mask)
    try {
      configuration.checkNewValue(data.value);
    } catch (e) {
      return refuse(DomainErrorCodes.INVALID_INPUT, (e as Error).message);
    }
    return { previousValue, newValue: data.value, baseUpdatedAt, dueAt };
  }

  private notFound(
    response: ResponseModel<ScheduledConfigurationChange>,
  ): ResponseModel<ScheduledConfigurationChange> {
    return response.withError(
      DomainErrorCodes.ENTITY_NOT_FOUND,
      "This planned change does not exist.",
    );
  }
}
