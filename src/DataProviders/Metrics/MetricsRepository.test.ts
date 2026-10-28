import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import { MetricsFilter } from "#src/Domain/Metrics/Entity/MetricsFilter.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { MetricsRepositoryImpl } from "./MetricsRepository.js";

vi.mock("#src/common/logger.js");

const definitionsWith = (visits: number) => [
  {
    data: [
      {
        id: "daily_visits",
        title: "Daily Visits",
        chartType: "line",
        defaultFilter: "page",
        filters: ["page"],
        labelKey: "date",
        data: { visits },
      },
    ],
  },
];

/** The dashboard metrics are read from the database at each request. */
describe("MetricsRepositoryImpl.getMetrics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads nothing when built, then today's figures at each request", async () => {
    const query = vi
      .spyOn(VARIAMOS_ORM, "query")
      .mockResolvedValueOnce(definitionsWith(3) as never)
      .mockResolvedValueOnce(definitionsWith(5) as never);

    const repository = new MetricsRepositoryImpl();
    expect(query).not.toHaveBeenCalled();

    const first = await repository.getMetrics(new RequestModel("t"));
    const second = await repository.getMetrics(new RequestModel("t"));

    expect(first.data?.[0].getData()).toEqual({ visits: 3 });
    expect(second.data?.[0].getData()).toEqual({ visits: 5 });
  });

  it("answers a system error when the database cannot be read", async () => {
    vi.spyOn(VARIAMOS_ORM, "query").mockRejectedValue(new Error("down"));

    const response = await new MetricsRepositoryImpl().getMetrics(
      new RequestModel("t"),
    );

    expect(response.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
  });
});

const filterOf = (id: string) =>
  new RequestModel("t", new MetricsFilter(id, "2026-09-01", "2026-09-30"));

const dailyVisits = {
  data: {
    id: "daily_visits",
    title: "Daily Visits",
    chartType: "line",
    defaultFilter: "page",
    filters: ["page"],
    labelKey: "date",
    data: [{ page: "/", count: 2, date: "2026-09-02" }],
  },
};

/** A chart is filtered by the id that getMetrics gave it. */
describe("MetricsRepositoryImpl.queryMetric", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads a dated chart over the period asked", async () => {
    const query = vi
      .spyOn(VARIAMOS_ORM, "query")
      .mockResolvedValue([dailyVisits] as never);

    const response = await new MetricsRepositoryImpl().queryMetric(
      filterOf("daily_visits"),
    );

    expect(response.errorCode).toBeUndefined();
    expect(response.data?.getData()).toEqual(dailyVisits.data.data);
    const [sql, options] = query.mock.calls[0] ?? [];
    expect(sql).toContain("get_daily_visits_metrics(:startDate, :endDate)");
    expect(options?.replacements).toMatchObject({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
  });

  it.each([
    ["daily_unique_visits", "get_daily_unique_visits_metrics(:startDate"],
    ["monthly_visits", "get_monthly_visits_metrics(:startDate"],
    ["yearly_visits", "get_yearly_visits_metrics()"],
    ["top_visited_pages", "get_top_visited_pages_metrics()"],
  ])("knows the chart %s of the dashboard", async (id, call) => {
    const query = vi
      .spyOn(VARIAMOS_ORM, "query")
      .mockResolvedValue([dailyVisits] as never);

    await new MetricsRepositoryImpl().queryMetric(filterOf(id));

    expect(query.mock.calls[0]?.[0]).toContain(call);
  });

  it("refuses an id that no chart has, without reading the database", async () => {
    const query = vi.spyOn(VARIAMOS_ORM, "query");

    const response = await new MetricsRepositoryImpl().queryMetric(
      filterOf("visitsByDay"),
    );

    expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(query).not.toHaveBeenCalled();
  });
});
