/**
 * Text of an error that is safe to log: its stack (or name and message) and
 * its error code. Unlike `util.inspect`, it never includes the other fields
 * of the error object, such as the SQL text, bound parameters or rejected
 * values that Sequelize errors carry.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return `Non-error value thrown (${typeof error})`;
  }
  const description = error.stack ?? `${error.name}: ${error.message}`;
  const code = errorCode(error);
  return code ? `${description}\n  code: ${code}` : description;
}

function errorCode(error: Error): string | undefined {
  const withCode = error as Error & {
    code?: unknown;
    parent?: { code?: unknown };
  };
  const code = withCode.code ?? withCode.parent?.code;
  return typeof code === "string" || typeof code === "number"
    ? String(code)
    : undefined;
}
