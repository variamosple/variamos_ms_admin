/**
 * Message of a caught value. A `catch` receives `unknown`: a library may
 * throw a string or a plain object, which has no `message`.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Name of a caught value, for logs that must not carry the message (a
 * Sequelize message can hold the SQL text).
 */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
