/** Filters shared by the two journals (T-24 lot 3). */
interface JournalFilter {
  from: Date;
  to: Date;
  /** An account id, or a part of a name or an e-mail. */
  user: string | null;
  outcome: "success" | "failed" | null;
  pageNumber: number;
  pageSize: number;
}

export interface ActivityFilter extends JournalFilter {
  action: string | null;
  entityType: string | null;
  entityId: string | null;
}

export interface AccessFilter extends JournalFilter {
  event: string | null;
  reason: string | null;
  ip: string | null;
}

/** The account of an entry, when it still exists. */
export interface JournalAccount {
  id: string;
  name: string | null;
  email: string | null;
}

export interface ActivityRecord {
  id: string;
  occurredAt: Date;
  actorId: string | null;
  actor: JournalAccount | null;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: string;
  errorCode: string | null;
  before: unknown;
  after: unknown;
  transactionId: string | null;
}

export interface AccessRecord {
  id: string;
  occurredAt: Date;
  userId: string | null;
  user: JournalAccount | null;
  event: string;
  outcome: string;
  reason: string | null;
  ip: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
}

export interface JournalPage<T> {
  rows: T[];
  total: number;
}

/** Read side of the journals; the write side never reads. */
export interface IJournalReader {
  queryActivity(filter: ActivityFilter): Promise<JournalPage<ActivityRecord>>;
  queryAccess(filter: AccessFilter): Promise<JournalPage<AccessRecord>>;
}
