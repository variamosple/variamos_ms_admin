import fc from "fast-check";
import { hashRecoveryCode, normalizeRecoveryCode } from "./RecoveryCodes.js";

// A recovery code as shown to the user: two groups of five base32 letters
const shownCode = fc
  .string({
    unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz234567"),
    minLength: 10,
    maxLength: 10,
  })
  .map((raw) => `${raw.slice(0, 5)}-${raw.slice(5)}`);

// The same code as someone may type it: any case, spaces and dashes anywhere
const typedAs = (code: string) =>
  fc
    .array(
      fc.record({
        upper: fc.boolean(),
        before: fc.constantFrom("", "", " ", "-", "  "),
      }),
      { minLength: code.length, maxLength: code.length },
    )
    .map((typing) =>
      [...code]
        .map((char, index) => {
          const { upper, before } = typing[index] as {
            upper: boolean;
            before: string;
          };
          return before + (upper ? char.toUpperCase() : char);
        })
        .join(""),
    );

describe("recovery code properties", () => {
  it("recognizes a code whatever its case, spaces and dashes", () => {
    fc.assert(
      fc.property(
        shownCode.chain((code) => fc.tuple(fc.constant(code), typedAs(code))),
        ([code, typed]) => {
          expect(hashRecoveryCode(typed)).toBe(hashRecoveryCode(code));
        },
      ),
    );
  });

  it("tells apart two codes that differ once normalized", () => {
    fc.assert(
      fc.property(shownCode, shownCode, (first, second) => {
        fc.pre(normalizeRecoveryCode(first) !== normalizeRecoveryCode(second));

        expect(hashRecoveryCode(first)).not.toBe(hashRecoveryCode(second));
      }),
    );
  });
});
