/** Configuration key of the bcrypt cost (EV-51), read at each hash. */
export const PASSWORD_HASHING_COST_KEY = "security.bcrypt_salt_rounds";

/**
 * Accepted bcrypt costs. OWASP asks for 10 at least; each step doubles the
 * time of a sign-in, so beyond 14 a sign-in takes about a second.
 */
export const PASSWORD_HASHING_COST_BOUNDS = { min: 10, max: 14 } as const;

/** Cost when neither the configuration nor the environment gives a valid one. */
export const DEFAULT_PASSWORD_HASHING_COST = 10;

const isAcceptedCost = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= PASSWORD_HASHING_COST_BOUNDS.min &&
  value <= PASSWORD_HASHING_COST_BOUNDS.max;

/** The configured cost, else the one of the environment, else the default. */
export const passwordHashingCostOf = (
  configured: unknown,
  fromEnvironment: unknown,
): number => {
  if (isAcceptedCost(configured)) return configured;
  if (isAcceptedCost(fromEnvironment)) return fromEnvironment;
  return DEFAULT_PASSWORD_HASHING_COST;
};
