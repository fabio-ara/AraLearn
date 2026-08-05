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
