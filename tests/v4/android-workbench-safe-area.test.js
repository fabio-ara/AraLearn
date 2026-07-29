import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("o workbench da microssequência zera o padding externo inferior para não duplicar safe area no Android", () => {
  const source = fs.readFileSync(new URL("../../public/styles.css", import.meta.url), "utf8");

  assert.match(
    source,
    /\.microsequence-workbench-screen\s*\{[\s\S]*?padding-bottom:\s*0;/u
  );
  assert.match(
    source,
    /\.microsequence-workbench-screen\s*>\s*\.screen-content\s*\{[\s\S]*?padding-bottom:\s*0;/u
  );
});

test("o viewport de flow não bloqueia o gesto vertical principal no Android", () => {
  const source = fs.readFileSync(new URL("../../public/styles.css", import.meta.url), "utf8");

  assert.match(
    source,
    /\.runtime-flow-board\s*\{[\s\S]*?touch-action:\s*auto;/u
  );
  assert.doesNotMatch(
    source,
    /\.runtime-flow-board\s*\{[\s\S]*?touch-action:\s*pan-x\s+pinch-zoom;/u
  );
});
