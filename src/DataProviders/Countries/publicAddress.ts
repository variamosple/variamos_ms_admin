import { BlockList, isIP } from "node:net";

// Addresses that no geolocation service can place: the kit, the tests,
// the Docker network and the private networks behind a proxy
const NOT_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, "ipv6");
}

const MAPPED_IPV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/**
 * The address as a geolocation service expects it (an IPv4 address seen
 * through an IPv6 socket loses its prefix), or null when it is not a public
 * address: nothing is then sent (ADM-N26).
 */
export function publicAddressOf(address: string): string | null {
  const plain = MAPPED_IPV4.exec(address)?.[1] ?? address;
  const family = isIP(plain);
  if (family === 0) return null;
  return NOT_PUBLIC.check(plain, family === 4 ? "ipv4" : "ipv6") ? null : plain;
}
