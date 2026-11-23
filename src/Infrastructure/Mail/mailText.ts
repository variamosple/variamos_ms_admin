/**
 * The plain-text version of one of our mails, sent next to the HTML: some
 * mail readers show only text, and spam filters score HTML-only mails
 * lower (ADM-N35). Written for the templates of MailService, whose links
 * are all `<a href="...">label</a>` with a plain label; not a general HTML
 * converter.
 */
export function mailText(html: string): string {
  return (
    html
      // Line breaks of the source are spaces, as in a browser
      .replaceAll(/\s+/g, " ")
      // A link keeps its address: "Reset Password (https://...)"
      .replaceAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g, (_, url, label) => {
        const text = String(label).trim();
        return text && text !== url ? `${text} (${url})` : String(url);
      })
      .replaceAll(/<br[^>]*>/g, "\n")
      .replaceAll(/<\/(?:p|h2|div)>/g, "\n\n")
      .replaceAll(/<hr[^>]*>/g, "\n\n")
      // Every other tag, comments included
      .replaceAll(/<[^>]*>/g, "")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&copy;", "©")
      // Last, so that "&amp;lt;" gives "&lt;" and not "<"
      .replaceAll("&amp;", "&")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replaceAll(/\n{3,}/g, "\n\n")
      .trim()
  );
}
