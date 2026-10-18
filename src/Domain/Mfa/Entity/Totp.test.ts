// Base32 test values of RFC 4648 and RFC 6238
// cspell:ignore MZXW YTBOI GEZDGNBVGY TQOJQGEZDGNBVGY TQOJQ mzxw
import {
  base32Decode,
  base32Encode,
  otpauthUri,
  TOTP_PERIOD_SECONDS,
  totpCode,
  totpStep,
  verifyTotp,
} from "./Totp.js";

// RFC 6238, appendix B: the SHA-1 secret and its 8-digit codes
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

describe("TOTP (RFC 6238)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("gives the RFC code at %i s", (seconds, code) => {
    expect(totpCode(RFC_SECRET, totpStep(seconds * 1000), 8)).toBe(code);
  });

  it("gives the last 6 digits in the default length", () => {
    expect(totpCode(RFC_SECRET, totpStep(59_000))).toBe("287082");
  });

  it("encodes and decodes base32 (RFC 4648)", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Encode(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("mzxw 6ytb oi").toString()).toBe("foobar");
    expect(() => base32Decode("MZ1W")).toThrow("Invalid base32");
  });
});

describe("verifyTotp", () => {
  const now = 1_111_111_111_000;
  const step = totpStep(now);
  const codeAt = (s: number) => totpCode(RFC_SECRET, s);

  it("accepts the current code and one step of drift each way", () => {
    expect(verifyTotp(RFC_SECRET, codeAt(step), now, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, codeAt(step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, codeAt(step + 1), now, null)).toBe(step + 1);
  });

  it("refuses a code two steps away", () => {
    expect(verifyTotp(RFC_SECRET, codeAt(step - 2), now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, codeAt(step + 2), now, null)).toBeNull();
  });

  it("refuses a code already used, and any older one", () => {
    expect(verifyTotp(RFC_SECRET, codeAt(step), now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, codeAt(step - 1), now, step)).toBeNull();
    expect(
      verifyTotp(
        RFC_SECRET,
        codeAt(step),
        now + TOTP_PERIOD_SECONDS * 1000,
        step - 1,
      ),
    ).toBe(step);
  });

  it.each(["", "12345", "1234567", "12a456", "abcdef"])(
    "refuses the malformed code %j",
    (code) => {
      expect(verifyTotp(RFC_SECRET, code, now, null)).toBeNull();
    },
  );

  it("ignores spaces in the code", () => {
    const code = codeAt(step);
    expect(
      verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now, null),
    ).toBe(step);
  });
});

describe("otpauthUri", () => {
  it("builds the address of the QR code", () => {
    expect(otpauthUri("VariaMos", "ana@example.com", RFC_SECRET)).toBe(
      "otpauth://totp/VariaMos:ana%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=VariaMos&algorithm=SHA1&digits=6&period=30",
    );
  });
});
