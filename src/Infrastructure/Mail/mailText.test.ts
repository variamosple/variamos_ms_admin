import { MailServiceImpl } from "./MailService.js";
import { mailText } from "./mailText.js";

const settings = {
  host: "smtp.example.com",
  port: 587,
  user: "",
  password: "",
  from: '"VariaMos" <noreply@example.com>',
  production: false,
};

/** The HTML each template of MailService gives, without sending it. */
const htmlOf = async (
  send: (service: MailServiceImpl) => Promise<boolean>,
): Promise<string> => {
  const service = new MailServiceImpl(settings);
  const spy = vi.spyOn(service, "sendMail").mockResolvedValue(true);
  await send(service);
  return spy.mock.calls[0]?.[2] ?? "";
};

const linksOf = (html: string) =>
  [...html.matchAll(/href="([^"]*)"/g)].map(([, url]) => url);

type Send = (service: MailServiceImpl) => Promise<boolean>;

const sendReset: Send = (s) =>
  s.sendPasswordResetMail(
    "a@example.com",
    "https://app.example.com/#/reset-password?token=abc&x=1",
    3_600_000,
  );

const TEMPLATES: [string, Send][] = [
  ["password reset", sendReset],
  ["second factor turned off", (s) => s.sendMfaResetMail("a@example.com")],
  [
    "sign-up with a known address",
    (s) =>
      s.sendExistingAccountMail(
        "a@example.com",
        "https://app.example.com/#/sign-in",
        "https://app.example.com/#/forgot-password",
      ),
  ],
  [
    "security alert",
    (s) => s.sendSecurityAlertMail("a@example.com", "Title", "Body."),
  ],
  [
    "new device",
    (s) =>
      s.sendNewDeviceMail("a@example.com", {
        when: "2026-11-23 10:00 UTC",
        browser: "Firefox on Linux",
        ip: "an address",
      }),
  ],
  [
    "service alert",
    (s) => s.sendServiceAlertMail("a@example.com", "Title", "Body."),
  ],
];

/** Every mail leaves with a plain-text version (ADM-N35). */
describe("mailText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(TEMPLATES)(
    "keeps every link of the %s mail and no markup",
    async (_, send) => {
      const html = await htmlOf(send);

      const text = mailText(html);

      for (const url of linksOf(html)) {
        expect(text).toContain(url?.replaceAll("&amp;", "&"));
      }
      expect(text).not.toMatch(/<[a-z/!]/i);
      expect(text).not.toMatch(/&[a-z#0-9]+;/i);
      expect(text).toContain("The VariaMos Team");
      expect(text).not.toMatch(/\n{3}/);
    },
  );

  it("writes the button with its address, and the address alone once", async () => {
    const html = await htmlOf(sendReset);

    const text = mailText(html);

    expect(text).toContain(
      "Reset Password (https://app.example.com/#/reset-password?token=abc&x=1)",
    );
    expect(text).toMatch(
      /\nhttps:\/\/app\.example\.com\/#\/reset-password\?token=abc&x=1\n/,
    );
    expect(text).toContain("valid for the next 1 hour:");
  });

  it("writes an inline link as its label and its address", () => {
    expect(
      mailText(
        '<p>Please <a href="https://x.example/in" style="c">sign in</a>.</p>',
      ),
    ).toBe("Please sign in (https://x.example/in).");
  });

  it("gives back escaped text as it was written, never as markup", async () => {
    const html = await htmlOf((s) =>
      s.sendSecurityAlertMail(
        "a@example.com",
        "Tom & Jerry",
        'Sign-ins from <script>"x"</script> &amp; more.',
      ),
    );

    const text = mailText(html);

    expect(text).toContain("Tom & Jerry");
    expect(text).toContain('Sign-ins from <script>"x"</script> &amp; more.');
  });
});
