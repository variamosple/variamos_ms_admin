/**
 * Writes the operation logs of the domain. Implemented over jet-logger in
 * Infrastructure and given to each use case by the composition (T-18 lot 3d).
 */
export interface ILogger {
  info(content: unknown): void;
  warn(content: unknown): void;
  err(content: unknown): void;
}
