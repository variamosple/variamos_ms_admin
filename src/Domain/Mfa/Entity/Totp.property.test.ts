import fc from "fast-check";
import {
  base32Decode,
  base32Encode,
  TOTP_PERIOD_SECONDS,
  totpCode,
  totpStep,
  verifyTotp,
} from "./Totp.js";

// Properties checked on generated secrets and instants (EV-22)
const secret = fc
  .uint8Array({ minLength: 10, maxLength: 64 })
  .map((bytes) => Buffer.from(bytes));
// From 2020 to 2100, in ms. In the first 30 s of 1970, the step before
// the current one would be negative: a clock that far back is not a case
const instant = fc.integer({
  min: Date.UTC(2020, 0, 1),
  max: Date.UTC(2100, 0, 1),
});

describe("TOTP properties", () => {
  it("reads back any secret it encodes in base32", () => {
    fc.assert(
      fc.property(secret, (bytes) => {
        expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
      }),
    );
  });

  it("accepts the code of the current step for any secret and instant", () => {
    fc.assert(
      fc.property(secret, instant, (key, now) => {
        const code = totpCode(key, totpStep(now));

        expect(verifyTotp(key, code, now, null)).not.toBeNull();
      }),
    );
  });

  it("never accepts a code again for the step it was used for", () => {
    fc.assert(
      fc.property(
        secret,
        instant,
        fc.integer({ min: 0, max: TOTP_PERIOD_SECONDS * 1000 }),
        (key, now, later) => {
          const code = totpCode(key, totpStep(now));
          const used = verifyTotp(key, code, now, null) as number;

          const again = verifyTotp(key, code, now + later, used);

          // Only another step whose code happens to be the same may match
          expect(again === null || again > used).toBe(true);
        },
      ),
    );
  });

  it("refuses any code that is not six digits", () => {
    fc.assert(
      fc.property(
        secret,
        instant,
        fc
          .oneof(
            fc.string(),
            // Digits only, of any other length
            fc.string({
              unit: fc.constantFrom(..."0123456789"),
              maxLength: 12,
            }),
          )
          .filter((text) => !/^\d{6}$/.test(text.replace(/\s/g, ""))),
        (key, now, code) => {
          expect(verifyTotp(key, code, now, null)).toBeNull();
        },
      ),
    );
  });
});
