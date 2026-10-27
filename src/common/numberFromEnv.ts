/**
 * A number read from the environment (EV-75 lot 4). An absent, empty or
 * non-numeric value takes the default: `Number("")` is 0, which would turn an
 * empty SMTP_PORT or BCRYPT_SALT_ROUNDS into 0 instead of the default.
 */
export function numberFromEnv(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
