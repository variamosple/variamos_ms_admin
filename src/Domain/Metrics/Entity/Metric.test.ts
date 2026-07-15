import { Metric } from "./Metric";

describe("Metric Entity - Unit Tests", () => {
  it("should successfully build a Metric using constructor", () => {
    const filters = ["month", "year"];
    const testData = { value: 100 };
    const metric = new Metric("met-1", "Test Metric", "bar", "month", filters, "date", testData);

    expect(metric.getId()).toBe("met-1");
    expect(metric.getTitle()).toBe("Test Metric");
    expect(metric.getChartType()).toBe("bar");
    expect(metric.getDefaultFilter()).toBe("month");
    expect(metric.getFilters()).toBe(filters);
    expect(metric.getLabelKey()).toBe("date");
    expect(metric.getData()).toBe(testData);
  });

  it("should successfully build a Metric using builder", () => {
    const filters = ["day"];
    const testData = ["item1", "item2"];

    const builder = Metric.builder()
      .setId("met-2")
      .setTitle("Builder Metric")
      .setChartType("line")
      .setDefaultFilter("day")
      .setFilters(filters)
      .setLabelKey("name")
      .setData(testData);

    expect(builder.getId()).toBe("met-2");
    expect(builder.getTitle()).toBe("Builder Metric");
    expect(builder.getChartType()).toBe("line");
    expect(builder.getDefaultFilter()).toBe("day");
    expect(builder.getFilters()).toBe(filters);
    expect(builder.getLabelKey()).toBe("name");
    expect(builder.getData()).toBe(testData);

    const metric = Metric.build(builder);
    expect(metric.getId()).toBe("met-2");
    expect(metric.getTitle()).toBe("Builder Metric");
    expect(metric.getChartType()).toBe("line");
    expect(metric.getDefaultFilter()).toBe("day");
    expect(metric.getFilters()).toBe(filters);
    expect(metric.getLabelKey()).toBe("name");
    expect(metric.getData()).toBe(testData);

    const metricFromBuildMethod = builder.build();
    expect(metricFromBuildMethod.getId()).toBe("met-2");
  });
});
