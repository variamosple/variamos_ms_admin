import { RecentResults } from "./RecentResults.js";

describe("RecentResults", () => {
  let now: number;
  let results: RecentResults<string>;

  beforeEach(() => {
    now = 1_000_000;
    results = new RecentResults<string>(30_000, () => now);
  });

  it("reads a result again before its age limit, without computing it", async () => {
    const compute = vi.fn().mockResolvedValue("first");

    await results.get("k", compute);
    now += 29_999;
    const again = await results.get("k", vi.fn().mockResolvedValue("second"));

    expect(again).toBe("first");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("computes the result again once it reaches its age limit", async () => {
    await results.get("k", vi.fn().mockResolvedValue("first"));
    now += 30_000;

    expect(await results.get("k", vi.fn().mockResolvedValue("second"))).toBe(
      "second",
    );
  });

  it("gives one computation to callers that ask while it runs", async () => {
    let finish: (value: string) => void = () => undefined;
    const compute = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );

    const first = results.get("k", compute);
    const second = results.get("k", compute);
    finish("shared");

    expect(await Promise.all([first, second])).toEqual(["shared", "shared"]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("keeps each key apart", async () => {
    await results.get("a", vi.fn().mockResolvedValue("for a"));

    expect(await results.get("b", vi.fn().mockResolvedValue("for b"))).toBe(
      "for b",
    );
  });

  it("does not keep a computation that failed", async () => {
    await expect(
      results.get("k", vi.fn().mockRejectedValue(new Error("down"))),
    ).rejects.toThrow("down");

    expect(await results.get("k", vi.fn().mockResolvedValue("retried"))).toBe(
      "retried",
    );
  });

  it("forgets the expired keys when it computes another one", async () => {
    const compute = vi.fn().mockResolvedValue("old");
    await results.get("old", compute);
    now += 30_000;
    await results.get("new", vi.fn().mockResolvedValue("new"));
    // Back within the age of "old": had it stayed, it would be read again
    now -= 1;

    await results.get("old", compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });
});
