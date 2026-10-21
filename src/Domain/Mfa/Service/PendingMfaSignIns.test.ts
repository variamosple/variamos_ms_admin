import {
  MFA_SIGN_IN_MAX_ATTEMPTS,
  MFA_SIGN_IN_TTL_MS,
  PendingMfaSignIns,
} from "./PendingMfaSignIns.js";

describe("PendingMfaSignIns", () => {
  let now: number;
  let pending: PendingMfaSignIns;

  beforeEach(() => {
    now = 1_000_000;
    pending = new PendingMfaSignIns(() => now);
  });

  it("gives an opaque random token per sign-in", () => {
    const first = pending.create("user-1");
    const second = pending.create("user-1");

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain("user-1");
    expect(pending.find(first)).toBe("user-1");
    expect(pending.find("unknown")).toBeNull();
  });

  it("expires after five minutes", () => {
    const token = pending.create("user-1");

    now += MFA_SIGN_IN_TTL_MS - 1;
    expect(pending.find(token)).toBe("user-1");
    now += 1;
    expect(pending.find(token)).toBeNull();
  });

  it("checks one code at a time per token", () => {
    const token = pending.create("user-1");

    expect(pending.claim(token)).toBe(true);
    expect(pending.claim(token)).toBe(false);
    pending.release(token);
    expect(pending.claim(token)).toBe(true);
  });

  it("ends the token at the last allowed attempt", () => {
    const token = pending.create("user-1");
    for (let i = 0; i < MFA_SIGN_IN_MAX_ATTEMPTS - 1; i++) {
      pending.claim(token);
      pending.release(token);
    }
    expect(pending.find(token)).toBe("user-1");

    pending.claim(token);
    pending.release(token);

    expect(pending.find(token)).toBeNull();
    expect(pending.claim(token)).toBe(false);
  });

  it("forgets expired sign-ins when a new one starts", () => {
    const old = pending.create("user-1");
    now += MFA_SIGN_IN_TTL_MS;
    pending.create("user-2");
    now -= MFA_SIGN_IN_TTL_MS;

    expect(pending.find(old)).toBeNull();
  });
});
