import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildClassicRuntime } from "../../scripts/buildVegaInterpreterVendor.mjs";

const source = fs.readFileSync(
  new URL(
    "../../node_modules/vega-interpreter/build/vega-interpreter.js",
    import.meta.url
  ),
  "utf8"
);

test("vendor do Vega é determinístico com LF ou CRLF", () => {
  const lfSource = source.replace(/\r\n?/gu, "\n");
  const crlfSource = lfSource.replace(/\n/gu, "\r\n");

  assert.equal(buildClassicRuntime(crlfSource), buildClassicRuntime(lfSource));
});
