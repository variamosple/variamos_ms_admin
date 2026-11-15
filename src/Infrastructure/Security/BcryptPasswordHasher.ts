import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import type {
  IPasswordHasher,
  IPasswordHashingCostProvider,
} from "#src/Domain/User/Service/IPasswordHasher.js";

/** The cost written in a bcrypt hash; none for a text that is not one. */
const roundsOf = (hash: string): number | undefined => {
  try {
    return bcrypt.getRounds(hash);
  } catch {
    return undefined;
  }
};

/** bcrypt behind the domain port; the cost is read at each hash (T-18 lot 2). */
export class BcryptPasswordHasher implements IPasswordHasher {
  // One hash of a random value per cost, compared when there is no hash
  private readonly dummyHashes = new Map<number, Promise<string>>();

  public constructor(private readonly cost: IPasswordHashingCostProvider) {}

  public async hash(password: string): Promise<string> {
    return bcrypt.hash(password, await this.cost.getCost());
  }

  public async verify(password: string, hash: string | null): Promise<boolean> {
    // Read on both paths, so that both do the same work
    const cost = await this.cost.getCost();
    const matches = await bcrypt.compare(
      password,
      hash ?? (await this.dummyHash(cost)),
    );
    if (hash === null) return false;
    // A refusal takes as long as one for an unknown address (EV-46)
    if (!matches) await this.workUpTo(cost, password, hash);
    return matches;
  }

  public async needsRehash(hash: string): Promise<boolean> {
    // The cost is part of the hash: $2b$<cost>$<salt and hash>
    return bcrypt.getRounds(hash) !== (await this.cost.getCost());
  }

  /**
   * A hash made below the current cost is compared faster than the stand-in
   * of an unknown address: the time of a refusal would reveal an account that
   * has not signed in since the cost went up. Each step of cost doubles the
   * work, so the missing work is 2^(cost - its cost) - 1 more comparisons at
   * its cost, on a stand-in. A hash above the current cost is left as it is:
   * it comes back to the current cost at its next sign in.
   */
  private async workUpTo(
    cost: number,
    password: string,
    hash: string,
  ): Promise<void> {
    const rounds = roundsOf(hash);
    if (rounds === undefined || rounds >= cost) return;
    const standIn = await this.dummyHash(rounds);
    for (let done = 1; done < 2 ** (cost - rounds); done++) {
      await bcrypt.compare(password, standIn);
    }
  }

  private dummyHash(cost: number): Promise<string> {
    let dummy = this.dummyHashes.get(cost);
    if (!dummy) {
      dummy = bcrypt.hash(randomUUID(), cost);
      this.dummyHashes.set(cost, dummy);
    }
    return dummy;
  }
}
