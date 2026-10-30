import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import type {
  IPasswordHasher,
  IPasswordHashingCostProvider,
} from "#src/Domain/User/Service/IPasswordHasher.js";

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
    return hash !== null && matches;
  }

  public async needsRehash(hash: string): Promise<boolean> {
    // The cost is part of the hash: $2b$<cost>$<salt and hash>
    return bcrypt.getRounds(hash) !== (await this.cost.getCost());
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
