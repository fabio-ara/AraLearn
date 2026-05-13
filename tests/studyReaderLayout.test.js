import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function readStyles() {
  return fs.readFileSync("./public/styles.css", "utf8");
}

test("leitura nao soma padding externo abaixo do rodape no Android", () => {
  const styles = readStyles();
  const screenRule = styles.match(/\.study-reader-screen\s*\{(?<body>[^}]*)\}/);
  assert.ok(screenRule);
  assert.match(screenRule.groups.body, /padding-bottom:\s*0\s*;/);

  const footerRule = styles.match(/\.study-reader-footer\s*\{(?<body>[^}]*)\}/);
  assert.ok(footerRule);
  assert.match(footerRule.groups.body, /var\(--safe-bottom-tappable\)/);
});
