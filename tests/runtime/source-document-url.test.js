import test from "node:test";
import assert from "node:assert/strict";
import { buildSourceDocumentUrl } from "../../src/study/sourceDocumentUrl.js";

const attachment = { contentHash: "a".repeat(64) };
const signedUrl = "https://source.example/book.pdf?token=authorized&download=#page=1";
const anchored = selector => ({ attachment, anchor: { contentHash: attachment.contentHash, selector } });

test("source document opens the authorized attachment without forcing a download", () => {
  const url = new URL(buildSourceDocumentUrl(signedUrl, { attachment }));
  assert.equal(url.searchParams.get("token"), "authorized");
  assert.equal(url.searchParams.has("download"), false);
  assert.equal(url.hash, "");
});

test("PDF text fragment preserves the exact quote and disambiguating context", () => {
  const value = buildSourceDocumentUrl(signedUrl, anchored({ kind: "text_quote",
    exact: "Máquina virtual, host-guest & RAM", prefix: "Antes, ", suffix: " depois-fim" }));
  assert.equal(new URL(value).hash,
    "#:~:text=Antes%2C%20-,M%C3%A1quina%20virtual%2C%20host%2Dguest%20%26%20RAM,-%20depois%2Dfim");
});

test("page anchors locate pages and unrelated or outdated anchors cannot highlight the PDF", () => {
  const options = anchored({ kind: "page_range", startPage: 36, endPage: 36 });
  assert.equal(new URL(buildSourceDocumentUrl(signedUrl, options)).hash, "#page=36");
  for (const changes of [{ contentHash: "b".repeat(64) }, { needsReverification: true }, { status: "retired" }]) {
    assert.equal(new URL(buildSourceDocumentUrl(signedUrl, { ...options, anchor: { ...options.anchor, ...changes } })).hash, "");
  }
  for (const value of ["javascript:alert(1)", "https://user:password@example.org/book.pdf", "http://example.org/book.pdf"]) {
    assert.throws(() => buildSourceDocumentUrl(value, options), /inválido/u);
  }
});
