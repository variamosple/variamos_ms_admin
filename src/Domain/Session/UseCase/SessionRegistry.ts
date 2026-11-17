import { createHash, randomBytes } from "node:crypto";
import type { IConfigurationRepository } from "#src/Domain/Configuration/Repository/IConfigurationRepository.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import {
  SessionPolicy,
  type SessionRecord,
  type SessionRefusal,
} from "#src/Domain/Session/Entity/SessionPolicy.js";
import type {
  ISessionRepository,
  ISessionRevoker,
} from "#src/Domain/Session/Repository/ISessionRepository.js";

export const SESSION_POLICY_KEYS = {
  idleMinutes: "security.session.idle_minutes",
  maxHours: "security.session.max_hours",
} as const;

// A change on the configuration screen applies within this delay
const POLICY_MAX_AGE_MS = 30_000;

// A request moves the last activity at most once in this delay, so that the
// pages polling the session every minute do not write at each request
const TOUCH_EVERY_MS = 60_000;

// A session read is kept this long: the administration checks the session at
// each request, and a revocation from this process empties the cache at once
const RECORD_MAX_AGE_MS = 5_000;
const RECORD_CACHE_SIZE = 1_000;

/** The registry keeps the hash only: a copy of the table opens nothing. */
const hashOf = (id: string): string =>
  createHash("sha256").update(id).digest("hex");

/**
 * The sessions opened at sign-in (EV-74 lot 2): each one ends when it is
 * revoked (sign-out, password reset, account closed), after the idle delay,
 * or after the longest duration, whatever the session token says.
 */
export class SessionRegistry implements ISessionRevoker {
  private policy: { value: SessionPolicy; readAt: number } | null = null;
  private readonly records = new Map<
    string,
    { record: SessionRecord | null; readAt: number }
  >();
  /**
   * A token issued before this instant may come without a session: it was
   * issued before the registry existed, and gets one at its next refresh.
   */
  private readonly registryStartedAt: number;

  public constructor(
    private readonly sessions: ISessionRepository,
    private readonly configuration: IConfigurationRepository,
    private readonly logger: ILogger,
    private readonly now: () => number = Date.now,
  ) {
    this.registryStartedAt = now();
  }

  /** Opens a session for the account; gives the identifier for its cookie. */
  public async open(userId: string): Promise<string> {
    const id = randomBytes(32).toString("base64url");
    await this.sessions.open(hashOf(id), userId);
    return id;
  }

  /**
   * Why the session cannot be used by the account whose token was issued at
   * `issuedAtMs`, or null when it can; a request that may use it counts as
   * activity.
   */
  public async check(
    id: string | undefined,
    userId: string,
    issuedAtMs: number,
  ): Promise<SessionRefusal | null> {
    if (!id) return issuedAtMs < this.registryStartedAt ? null : "unknown";
    const idHash = hashOf(id);
    const [record, policy] = await Promise.all([
      this.find(idHash),
      this.currentPolicy(),
    ]);
    const now = this.now();
    const refusal = policy.refusalOf(record, userId, now);
    if (
      refusal === null &&
      record &&
      now - record.lastSeenAt.getTime() >= TOUCH_EVERY_MS
    ) {
      await this.sessions.touch(idHash);
      record.lastSeenAt = new Date(now);
    }
    return refusal;
  }

  public async revoke(id: string | undefined): Promise<void> {
    if (!id) return;
    const idHash = hashOf(id);
    this.records.delete(idHash);
    await this.sessions.revoke(idHash);
  }

  public async revokeAllOf(userId: string): Promise<number> {
    this.records.clear();
    const revoked = await this.sessions.revokeAllOf(userId);
    // A check made while the update ran may have cached an open session
    this.records.clear();
    return revoked;
  }

  private async find(idHash: string): Promise<SessionRecord | null> {
    const now = this.now();
    const cached = this.records.get(idHash);
    if (cached && now - cached.readAt < RECORD_MAX_AGE_MS) return cached.record;
    const record = await this.sessions.find(idHash);
    if (this.records.size >= RECORD_CACHE_SIZE) this.records.clear();
    this.records.set(idHash, { record, readAt: now });
    return record;
  }

  private async currentPolicy(): Promise<SessionPolicy> {
    const now = this.now();
    if (this.policy && now - this.policy.readAt < POLICY_MAX_AGE_MS) {
      return this.policy.value;
    }
    const [idleMinutes, maxHours] = await Promise.all([
      this.read(SESSION_POLICY_KEYS.idleMinutes),
      this.read(SESSION_POLICY_KEYS.maxHours),
    ]);
    const value = SessionPolicy.fromConfiguration({ idleMinutes, maxHours });
    this.policy = { value, readAt: now };
    return value;
  }

  private async read(key: string): Promise<unknown> {
    try {
      const response = await this.configuration.queryByKey(
        new RequestModel<string>("readSessionPolicy", key),
      );
      return response.errorCode ? undefined : response.data?.value;
    } catch (error) {
      this.logger.warn(`Could not read ${key}: ${errorMessage(error)}`);
      return undefined;
    }
  }
}
