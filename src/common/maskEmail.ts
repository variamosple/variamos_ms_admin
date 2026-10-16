/**
 * Masks an e-mail address for logs: keeps the first character and the domain
 * (`alice@example.com` becomes `a***@example.com`), enough to tell deliveries
 * apart without writing the address itself.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 1) return "***";
  return `${address[0]}***${address.slice(at)}`;
}
