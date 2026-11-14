export const SERVICE_ALERT_KEYS = {
  recipients: "monitoring.alerts.recipients",
  failuresBeforeAlert: "monitoring.alerts.failures_before_alert",
} as const;

/** Accepted values; outside them, the default. */
export const SERVICE_ALERT_BOUNDS = {
  failuresBeforeAlert: { min: 2, max: 20 },
  maxRecipients: 10,
} as const;

const ADDRESS_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** The addresses of a list separated by commas, semicolons or spaces. */
const addressesOf = (value: string): string[] =>
  value
    .split(/[,;\s]+/)
    .map((address) => address.trim())
    .filter((address) => address !== "");

/** Empty (alerts off) or up to 10 well-formed addresses. */
export const isAcceptedRecipientList = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const addresses = addressesOf(value);
  return (
    addresses.length <= SERVICE_ALERT_BOUNDS.maxRecipients &&
    addresses.every((address) => ADDRESS_PATTERN.test(address))
  );
};

/**
 * Alerts when a service stops answering its health checks, then when it
 * answers again. They go by mail to the addresses of the
 * monitoring.alerts.recipients key: none by default, so the alerts stay off
 * until an administrator sets an address.
 */
export class ServiceAlertPolicy {
  public static readonly DEFAULT = new ServiceAlertPolicy([], 3);

  private constructor(
    public readonly recipients: readonly string[],
    public readonly failuresBeforeAlert: number,
  ) {}

  /** An invalid address is left out; an invalid number takes the default. */
  public static fromConfiguration(values: {
    recipients?: unknown;
    failuresBeforeAlert?: unknown;
  }): ServiceAlertPolicy {
    const { min, max } = SERVICE_ALERT_BOUNDS.failuresBeforeAlert;
    const failures = values.failuresBeforeAlert;
    const recipients =
      typeof values.recipients === "string"
        ? [...new Set(addressesOf(values.recipients))]
            .filter((address) => ADDRESS_PATTERN.test(address))
            .slice(0, SERVICE_ALERT_BOUNDS.maxRecipients)
        : [];
    return new ServiceAlertPolicy(
      recipients,
      typeof failures === "number" &&
        Number.isInteger(failures) &&
        failures >= min &&
        failures <= max
        ? failures
        : ServiceAlertPolicy.DEFAULT.failuresBeforeAlert,
    );
  }
}
