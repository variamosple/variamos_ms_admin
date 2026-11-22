import { publicAddressOf } from "./publicAddress.js";

describe("publicAddressOf (ADM-N26)", () => {
  it.each(["203.0.113.7", "8.8.8.8", "2001:db8::1"])(
    "keeps the public address %s",
    (address) => {
      expect(publicAddressOf(address)).toBe(address);
    },
  );

  it("drops the IPv6 prefix of an IPv4 address", () => {
    expect(publicAddressOf("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it.each([
    "127.0.0.1",
    "::ffff:127.0.0.1",
    "::1",
    "10.1.2.3",
    "172.18.0.5",
    "192.168.1.10",
    "169.254.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "fd12:3456::1",
    "fe80::1",
  ])("sends nothing for the private address %s", (address) => {
    expect(publicAddressOf(address)).toBeNull();
  });

  it.each([
    "",
    "client-address",
    "203.0.113.7, 198.51.100.2",
    "../203.0.113.7",
  ])("sends nothing for %j, which is not one address", (value) => {
    expect(publicAddressOf(value)).toBeNull();
  });
});
