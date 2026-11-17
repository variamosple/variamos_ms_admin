import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type { AccessEntry } from "./AccessEntry.js";
import { describeUserAgent } from "./describeUserAgent.js";
import type { IActivityJournal } from "./IActivityJournal.js";
import type { NewDeviceScope } from "./SecurityAlertPolicy.js";
import type {
  INewDeviceWatcher,
  ISecurityAlertRecipients,
} from "./SecurityAlerts.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** An address seen on the account this recently is not a new one. */
export const KNOWN_ADDRESS_DAYS = 90;

/** What the devices of an account said before this sign-in. */
export interface DeviceMemory {
  /** No device was remembered for the account yet. */
  firstForAccount: boolean;
  /** This device was already remembered for the account. */
  known: boolean;
}

/** The devices seen on each account, kept as a digest of their identifier. */
export interface IKnownDevices {
  /** Remembers the device and says what was known before. */
  remember(userId: string, deviceId: string): Promise<DeviceMemory>;
}

/** The completed sign-ins of an account from an address. */
export interface IAddressHistory {
  completedSignInsFrom(
    userId: string,
    ip: string,
    since: Date,
  ): Promise<number>;
}

/** The address of an active account; null when there is none. */
export interface IAccountEmails {
  emailOf(userId: string): Promise<string | null>;
}

export interface NewDeviceAlertDependencies {
  devices: IKnownDevices;
  addresses: IAddressHistory;
  emails: IAccountEmails;
  administrators: ISecurityAlertRecipients;
  mailService: Pick<IMailService, "sendNewDeviceMail">;
  journal: IActivityJournal;
}

/**
 * A completed sign-in from a device and an address the account has not
 * used mails the account itself (EV-88, 2026-11-17): only its owner knows
 * whether it was them. Devices are remembered for every account; the first
 * one an account uses is learned without a mail, so that the first days
 * after the release send nothing. The scope says whose accounts are mailed.
 */
export class NewDeviceAlerts implements INewDeviceWatcher {
  public constructor(private readonly deps: NewDeviceAlertDependencies) {}

  public async observe(
    entry: AccessEntry,
    scope: NewDeviceScope,
    at: number,
  ): Promise<void> {
    const { userId, device, ip } = entry;
    if (!userId || !device) return;
    const memory = await this.deps.devices.remember(userId, device.id);
    if (memory.firstForAccount || memory.known || scope === "off") return;
    // The journal holds this sign-in already: the address is known when it
    // completed another one in the period
    const since = new Date(at - KNOWN_ADDRESS_DAYS * DAY_MS);
    if (
      ip &&
      (await this.deps.addresses.completedSignInsFrom(userId, ip, since)) > 1
    ) {
      return;
    }
    const email = await this.emailFor(userId, scope);
    if (!email) return;

    const browser = describeUserAgent(device.userAgent);
    const when = new Date(at).toISOString().replace("T", " ").slice(0, 16);
    await this.deps.journal.record({
      actorId: null,
      action: "security.alert",
      entityType: "security-alert",
      entityId: `account:${userId}`,
      outcome: "success",
      errorCode: null,
      before: null,
      after: { rule: "new-device-sign-in", browser, ip },
      transactionId: null,
    });
    await this.deps.mailService.sendNewDeviceMail(email, {
      when: `${when} UTC`,
      browser,
      ip: ip ?? "unknown",
    });
  }

  private async emailFor(
    userId: string,
    scope: Exclude<NewDeviceScope, "off">,
  ): Promise<string | null> {
    if (scope === "everyone") return this.deps.emails.emailOf(userId);
    const administrators = await this.deps.administrators.list();
    return (
      administrators.find((admin) => admin.userId === userId)?.email ?? null
    );
  }
}
