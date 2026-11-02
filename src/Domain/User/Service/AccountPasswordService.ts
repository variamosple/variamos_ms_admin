import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import { canUsePassword } from "#src/Domain/User/Entity/AccountAccess.js";
import type {
  IUserRepository,
  PasswordAccount,
} from "#src/Domain/User/IUserRepository.js";
import type { IPasswordHasher } from "./IPasswordHasher.js";

export type OpenedAccount = PasswordAccount & { passwordHash: string };

/** Checks the password of an account for a step that asks it again. */
export interface IAccountPasswordCheck {
  /** False for a wrong password, and for an unknown or closed account. */
  verifyPassword(userId: string, password: string): Promise<boolean>;
}

/**
 * Opens an account with its password (EV-98, CA-BE-04): the account rule
 * and the comparison are decided here, the repository only reads and writes.
 */
export class AccountPasswordService implements IAccountPasswordCheck {
  public constructor(
    private readonly userRepository: Pick<
      IUserRepository,
      "findPasswordAccount"
    >,
    private readonly passwordHasher: IPasswordHasher,
    private readonly logger: ILogger,
  ) {}

  /**
   * The account this password opens, or null. Unknown and closed accounts
   * pay the same hashing cost as a wrong password: the response time does
   * not reveal whether an account exists.
   */
  public async accountOpenedBy(
    by: { email: string } | { id: string },
    password: string,
  ): Promise<OpenedAccount | null> {
    const account = await this.userRepository.findPasswordAccount(by);
    const usable = canUsePassword(account);
    const matches = await this.passwordHasher.verify(
      password,
      usable ? account.passwordHash : null,
    );
    return usable && matches ? account : null;
  }

  public async verifyPassword(
    userId: string,
    password: string,
  ): Promise<boolean> {
    return (await this.accountOpenedBy({ id: userId }, password)) !== null;
  }

  /**
   * The password hashed again at the current cost when its hash was made at
   * another one (EV-46), else undefined. Only a sign-in knows the password:
   * the hashes of the accounts that sign in follow the configured cost. A
   * failure is logged and never stops the sign-in.
   */
  public async rehashIfOutdated(
    account: OpenedAccount,
    password: string,
  ): Promise<string | undefined> {
    const userId = account.user.id;
    try {
      if (!(await this.passwordHasher.needsRehash(account.passwordHash))) {
        return undefined;
      }
      const rehashed = await this.passwordHasher.hash(password);
      this.logger.info(
        `Password hash of user ${userId} rehashed at the configured cost`,
      );
      return rehashed;
    } catch (error) {
      this.logger.err(`Password rehash failed for user ${userId}: ${error}`);
      return undefined;
    }
  }
}
