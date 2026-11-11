/**
 * What a verified Google ID token says about its account (EV-70 lot 5).
 * `sub` is the identifier Google recommends as the key: unique among all
 * Google accounts and never reused, whereas the address can change.
 */
export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
  // Set by Google for a Google Workspace account only
  hostedDomain?: string;
}

export type GoogleSignInRefusal =
  | "google_email_unverified"
  | "google_password_account";

export const GOOGLE_SIGN_IN_REFUSALS: readonly GoogleSignInRefusal[] = [
  "google_email_unverified",
  "google_password_account",
];

/** Google shows the claim as a boolean, and as a string in some examples. */
export const isVerifiedClaim = (value: unknown): boolean =>
  value === true || value === "true";

/**
 * Google vouches for the address of a Gmail account, and of a verified
 * Google Workspace account. Any other address was verified once, when the
 * Google account was made, and may have changed hands since.
 */
export const isGoogleAuthoritative = (profile: GoogleProfile): boolean =>
  profile.email.toLowerCase().endsWith("@gmail.com") ||
  (profile.emailVerified && Boolean(profile.hostedDomain));

export type GoogleAccountMatch =
  | { kind: "linked" }
  | { kind: "by-email"; hasPassword: boolean }
  | { kind: "none" };

export type GoogleSignInDecision =
  | { action: "sign-in" }
  | { action: "link" }
  | { action: "create" }
  | { action: "refuse"; reason: GoogleSignInRefusal };

/**
 * What a Google sign-in does with the account it finds:
 * - an account already linked to this Google account opens, whatever its
 *   address has become;
 * - an account found by its address is linked when Google vouches for the
 *   address, or when it has no password (it already signs in through
 *   Google); one with a password signs in with it, so that an address that
 *   changed hands does not open someone else's account;
 * - without any account, one is created and linked.
 * An address Google has not verified opens nothing.
 */
export const decideGoogleSignIn = (
  profile: GoogleProfile,
  match: GoogleAccountMatch,
): GoogleSignInDecision => {
  if (!profile.emailVerified) {
    return { action: "refuse", reason: "google_email_unverified" };
  }
  if (match.kind === "linked") return { action: "sign-in" };
  if (match.kind === "none") return { action: "create" };
  return isGoogleAuthoritative(profile) || !match.hasPassword
    ? { action: "link" }
    : { action: "refuse", reason: "google_password_account" };
};
