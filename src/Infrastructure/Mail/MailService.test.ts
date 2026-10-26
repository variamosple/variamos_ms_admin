import logger from "jet-logger";
import EnvVars from "#src/common/EnvVars.js";
import { describeDuration, MailServiceImpl } from "./MailService.js";

describe("MailServiceImpl logging", () => {
  const originalSmtp = { ...EnvVars.SMTP };

  beforeEach(() => {
    // No SMTP credentials outside production: the mail is only simulated
    Object.defineProperty(EnvVars, "SMTP", {
      value: { ...originalSmtp, USER: "", PASSWORD: "" },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(EnvVars, "SMTP", {
      value: originalSmtp,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("logs a simulated mail without its content or full address", async () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const service = new MailServiceImpl();

    const sent = await service.sendMail(
      "alice@example.com",
      "Password reset",
      '<a href="https://app.example.com/reset?token=reset-token-value">Reset</a>',
    );

    expect(sent).toBe(true);
    const logged = JSON.stringify(infoSpy.mock.calls);
    expect(logged).toContain("a***@example.com");
    expect(logged).toContain("Password reset");
    expect(logged).not.toContain("alice@example.com");
    expect(logged).not.toContain("reset-token-value");
  });
});

describe("MailServiceImpl messages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("frames the reset link with the VariaMos logo and signature", async () => {
    const service = new MailServiceImpl();
    const send = vi.spyOn(service, "sendMail").mockResolvedValue(true);

    await service.sendPasswordResetMail(
      "alice@example.com",
      "https://app.example.com/reset?token=abc",
      60 * 60 * 1000,
    );

    const [to, subject, html] = send.mock.calls[0] as [string, string, string];
    expect(to).toBe("alice@example.com");
    expect(subject).toBe("VariaMos - Password Recovery Request");
    expect(html).toContain('href="https://app.example.com/reset?token=abc"');
    expect(html).toContain("valid for the next <strong>1 hour</strong>");
    expect(html).toContain("VariaMosLogo.png");
    expect(html).toContain("The VariaMos Team");
  });

  it("tells the owner that their second factor was turned off", async () => {
    const service = new MailServiceImpl();
    const send = vi.spyOn(service, "sendMail").mockResolvedValue(true);

    await expect(service.sendMfaResetMail("bea@example.com")).resolves.toBe(
      true,
    );

    const [to, subject, html] = send.mock.calls[0] as [string, string, string];
    expect(to).toBe("bea@example.com");
    expect(subject).toBe("VariaMos - Two-factor authentication turned off");
    expect(html).toContain("turned off two-factor authentication");
    expect(html).toContain("The VariaMos Team");
  });

  it("points the owner of an address to sign-in and recovery", async () => {
    const service = new MailServiceImpl();
    const send = vi.spyOn(service, "sendMail").mockResolvedValue(true);

    await service.sendExistingAccountMail(
      "cleo@example.com",
      "https://app.example.com/#/login",
      "https://app.example.com/#/forgot-password",
    );

    const [to, , html] = send.mock.calls[0] as [string, string, string];
    expect(to).toBe("cleo@example.com");
    expect(html).toContain('href="https://app.example.com/#/login"');
    expect(html).toContain('href="https://app.example.com/#/forgot-password"');
  });

  it("sends a security alert whose text is never read as markup", async () => {
    const service = new MailServiceImpl();
    const send = vi.spyOn(service, "sendMail").mockResolvedValue(true);

    await service.sendSecurityAlertMail(
      "dana@example.com",
      "Repeated failed sign-ins",
      '10 failed sign-ins for address <script>"x"</script>.',
    );

    const [to, subject, html] = send.mock.calls[0] as [string, string, string];
    expect(to).toBe("dana@example.com");
    expect(subject).toBe("VariaMos - Security alert: Repeated failed sign-ins");
    expect(html).toContain("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("describeDuration", () => {
  it.each([
    [60 * 60 * 1000, "1 hour"],
    [2 * 60 * 60 * 1000, "2 hours"],
    [30 * 60 * 1000, "30 minutes"],
    [60 * 1000, "1 minute"],
    [0, "1 minute"],
  ])("describes %i ms as %s", (ms, text) => {
    expect(describeDuration(ms)).toBe(text);
  });
});
