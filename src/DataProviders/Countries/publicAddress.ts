import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

/**
 * The address as a geolocation service expects it, or null when it is not
 * a public address: nothing is then sent (ADM-N26). The ranges are those of
 * ipaddr.js, which Express also uses for trust proxy: private, loopback,
 * link-local, shared, reserved and multicast addresses have no country. An
 * IPv4 address seen through an IPv6 socket loses its ::ffff: prefix.
 */
export function publicAddressOf(address: string): string | null {
  if (isIP(address) === 0) return null;
  const parsed = ipaddr.process(address);
  return parsed.range() === "unicast" ? parsed.toString() : null;
}
