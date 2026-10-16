/**
 * Placeholder shown instead of a secret configuration value. A secret never
 * leaves the API in clear; clients see this mask instead.
 */
export const SECRET_MASK = "********";

// Mask previously sent for micro-service configurations, still shown by
// clients until they are updated.
const LEGACY_SECRET_MASK = "••••••••";

/**
 * True when the value is a mask sent back by a client, not a new secret: it
 * must never overwrite the stored secret.
 */
export function isSecretMask(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed === SECRET_MASK || trimmed === LEGACY_SECRET_MASK;
}
