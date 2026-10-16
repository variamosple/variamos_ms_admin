import logger from "jet-logger";
import EnvVars from "#src/common/EnvVars.js";
import { MailServiceImpl } from "./MailService.js";

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
