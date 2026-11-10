import { z } from "zod";
import { EMAIL_MAX, NAME_MAX, SECRET_MAX, text } from "./requestBody.js";

// Bodies of the authentication routes (EV-97 lot 6a). Business rules stay
// in the domain: these schemas only refuse a wrong type or an oversized value

export const signInBody = z.object({
  email: text(EMAIL_MAX),
  password: text(SECRET_MAX),
});

export const signInMfaBody = z.object({
  code: text(SECRET_MAX),
  // Only true trusts the browser; any other value signs in without it
  rememberDevice: z.unknown().optional(),
});

export const signUpBody = z.object({
  name: text(NAME_MAX),
  email: text(EMAIL_MAX),
  password: text(SECRET_MAX),
  passwordConfirmation: text(SECRET_MAX),
});

// A Google ID token is a signed JWT of one to two kilobytes
export const googleCallbackBody = z.object({
  credential: text(8192),
});

export const personalInformationBody = z.object({
  countryCode: z.string().max(16).nullable().optional(),
});

export const passwordUpdateBody = z.object({
  currentPassword: text(SECRET_MAX),
  newPassword: text(SECRET_MAX),
  passwordConfirmation: text(SECRET_MAX),
});

export const guestSignInBody = z.object({
  guestId: text(NAME_MAX),
});

export const redirectBody = z.object({
  url: text(2048),
});

export const forgotPasswordBody = z.object({
  email: text(EMAIL_MAX),
});

export const verifyTokenBody = z.object({
  token: text(SECRET_MAX),
});

export const resetPasswordBody = z.object({
  token: text(SECRET_MAX),
  password: text(SECRET_MAX),
});
