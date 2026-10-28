// Sequelize connects only on the first query: building it opens nothing
describe("VariamosORM", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const loadOrm = async () =>
    (await import("#src/Infrastructure/VariamosORM.js")).default;

  it("connects on the port given by DB_PORT (EV-79)", async () => {
    vi.stubEnv("DB_PORT", "6543");
    vi.resetModules();

    expect((await loadOrm()).config.port).toBe(6543);
  });

  it("connects on 5432 when DB_PORT is not set", async () => {
    vi.stubEnv("DB_PORT", undefined);
    vi.resetModules();

    expect((await loadOrm()).config.port).toBe(5432);
  });
});
