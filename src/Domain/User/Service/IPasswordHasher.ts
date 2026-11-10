/**
 * Hashes and checks passwords (T-18 lot 2). The algorithm and its cost belong
 * to the implementation; the domain only asks for a hash and a comparison.
 */
export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  /**
   * False without a stored hash, after the same work as a real comparison:
   * the response time does not reveal whether an account can sign in.
   */
  verify(password: string, hash: string | null): Promise<boolean>;
  /**
   * True when the hash was made at another cost than the current one: after
   * a successful sign in, the password is hashed again at the current cost
   * (EV-46).
   */
  needsRehash(hash: string): Promise<boolean>;
}

export interface IPasswordHashingCostProvider {
  getCost(): Promise<number>;
}
