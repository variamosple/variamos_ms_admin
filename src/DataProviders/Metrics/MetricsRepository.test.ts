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

/**
 * The dashboard metrics are read from the database, kept a minute for the
 * same period and time zone (EV-92).
 */
describe("MetricsRepositoryImpl.getMetrics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads nothing when built, the same figures for a minute, then today's", async () => {
    const query = vi
      .spyOn(VARIAMOS_ORM, "query")
      .mockResolvedValueOnce(definitionsWith(3) as never)
      .mockResolvedValueOnce(definitionsWith(5) as never);
    let now = 1_000_000;
    const repository = new MetricsRepositoryImpl({ now: () => now });
    expect(query).not.toHaveBeenCalled();

    const first = await repository.getMetrics(new RequestModel("t"));
    now += 59_999;
    const kept = await repository.getMetrics(new RequestModel("t"));
    now += 1;
    const again = await repository.getMetrics(new RequestModel("t"));

    expect(first.data?.[0]?.getData()).toEqual({ visits: 3 });
    expect(kept.data?.[0]?.getData()).toEqual({ visits: 3 });
    expect(again.data?.[0]?.getData()).toEqual({ visits: 5 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("keeps each period and time zone apart", async () => {
    const query = vi
      .spyOn(VARIAMOS_ORM, "query")
      .mockResolvedValue(definitionsWith(1) as never);
    const repository = new MetricsRepositoryImpl();
    const period = { startDate: "2026-09-01", endDate: "2026-09-30" };

    await repository.getMetrics(new RequestModel("t", period));
    await repository.getMetrics(
      new RequestModel("t", { ...period, timeZone: "UTC" }),
    );
    await repository.getMetrics(
      new RequestModel("t", { ...period, timeZone: "America/Bogota" }),
    );
    await repository.getMetrics(
      new RequestModel("t", { ...period, endDate: "2026-09-29" }),
    );
    await repository.getMetrics(
      new RequestModel("t", { ...period, timeZone: "UTC" }),
    );

    expect(query).toHaveBeenCalledTimes(4);
  });

  it("reads every chart over the period asked, the last 30 days without one", async () => {
    const query = vi
      .spyOn(VARIAMOS_ORM, "query")
      .mockResolvedValue(definitionsWith(1) as never);
    const repository = new MetricsRepositoryImpl();

    await repository.getMetrics(
      new RequestModel("t", { startDate: "2026-09-01", endDate: "2026-09-30" }),
    );
    await repository.getMetrics(new RequestModel("t"));

    expect(query.mock.calls[0]?.[0]).toContain(
      "get_metrics(:startDate, :endDate)",
    );
    expect(query.mock.calls[0]?.[1]).toMatchObject({
      replacements: { startDate: "2026-09-01", endDate: "2026-09-30" },
    });
    expect(query.mock.calls[1]?.[0]).toContain("get_metrics()");
  });

  it("gives the reader's zone for the hours of the sign-ins grid", async () => {
    const query = vi
      .spyOn(VARIAMOS_ORM, "query")
      .mockResolvedValue(definitionsWith(1) as never);

    await new MetricsRepositoryImpl().getMetrics(
      new RequestModel("t", {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        timeZone: "America/Bogota",
      }),
    );

    expect(query.mock.calls[0]?.[0]).toContain(
      "get_metrics(:startDate, :endDate, :timeZone)",
    );
    expect(query.mock.calls[0]?.[1]).toMatchObject({
      replacements: {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        timeZone: "America/Bogota",
      },
    });
  });

  it("answers a system error when the database cannot be read, and reads it again next time", async () => {
    vi.spyOn(VARIAMOS_ORM, "query")
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(definitionsWith(2) as never);
    const repository = new MetricsRepositoryImpl();

    const failed = await repository.getMetrics(new RequestModel("t"));
    const next = await repository.getMetrics(new RequestModel("t"));

    expect(failed.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    expect(next.data?.[0]?.getData()).toEqual({ visits: 2 });
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
    ["top_visited_pages", "get_top_visited_pages_metrics(:startDate"],
    ["monthly_active_users", "get_monthly_active_users_metrics(:startDate"],
    [
      "monthly_active_projects",
      "get_monthly_active_projects_metrics(:startDate",
    ],
    ["top_languages", "get_top_languages_metrics(:startDate"],
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
