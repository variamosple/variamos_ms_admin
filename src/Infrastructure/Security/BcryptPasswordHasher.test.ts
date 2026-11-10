import bcrypt from "bcrypt";
import { BcryptPasswordHasher } from "./BcryptPasswordHasher.js";

// Low costs keep the tests fast; the bounds belong to the cost service
const costOf = (hash: string) => Number(hash.split("$")[2]);

describe("BcryptPasswordHasher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hashes with the cost read at each hash", async () => {
    let cost = 4;
    const hasher = new BcryptPasswordHasher({ getCost: async () => cost });

    expect(costOf(await hasher.hash("Password-1"))).toBe(4);
    cost = 5;
    expect(costOf(await hasher.hash("Password-1"))).toBe(5);
  });

  it("verifies a password against its hash", async () => {
    const hasher = new BcryptPasswordHasher({ getCost: async () => 4 });
    const hash = await hasher.hash("Password-1");

    expect(await hasher.verify("Password-1", hash)).toBe(true);
    expect(await hasher.verify("Password-2", hash)).toBe(false);
  });

  it("checks a hash existing before a cost change", async () => {
    const hash = await bcrypt.hash("Password-1", 5);
    const hasher = new BcryptPasswordHasher({ getCost: async () => 4 });

    expect(await hasher.verify("Password-1", hash)).toBe(true);
  });

  it("without a hash, compares a hash of the current cost and refuses", async () => {
    let cost = 4;
    const hasher = new BcryptPasswordHasher({ getCost: async () => cost });
    const compare = vi.spyOn(bcrypt, "compare");

    expect(await hasher.verify("Password-1", null)).toBe(false);
    cost = 5;
    expect(await hasher.verify("Password-1", null)).toBe(false);

    expect(compare).toHaveBeenCalledTimes(2);
    expect(costOf(String(compare.mock.calls[0]?.[1]))).toBe(4);
    expect(costOf(String(compare.mock.calls[1]?.[1]))).toBe(5);
  });

  it("hashes the stand-in value once per cost", async () => {
    const hasher = new BcryptPasswordHasher({ getCost: async () => 4 });
    const hash = vi.spyOn(bcrypt, "hash");

    await hasher.verify("Password-1", null);
    await hasher.verify("Password-2", null);

    expect(hash).toHaveBeenCalledTimes(1);
  });

  it("asks for a new hash when the hash cost differs from the current one", async () => {
    const hasher = new BcryptPasswordHasher({ getCost: async () => 5 });

    expect(await hasher.needsRehash(await bcrypt.hash("Password-1", 4))).toBe(
      true,
    );
    expect(await hasher.needsRehash(await bcrypt.hash("Password-1", 6))).toBe(
      true,
    );
    expect(await hasher.needsRehash(await bcrypt.hash("Password-1", 5))).toBe(
      false,
    );
  });
});
