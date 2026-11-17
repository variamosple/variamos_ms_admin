// Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari"
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\b(OPR|Opera)\//, "Opera"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

// Android also says "Linux", iOS also says "Mac OS X"
const SYSTEMS: [RegExp, string][] = [
  [/\bWindows\b/, "Windows"],
  [/\bAndroid\b/, "Android"],
  [/\b(iPhone|iPad|iPod)\b/, "iOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

const firstMatch = (value: string, patterns: [RegExp, string][]) =>
  patterns.find(([pattern]) => pattern.test(value))?.[1];

/**
 * A short name of a browser for a person to recognize it, such as
 * "Firefox on Linux". Never the header itself: it can carry any text.
 */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "an unknown browser";
  const browser = firstMatch(userAgent, BROWSERS);
  const system = firstMatch(userAgent, SYSTEMS);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? (system ? `a browser on ${system}` : "an unknown browser");
}
