import { mock } from "vitest-mock-extended";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type { AccessEntry } from "./AccessEntry.js";
import type { IActivityJournal } from "./IActivityJournal.js";
import {
  type IAccountEmails,
  type IAddressHistory,
  type IKnownDevices,
  KNOWN_ADDRESS_DAYS,
  NewDeviceAlerts,
} from "./NewDeviceAlerts.js";
import type { ISecurityAlertRecipients } from "./SecurityAlerts.js";

const AT = Date.parse("2026-11-17T21:05:30Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const FIREFOX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";

const signIn = (overrides: Partial<AccessEntry> = {}): AccessEntry => ({
  event: "sign-in",
  outcome: "success",
  reason: null,
  userId: "admin-1",
  ip: "203.0.113.7",
  method: "POST",
  path: "/auth/sign-in",
  statusCode: 200,
  device: { id: "device-new", userAgent: FIREFOX },
  ...overrides,
});

function setup() {
  const devices = mock<IKnownDevices>();
  devices.remember.mockResolvedValue({ firstForAccount: false, known: false });
  const addresses = mock<IAddressHistory>();
  // Only the sign-in being observed
  addresses.completedSignInsFrom.mockResolvedValue(1);
  const emails = mock<IAccountEmails>();
  emails.emailOf.mockResolvedValue("user@example.com");
  const administrators = mock<ISecurityAlertRecipients>();
  administrators.list.mockResolvedValue([
    { userId: "admin-1", email: "admin@example.com" },
  ]);
  const mailService = mock<IMailService>();
  const journal = mock<IActivityJournal>();
  const alerts = new NewDeviceAlerts({
    devices,
    addresses,
    emails,
    administrators,
    mailService,
    journal,
  });
  return { alerts, devices, addresses, emails, mailService, journal };
}

describe("NewDeviceAlerts", () => {
  it("mails an administrator signed in from a new browser and a new address", async () => {
    const { alerts, devices, addresses, mailService, journal } = setup();

    await alerts.observe(signIn(), "administrators", AT);

    expect(devices.remember).toHaveBeenCalledWith("admin-1", "device-new");
    expect(addresses.completedSignInsFrom).toHaveBeenCalledWith(
      "admin-1",
      "203.0.113.7",
      new Date(AT - KNOWN_ADDRESS_DAYS * DAY_MS),
    );
    expect(mailService.sendNewDeviceMail).toHaveBeenCalledWith(
      "admin@example.com",
      {
        when: "2026-11-17 21:05 UTC",
        browser: "Firefox on Linux",
        ip: "203.0.113.7",
      },
    );
    expect(journal.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "security.alert",
        entityId: "account:admin-1",
        after: {
          rule: "new-device-sign-in",
          browser: "Firefox on Linux",
          ip: "203.0.113.7",
        },
      }),
    );
  });

  it("remembers the browser of every account, but mails only the administrators by default", async () => {
    const { alerts, devices, mailService, journal } = setup();

    await alerts.observe(signIn({ userId: "user-1" }), "administrators", AT);

    expect(devices.remember).toHaveBeenCalledWith("user-1", "device-new");
    expect(mailService.sendNewDeviceMail).not.toHaveBeenCalled();
    expect(journal.record).not.toHaveBeenCalled();
  });

  it("mails any account at its own address when the scope is everyone", async () => {
    const { alerts, emails, mailService } = setup();

    await alerts.observe(signIn({ userId: "user-1" }), "everyone", AT);

    expect(emails.emailOf).toHaveBeenCalledWith("user-1");
    expect(mailService.sendNewDeviceMail).toHaveBeenCalledWith(
      "user@example.com",
      expect.anything(),
    );
  });

  it("sends nothing to an account without an address", async () => {
    const { alerts, emails, mailService } = setup();
    emails.emailOf.mockResolvedValue(null);

    await alerts.observe(signIn({ userId: "user-1" }), "everyone", AT);

    expect(mailService.sendNewDeviceMail).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the first browser of the account",
      { firstForAccount: true, known: false },
    ],
    ["a known browser", { firstForAccount: false, known: true }],
  ])("learns %s without a mail", async (_, memory) => {
    const { alerts, devices, addresses, mailService } = setup();
    devices.remember.mockResolvedValue(memory);

    await alerts.observe(signIn(), "administrators", AT);

    expect(addresses.completedSignInsFrom).not.toHaveBeenCalled();
    expect(mailService.sendNewDeviceMail).not.toHaveBeenCalled();
  });

  it("sends nothing for a new browser at an address the account already used", async () => {
    const { alerts, addresses, mailService } = setup();
    addresses.completedSignInsFrom.mockResolvedValue(2);

    await alerts.observe(signIn(), "administrators", AT);

    expect(mailService.sendNewDeviceMail).not.toHaveBeenCalled();
  });

  it("remembers the browser but sends nothing when the scope is off", async () => {
    const { alerts, devices, addresses, mailService } = setup();

    await alerts.observe(signIn(), "off", AT);

    expect(devices.remember).toHaveBeenCalledWith("admin-1", "device-new");
    expect(addresses.completedSignInsFrom).not.toHaveBeenCalled();
    expect(mailService.sendNewDeviceMail).not.toHaveBeenCalled();
  });

  it("mails without an address, naming it unknown", async () => {
    const { alerts, addresses, mailService } = setup();

    await alerts.observe(
      signIn({ ip: null, device: { id: "device-new", userAgent: null } }),
      "administrators",
      AT,
    );

    expect(addresses.completedSignInsFrom).not.toHaveBeenCalled();
    expect(mailService.sendNewDeviceMail).toHaveBeenCalledWith(
      "admin@example.com",
      expect.objectContaining({ ip: "unknown", browser: "an unknown browser" }),
    );
  });

  it("does nothing without an account or a browser", async () => {
    const { alerts, devices } = setup();

    await alerts.observe(signIn({ userId: null }), "everyone", AT);
    await alerts.observe(signIn({ device: undefined }), "everyone", AT);

    expect(devices.remember).not.toHaveBeenCalled();
  });
});
