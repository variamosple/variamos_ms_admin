import {
  decideGoogleSignIn,
  type GoogleProfile,
  isGoogleAuthoritative,
  isVerifiedClaim,
} from "./GoogleIdentity.js";

const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: "sub-1",
  email: "someone@outlook.com",
  name: "Someone",
  emailVerified: true,
  ...over,
});

describe("Google identity (EV-70 lot 5)", () => {
  it.each([
    [true, true],
    ["true", true],
    [false, false],
    ["false", false],
    [undefined, false],
    [1, false],
  ])("reads the email_verified claim %j as %s", (claim, verified) => {
    expect(isVerifiedClaim(claim)).toBe(verified);
  });

  it.each([
    ["a Gmail address", profile({ email: "Someone@Gmail.com" }), true],
    [
      "a verified Workspace address",
      profile({ email: "a@uni.edu", hostedDomain: "uni.edu" }),
      true,
    ],
    [
      "an unverified Workspace address",
      profile({
        email: "a@uni.edu",
        hostedDomain: "uni.edu",
        emailVerified: false,
      }),
      false,
    ],
    ["any other address", profile(), false],
    [
      "an address that only ends like Gmail",
      profile({ email: "a@notgmail.com" }),
      false,
    ],
  ])("vouches or not for %s", (_label, p, expected) => {
    expect(isGoogleAuthoritative(p)).toBe(expected);
  });

  it("opens nothing for an unverified address, even a linked one", () => {
    expect(
      decideGoogleSignIn(profile({ emailVerified: false }), { kind: "linked" }),
    ).toEqual({ action: "refuse", reason: "google_email_unverified" });
  });

  it("opens a linked account and creates an unknown one", () => {
    expect(decideGoogleSignIn(profile(), { kind: "linked" })).toEqual({
      action: "sign-in",
    });
    expect(decideGoogleSignIn(profile(), { kind: "none" })).toEqual({
      action: "create",
    });
  });

  it.each([
    ["Gmail, with a password", profile({ email: "a@gmail.com" }), true, "link"],
    ["other, without a password", profile(), false, "link"],
    ["other, with a password", profile(), true, "refuse"],
    [
      "Workspace, with a password",
      profile({ email: "a@uni.edu", hostedDomain: "uni.edu" }),
      true,
      "link",
    ],
  ])("found by its address (%s): %s", (_label, p, hasPassword, action) => {
    expect(
      decideGoogleSignIn(p, { kind: "by-email", hasPassword }).action,
    ).toBe(action);
  });
});
