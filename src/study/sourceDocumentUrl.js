// A source anchor locates text in the source, independently of its occurrence
// in the explanation. Native PDF readers can use page and text fragments.
export function buildSourceDocumentUrl(signedUrl, { attachment, anchor = null } = {}) {
  const url = new URL(signedUrl);
  const local = url.protocol === "http:" && ["127.0.0.1", "localhost", "10.0.2.2"].includes(url.hostname);
  if ((url.protocol !== "https:" && !local) || url.username || url.password) {
    throw new TypeError("Endereço da fonte inválido.");
  }
  // Older service responses requested a download even when opening a citation.
  // This delivery option is separate from the signed authorization token.
  url.searchParams.delete("download");
  url.hash = "";
  if (!anchor || !attachment?.contentHash || anchor.contentHash !== attachment.contentHash ||
      anchor.needsReverification === true || (anchor.status && anchor.status !== "active")) return url.href;
  const selector = anchor.selector;
  if (selector?.kind === "page_range" && Number.isSafeInteger(selector.startPage) &&
      selector.startPage > 0 && selector.startPage <= 1_000_000) {
    url.hash = `page=${selector.startPage}`;
  } else if (selector?.kind === "text_quote" && typeof selector.exact === "string" && selector.exact.trim()) {
    // Escape '-' as well: it separates the optional context from the quote.
    const encode = value => encodeURIComponent(value).replaceAll("-", "%2D");
    const prefix = selector.prefix ? `${encode(selector.prefix)}-,` : "";
    const suffix = selector.suffix ? `,-${encode(selector.suffix)}` : "";
    url.hash = `:~:text=${prefix}${encode(selector.exact)}${suffix}`;
  }
  return url.href;
}
