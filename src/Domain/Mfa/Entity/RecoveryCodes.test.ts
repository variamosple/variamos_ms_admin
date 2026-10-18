import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "./RecoveryCodes.js";

describe("recovery codes", () => {
  it("generates ten distinct codes of two groups of five", () => {
    const codes = generateRecoveryCodes();

    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
    }
  });

  it("hashes a code the same way however it is typed", () => {
    const hash = hashRecoveryCode("abcde-fgh23");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode(" ABCDE FGH23 ")).toBe(hash);
    expect(hashRecoveryCode("abcdefgh23")).toBe(hash);
    expect(hashRecoveryCode("abcde-fgh24")).not.toBe(hash);
  });

  it("normalizes the separator, spaces and case", () => {
    expect(normalizeRecoveryCode(" AbCdE - fGh23")).toBe("abcdefgh23");
  });
});
