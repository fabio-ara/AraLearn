import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import { renderStretchDelimiter } from "../../src/resources/sdk/stretchDelimiter.js";
import { renderMathNode } from "../../src/resources/sdk/mathExpression.js";

test("delimitadores elásticos usam um único traço vetorial não escalável", () => {
  for (const symbol of ["[", "]", "(", ")", "{", "}", "|", "‖", "⟨", "⟩"]) {
    const html = renderStretchDelimiter(symbol, "delimiter-test");
    assert.match(html, /class="resource-stretch-delimiter delimiter-test"/u);
    assert.match(html, /preserveAspectRatio="none"/u);
    assert.match(html, /vector-effect="non-scaling-stroke"/u);
  }
});

test("formula e matrix dependem do delimitador compartilhado e não ampliam glifos", () => {
  const packagesDirectory = new URL("../../src/resources/packages/", import.meta.url);
  const formula = fs.readFileSync(new URL("../../src/resources/packages/formula/index.js", import.meta.url), "utf8");
  const matrix = fs.readFileSync(new URL("../../src/resources/packages/matrix/index.js", import.meta.url), "utf8");
  const math = fs.readFileSync(new URL("../../src/resources/sdk/mathExpression.js", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../../public/styles.css", import.meta.url), "utf8");
  const packageSources = fs.readdirSync(packagesDirectory, { recursive: true })
    .filter((path) => String(path).endsWith(".js"))
    .map((path) => fs.readFileSync(new URL(String(path).replaceAll("\\", "/"), packagesDirectory), "utf8"))
    .join("\n");

  assert.match(formula, /import \{ hydrateMathExpression, renderMathNode \} from "\.\.\/\.\.\/sdk\/mathExpression\.js"/u);
  assert.match(math, /import \{ renderStretchDelimiter \} from "\.\/stretchDelimiter\.js"/u);
  const fenced = renderMathNode({ type: "fenced", open: "(", close: ")", content: {
    type: "fraction", numerator: { type: "identifier", value: "x" }, denominator: { type: "number", value: "2" }
  } });
  assert.equal((fenced.match(/data-stretch-delimiter=/gu) || []).length, 2);
  assert.match(fenced, /is-stacked/u);
  assert.doesNotMatch(fenced, /stretchy="true"/u);
  assert.match(matrix, /renderStretchDelimiter/u);
  assert.doesNotMatch(packageSources, /stretchy="true"/u);
  assert.doesNotMatch(math, /stretchy="true"/u);
  assert.doesNotMatch(packageSources, /M7 1H1V99H7|M1 1H7V99H1/u);
  assert.match(styles, /\.resource-stretch-delimiter path\s*\{[^}]*stroke-width:\s*1;/su);
  assert.doesNotMatch(styles, /package-formula-fence[^}]*font-size:/su);
});
