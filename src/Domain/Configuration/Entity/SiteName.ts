/** The name of the site, set on the configuration screen (EV-87 lot 2). */
export const SITE_NAME_KEY = "general.site_name";

export const DEFAULT_SITE_NAME = "VariaMos";

/** Beyond this, the name would crowd out the page title in a browser tab. */
export const SITE_NAME_MAX_LENGTH = 60;

// Line breaks, tabs and other control characters have no place in a title
const CONTROL_CHARACTER = /\p{Cc}/u;

/** A name the browser tabs can show: one line of 1 to 60 visible characters. */
export const isAcceptedSiteName = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim() !== "" &&
  value.length <= SITE_NAME_MAX_LENGTH &&
  !CONTROL_CHARACTER.test(value);

/** The name to show; a value the tabs cannot show gives VariaMos. */
export const siteNameOf = (configured: unknown): string =>
  isAcceptedSiteName(configured) ? configured.trim() : DEFAULT_SITE_NAME;
