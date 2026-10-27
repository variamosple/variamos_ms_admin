import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { AccessEntry } from "./AccessEntry.js";
import type { ActivityEntry } from "./ActivityEntry.js";
import type { IAccessJournal } from "./IAccessJournal.js";
import type { IActivityJournal } from "./IActivityJournal.js";
import type { SecurityAlertPolicy } from "./SecurityAlertPolicy.js";
import type { ISecurityAlertPolicyProvider } from "./SecurityAlertPolicyService.js";

export interface SecurityAlert {
  rule: "failed-sign-ins" | "mass-operations" | "off-hours-sign-in";
  /** What the alert is about: "account:<id>", "address:<ip>" or "administrator:<id>". */
  target: string;
  title: string;
  body: string;
}

export interface SecurityAlertRecipient {
  userId: string;
  email: string | null;
}

/** The accounts that receive the alerts. */
export interface ISecurityAlertRecipients {
  list(): Promise<SecurityAlertRecipient[]>;
}

/** Delivers an alert to its recipients, by every channel it has. */
export interface ISecurityAlertNotifier {
  notify(
    recipients: SecurityAlertRecipient[],
    alert: SecurityAlert,
  ): Promise<void>;
}

const SIGN_IN_EVENTS: ReadonlySet<AccessEntry["event"]> = new Set([
  "sign-in",
  "sign-in.mfa",
  "sign-in.google",
]);

// Above this many counted targets, the ones past every window are dropped
const SWEEP_ABOVE = 10_000;

const describeTarget = (target: string) => {
  const [kind, ...rest] = target.split(":");
  return `${kind} ${rest.join(":")}`;
};

/**
 * Watches the access and activity journals and raises the security alerts
 * of the policy (EV-88 lot D, T-24). Counts are kept in memory, like the
 * sign-in limits: the service runs as a single instance and a restart
 * starts them again. Observing never throws: a failure is logged.
 */
export class SecurityAlertDetector {
  private readonly events = new Map<string, number[]>();
  private readonly lastRaised = new Map<string, number>();

  public constructor(
    private readonly policyProvider: ISecurityAlertPolicyProvider,
    private readonly recipients: ISecurityAlertRecipients,
    private readonly notifier: ISecurityAlertNotifier,
    private readonly journal: IActivityJournal,
    private readonly logger: ILogger,
    private readonly now: () => number = Date.now,
  ) {}

  public async observeAccess(entry: AccessEntry): Promise<void> {
    try {
      if (!SIGN_IN_EVENTS.has(entry.event)) return;
      const at = this.now();
      const policy = await this.policyProvider.getPolicy();
      if (entry.outcome === "failed") {
        const { max, windowMs } = policy.failedSignIns;
        const targets = [
          entry.userId && `account:${entry.userId}`,
          entry.ip && `address:${entry.ip}`,
        ].filter((target): target is string => Boolean(target));
        for (const target of targets) {
          const count = this.count(
            `failed-sign-ins|${target}`,
            windowMs,
            at,
            policy,
          );
          if (count >= max) {
            await this.raise(
              {
                rule: "failed-sign-ins",
                target,
                title: "Repeated failed sign-ins",
                body: `${count} failed sign-ins in ${windowMs / 60_000} minutes for ${describeTarget(target)}.`,
              },
              policy.cooldownMs,
              at,
            );
          }
        }
      } else if (entry.userId && policy.isOffHours(new Date(at))) {
        const target = `account:${entry.userId}`;
        await this.raise(
          {
            rule: "off-hours-sign-in",
            target,
            title: "Sign-in outside working hours",
            body: `${describeTarget(target)} signed in at ${new Date(at).toISOString()}, outside the configured working hours.`,
          },
          policy.cooldownMs,
          at,
        );
      }
    } catch (error) {
      this.logger.err(error);
    }
  }

  public async observeActivity(entry: ActivityEntry): Promise<void> {
    try {
      if (!entry.actorId || entry.outcome !== "success") return;
      const at = this.now();
      const policy = await this.policyProvider.getPolicy();
      const { max, windowMs } = policy.massOperations;
      const target = `administrator:${entry.actorId}`;
      const count = this.count(
        `mass-operations|${target}`,
        windowMs,
        at,
        policy,
      );
      if (count >= max) {
        await this.raise(
          {
            rule: "mass-operations",
            target,
            title: "Many administration operations",
            body: `${describeTarget(target)} made ${count} administration operations in ${windowMs / 60_000} minutes.`,
          },
          policy.cooldownMs,
          at,
        );
      }
    } catch (error) {
      this.logger.err(error);
    }
  }

  /** Adds an event and returns how many fall in the window. */
  private count(
    key: string,
    windowMs: number,
    at: number,
    policy: SecurityAlertPolicy,
  ): number {
    if (this.events.size > SWEEP_ABOVE) this.sweep(at, policy);
    const recent = (this.events.get(key) ?? []).filter(
      (time) => at - time < windowMs,
    );
    recent.push(at);
    this.events.set(key, recent);
    return recent.length;
  }

  /** Drops the targets whose events are past every window. */
  private sweep(at: number, policy: SecurityAlertPolicy): void {
    const horizon = Math.max(
      policy.failedSignIns.windowMs,
      policy.massOperations.windowMs,
    );
    for (const [key, times] of this.events) {
      if (at - times[times.length - 1] >= horizon) this.events.delete(key);
    }
    for (const [key, time] of this.lastRaised) {
      if (at - time >= policy.cooldownMs) this.lastRaised.delete(key);
    }
  }

  /** Once per cooldown for a rule and a target; journal first, then notify. */
  private async raise(
    alert: SecurityAlert,
    cooldownMs: number,
    at: number,
  ): Promise<void> {
    const key = `${alert.rule}|${alert.target}`;
    const last = this.lastRaised.get(key);
    if (last !== undefined && at - last < cooldownMs) return;
    this.lastRaised.set(key, at);

    await this.journal.record({
      actorId: null,
      action: "security.alert",
      entityType: "security-alert",
      entityId: alert.target,
      outcome: "success",
      errorCode: null,
      before: null,
      after: { rule: alert.rule, title: alert.title, body: alert.body },
      transactionId: null,
    });
    const recipients = await this.recipients.list();
    if (recipients.length === 0) {
      this.logger.warn(`[ALERT] ${alert.rule}: no recipient`);
      return;
    }
    await this.notifier.notify(recipients, alert);
  }
}

/**
 * The access journal, watched by the detector. The entry is recorded first;
 * the detector runs after, without delaying the request.
 */
export function watchedAccessJournal(
  journal: IAccessJournal,
  detector: Pick<SecurityAlertDetector, "observeAccess">,
): IAccessJournal {
  return {
    record: async (entry) => {
      await journal.record(entry);
      void detector.observeAccess(entry);
    },
    accountByEmail: (email) => journal.accountByEmail(email),
  };
}

/** The activity journal, watched by the detector, like the access journal. */
export function watchedActivityJournal(
  journal: IActivityJournal,
  detector: Pick<SecurityAlertDetector, "observeActivity">,
): IActivityJournal {
  return {
    record: async (entry) => {
      await journal.record(entry);
      void detector.observeActivity(entry);
    },
  };
}
