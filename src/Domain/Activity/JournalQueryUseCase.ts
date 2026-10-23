import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type {
  AccessFilter,
  AccessRecord,
  ActivityFilter,
  ActivityRecord,
  IJournalReader,
} from "./JournalQuery.js";

/** The query string of a journal page, as the route receives it. */
export type JournalQueryInput = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_DAYS = 7;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_TEXT = 255;

const ACCESS_EVENTS = [
  "sign-in",
  "sign-in.mfa",
  "sign-in.google",
  "account.locked",
  "access.refused",
];

class InvalidFilter extends Error {}

const text = (input: JournalQueryInput, key: string): string | null => {
  const value = input[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > MAX_TEXT) {
    throw new InvalidFilter(`The filter ${key} is invalid.`);
  }
  return value.trim() || null;
};

const date = (input: JournalQueryInput, key: string): Date | null => {
  const value = text(input, key);
  if (value === null) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidFilter(`The filter ${key} is not a date.`);
  }
  return parsed;
};

const integer = (
  input: JournalQueryInput,
  key: string,
  fallback: number,
  max: number,
): number => {
  const value = text(input, key);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new InvalidFilter(`The filter ${key} is invalid.`);
  }
  return parsed;
};

const oneOf = <T extends string>(
  input: JournalQueryInput,
  key: string,
  allowed: readonly T[],
): T | null => {
  const value = text(input, key);
  if (value !== null && !allowed.includes(value as T)) {
    throw new InvalidFilter(`The filter ${key} is invalid.`);
  }
  return value as T | null;
};

/** Period, account, outcome and page, common to both journals. */
function commonFilter(input: JournalQueryInput, now: Date) {
  const to = date(input, "to") ?? now;
  const from =
    date(input, "from") ??
    new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);
  if (from > to) {
    throw new InvalidFilter("The start of the period is after its end.");
  }
  return {
    from,
    to,
    user: text(input, "user"),
    outcome: oneOf(input, "outcome", ["success", "failed"] as const),
    pageNumber: integer(input, "pageNumber", 1, Number.MAX_SAFE_INTEGER),
    pageSize: integer(input, "pageSize", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

/**
 * Reads the activity and access journals, newest first, one page at a time
 * (T-24 lot 3). Read-only: nothing here can change an entry.
 */
export class JournalQueryUseCase {
  public constructor(
    private readonly reader: IJournalReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public queryActivity(
    request: RequestModel<JournalQueryInput>,
  ): Promise<ResponseModel<ActivityRecord[]>> {
    return this.query(request, (input) => {
      const filter: ActivityFilter = {
        ...commonFilter(input, this.now()),
        action: text(input, "action"),
        entityType: text(input, "entityType"),
        entityId: text(input, "entityId"),
      };
      return this.reader.queryActivity(filter);
    });
  }

  public queryAccess(
    request: RequestModel<JournalQueryInput>,
  ): Promise<ResponseModel<AccessRecord[]>> {
    return this.query(request, (input) => {
      const filter: AccessFilter = {
        ...commonFilter(input, this.now()),
        event: oneOf(input, "event", ACCESS_EVENTS),
        reason: text(input, "reason"),
        ip: text(input, "ip"),
      };
      return this.reader.queryAccess(filter);
    });
  }

  private async query<T>(
    request: RequestModel<JournalQueryInput>,
    read: (input: JournalQueryInput) => Promise<{ rows: T[]; total: number }>,
  ): Promise<ResponseModel<T[]>> {
    const response = new ResponseModel<T[]>(request.transactionId);
    let page: { rows: T[]; total: number };
    try {
      page = await read(request.data ?? {});
    } catch (error) {
      if (error instanceof InvalidFilter) {
        return response.withError(
          DomainErrorCodes.INVALID_INPUT,
          error.message,
        );
      }
      throw error;
    }
    return response.withResponse(page.rows, page.total);
  }
}
