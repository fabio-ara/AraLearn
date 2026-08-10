import test from "node:test";
import assert from "node:assert/strict";

import { renderRuntimeBlockList } from "../../src/render/renderCardRuntime.js";

test("Markdown persistido preserva negrito e código inline no runtime", () => {
  const html = renderRuntimeBlockList([{
    kind: "paragraph",
    value: "Adote **forte** e `código`."
  }]);

  assert.match(html, /Adote <strong>forte<\/strong> e <code>código<\/code>\./u);
  assert.doesNotMatch(html, /<em>|<code>\*forte<\/code>/u);
});

test("sigla expandida em prosa não é confundida com chamada de função", () => {
  const html = renderRuntimeBlockList([{
    kind: "paragraph",
    value: "O Transmission Control Protocol (TCP) difere de processar(buffer)."
  }]);

  assert.match(html, /Transmission Control Protocol \(TCP\)/u);
  assert.doesNotMatch(html, /<code>Protocol \(TCP\)<\/code>/u);
  assert.match(html, /<code>processar\(buffer\)<\/code>/u);
});

test("crases explícitas abrangem o nome técnico e a sigla como uma unidade", () => {
  const html = renderRuntimeBlockList([{
    kind: "paragraph",
    value: "O `Transmission Control Protocol (TCP)` estabelece a conexão."
  }]);

  assert.match(html, /<code>Transmission Control Protocol \(TCP\)<\/code>/u);
  assert.doesNotMatch(html, /Transmission Control <code>Protocol/u);
});
