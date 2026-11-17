import { mock } from "vitest-mock-extended";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { AccessEntry } from "./AccessEntry.js";
import type { ActivityEntry } from "./ActivityEntry.js";
import type { IAccessJournal } from "./IAccessJournal.js";
import type { IActivityJournal } from "./IActivityJournal.js";
import { SecurityAlertPolicy } from "./SecurityAlertPolicy.js";
import {
  type INewDeviceWatcher,
  type ISecurityAlertNotifier,
  type ISecurityAlertRecipients,
  SecurityAlertDetector,
  watchedAccessJournal,
  watchedActivityJournal,
} from "./SecurityAlerts.js";

const MINUTE_MS = 60 * 1000;
const RECIPIENTS = [{ userId: "top-1", email: "top@example.com" }];

const failedSignIn = (overrides: Partial<AccessEntry> = {}): AccessEntry => ({
  event: "sign-in",
  outcome: "failed",
  reason: "wrong-password",
  userId: "user-1",
  ip: "203.0.113.7",
  method: "POST",
  path: "/auth/sign-in",
  statusCode: 401,
  ...overrides,
});

const operation = (overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
  actorId: "admin-1",
  action: "user.delete",
  entityType: "user",
  entityId: "u",
  outcome: "success",
  errorCode: null,
  before: null,
  after: null,
  transactionId: null,
  ...overrides,
});

function setup(
  policy = SecurityAlertPolicy.DEFAULT,
  newDevices?: INewDeviceWatcher,
) {
  let now = Date.parse("2026-10-26T10:00:00Z");
  const recipients = mock<ISecurityAlertRecipients>();
  recipients.list.mockResolvedValue(RECIPIENTS);
  const notifier = mock<ISecurityAlertNotifier>();
  const journal = mock<IActivityJournal>();
  const logger = mock<ILogger>();
  const detector = new SecurityAlertDetector({
    policyProvider: { getPolicy: async () => policy },
    recipients,
    notifier,
    journal,
    logger,
    newDevices,
    now: () => now,
  });
  const advance = (ms: number) => {
    now += ms;
  };
  const rules = () => notifier.notify.mock.calls.map(([, alert]) => alert);
  return { detector, recipients, notifier, journal, logger, advance, rules };
}

describe("SecurityAlertDetector, failed sign-ins", () => {
  it("raises an alert at the threshold, for the account and the address", async () => {
    const { detector, notifier, rules } = setup();

    for (let i = 0; i < 9; i++) await detector.observeAccess(failedSignIn());
    expect(notifier.notify).not.toHaveBeenCalled();

    await detector.observeAccess(failedSignIn());
    expect(rules().map(({ rule, target }) => [rule, target])).toEqual([
      ["failed-sign-ins", "account:user-1"],
      ["failed-sign-ins", "address:203.0.113.7"],
    ]);
    expect(notifier.notify.mock.calls[0]?.[0]).toEqual(RECIPIENTS);
    expect(rules()[1]?.body).toBe(
      "10 failed sign-ins in 15 minutes for address 203.0.113.7.",
    );
  });

  it("counts an unknown account by its address only", async () => {
    const { detector, rules } = setup();

    for (let i = 0; i < 10; i++) {
      await detector.observeAccess(failedSignIn({ userId: null }));
    }

    expect(rules().map(({ target }) => target)).toEqual([
      "address:203.0.113.7",
    ]);
  });

  it("forgets the failures older than the window", async () => {
    const { detector, notifier, advance } = setup();

    for (let i = 0; i < 9; i++) await detector.observeAccess(failedSignIn());
    advance(15 * MINUTE_MS);
    await detector.observeAccess(failedSignIn());

    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("sends the same alert once per cooldown", async () => {
    const { detector, rules, advance } = setup();
    const ten = async () => {
      for (let i = 0; i < 10; i++) {
        await detector.observeAccess(failedSignIn({ ip: null }));
      }
    };

    await ten();
    await ten();
    expect(rules()).toHaveLength(1);

    advance(60 * MINUTE_MS);
    await ten();
    expect(rules()).toHaveLength(2);
  });

  it("ignores the events that are not sign-ins", async () => {
    const { detector, notifier } = setup();

    for (let i = 0; i < 20; i++) {
      await detector.observeAccess(failedSignIn({ event: "access.refused" }));
    }

    expect(notifier.notify).not.toHaveBeenCalled();
  });
});

describe("SecurityAlertDetector, new devices", () => {
  it("hands a completed sign-in with its device to the new-device alert, with the scope", async () => {
    const observe = vi.fn().mockResolvedValue(undefined);
    const { detector, notifier } = setup(
      SecurityAlertPolicy.fromConfiguration({ newDeviceScope: "everyone" }),
      { observe },
    );
    const signIn = failedSignIn({
      outcome: "success",
      reason: null,
      device: { id: "device-1", userAgent: null },
    });

    await detector.observeAccess(signIn);

    expect(observe).toHaveBeenCalledWith(
      signIn,
      "everyone",
      expect.any(Number),
    );
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("does not look at a sign-in without a device, nor a failed one", async () => {
    const observe = vi.fn().mockResolvedValue(undefined);
    const { detector } = setup(undefined, { observe });

    await detector.observeAccess(
      failedSignIn({ outcome: "success", reason: "mfa_required" }),
    );
    await detector.observeAccess(
      failedSignIn({ device: { id: "device-1", userAgent: null } }),
    );

    expect(observe).not.toHaveBeenCalled();
  });

  it("logs a failure of the new-device alert, without throwing", async () => {
    const observe = vi.fn().mockRejectedValue(new Error("down"));
    const { detector, logger } = setup(undefined, { observe });

    await expect(
      detector.observeAccess(
        failedSignIn({
          outcome: "success",
          reason: null,
          device: { id: "device-1", userAgent: null },
        }),
      ),
    ).resolves.toBeUndefined();
    expect(logger.err).toHaveBeenCalledWith(new Error("down"));
  });
});

describe("SecurityAlertDetector, mass operations", () => {
  it("raises an alert at the threshold for one administrator", async () => {
    const { detector, rules } = setup();

    for (let i = 0; i < 19; i++) await detector.observeActivity(operation());
    await detector.observeActivity(operation({ actorId: "admin-2" }));
    expect(rules()).toHaveLength(0);

    await detector.observeActivity(operation());
    expect(rules().map(({ rule, target }) => [rule, target])).toEqual([
      ["mass-operations", "administrator:admin-1"],
    ]);
  });

  it("counts neither failed operations nor operations without an actor", async () => {
    const { detector, notifier } = setup();

    for (let i = 0; i < 20; i++) {
      await detector.observeActivity(operation({ outcome: "failed" }));
      await detector.observeActivity(operation({ actorId: null }));
    }

    expect(notifier.notify).not.toHaveBeenCalled();
  });
});

describe("SecurityAlertDetector, delivery", () => {
  const raiseOne = async (detector: SecurityAlertDetector) => {
    for (let i = 0; i < 10; i++) {
      await detector.observeAccess(failedSignIn({ ip: null }));
    }
  };

  it("records the alert in the activity journal", async () => {
    const { detector, journal } = setup();

    await raiseOne(detector);

    expect(journal.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        action: "security.alert",
        entityType: "security-alert",
        entityId: "account:user-1",
        after: expect.objectContaining({ rule: "failed-sign-ins" }),
      }),
    );
  });

  it("keeps the alert in the journal when nobody can receive it", async () => {
    const { detector, recipients, notifier, journal, logger } = setup();
    recipients.list.mockResolvedValue([]);

    await raiseOne(detector);

    expect(journal.record).toHaveBeenCalledOnce();
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "[ALERT] failed-sign-ins: no recipient",
    );
  });

  it("never throws: a failure is logged", async () => {
    const { detector, recipients, logger } = setup();
    recipients.list.mockRejectedValue(new Error("database down"));

    await expect(raiseOne(detector)).resolves.toBeUndefined();
    expect(logger.err).toHaveBeenCalledWith(
      expect.objectContaining({ message: "database down" }),
    );
  });
});

describe("watched journals", () => {
  it("record the access entry, then let the detector observe it", async () => {
    const journal = mock<IAccessJournal>();
    const order: string[] = [];
    journal.record.mockImplementation(async () => {
      order.push("record");
    });
    const observeAccess = vi.fn(async () => {
      order.push("observe");
    });

    const watched = watchedAccessJournal(journal, { observeAccess });
    await watched.record(failedSignIn());
    await watched.accountByEmail("a@example.com");

    expect(order).toEqual(["record", "observe"]);
    expect(journal.accountByEmail).toHaveBeenCalledWith("a@example.com");
  });

  it("record the activity entry, then let the detector observe it", async () => {
    const journal = mock<IActivityJournal>();
    const observeActivity = vi.fn(async () => {});

    await watchedActivityJournal(journal, { observeActivity }).record(
      operation(),
    );

    expect(journal.record).toHaveBeenCalledWith(operation());
    expect(observeActivity).toHaveBeenCalledWith(operation());
  });
});
