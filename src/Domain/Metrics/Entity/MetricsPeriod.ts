/**
 * The period of the statistics page, as two days ("2026-09-01"), and the
 * time zone of the reader ("America/Bogota") for the hours of the sign-ins
 * grid; UTC without one.
 */
export interface MetricsPeriod {
  startDate: string;
  endDate: string;
  timeZone?: string;
}
