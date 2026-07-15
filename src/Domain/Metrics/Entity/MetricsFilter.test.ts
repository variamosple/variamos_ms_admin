import { MetricsFilter } from "./MetricsFilter";

describe("MetricsFilter Entity - Unit Tests", () => {
  it("should successfully build a MetricsFilter using constructor", () => {
    const filter = new MetricsFilter("met-1", "2026-01-01", "2026-01-31");

    expect(filter.getId()).toBe("met-1");
    expect(filter.getStartDate()).toBe("2026-01-01");
    expect(filter.getEndDate()).toBe("2026-01-31");
  });

  it("should successfully build a MetricsFilter using builder", () => {
    const builder = MetricsFilter.builder()
      .setId("met-2")
      .setStartDate("2026-02-01")
      .setEndDate("2026-02-28");

    expect(builder.getId()).toBe("met-2");
    expect(builder.getStartDate()).toBe("2026-02-01");
    expect(builder.getEndDate()).toBe("2026-02-28");

    const filter = MetricsFilter.build(builder);
    expect(filter.getId()).toBe("met-2");
    expect(filter.getStartDate()).toBe("2026-02-01");
    expect(filter.getEndDate()).toBe("2026-02-28");

    const filterFromBuildMethod = builder.build();
    expect(filterFromBuildMethod.getId()).toBe("met-2");
  });
});
