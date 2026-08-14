import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildReadableReferences,
  citationLabel,
  decodeBibTeX,
  parseBibTeX,
  renderReadableReferences,
  replacePandocCitations,
  validateReadableCitations
} from "../../scripts/buildReadableReferences.mjs";

const fixture = `
@article{sweller1998,
  author = {Sweller, John and van Merri{\\"e}nboer, Jeroen and Paas, Fred},
  title = {Cognitive Architecture and Instructional Design},
  journal = {Educational Psychology Review},
  year = {1998},
  volume = {10},
  pages = {251--296},
  doi = {10.1000/example}
}
@book{freire2021,
  author = {Freire, Paulo},
  title = {Pedagogia da autonomia: saberes necess\\'{a}rios à pr\\'{a}tica educativa},
  publisher = {Paz e Terra},
  year = {2021},
  isbn = {9780000000000}
}
`;

test("parser preserva chaves e converte marcas tipográficas do BibTeX", () => {
  const entries = parseBibTeX(fixture);
  assert.deepEqual(entries.map((entry) => entry.key), ["sweller1998", "freire2021"]);
  assert.equal(citationLabel(entries[0]), "Sweller et al. (1998)");
  assert.equal(decodeBibTeX(entries[0].fields.author).includes("Merriënboer"), true);
  assert.equal(decodeBibTeX(entries[1].fields.title), "Pedagogia da autonomia: saberes necessários à prática educativa");
});

test("página legível é determinística e mantém âncoras e identificadores", () => {
  const entries = parseBibTeX(fixture);
  const first = renderReadableReferences(entries);
  const second = renderReadableReferences(parseBibTeX(fixture));
  assert.equal(first, second);
  assert.match(first, /<a id="ref-sweller1998"><\/a>/u);
  assert.match(first, /https:\/\/doi\.org\/10\.1000\/example/u);
  assert.match(first, /Chave bibliográfica: `freire2021`/u);
});

test("citações Pandoc tornam-se links legíveis e recuperáveis", () => {
  const entries = parseBibTeX(fixture);
  const converted = replacePandocCitations("Afirmação [@sweller1998; @freire2021].", entries);
  assert.equal(
    converted,
    "Afirmação ([Sweller et al. (1998)](referencias.md#ref-sweller1998); [Freire (2021)](referencias.md#ref-freire2021))."
  );
  assert.deepEqual(validateReadableCitations(converted, entries), []);
  assert.equal(validateReadableCitations("Fonte [@sweller1998].", entries).length, 1);
  assert.equal(
    validateReadableCitations("[Sweller (1998)](referencias.md#ref-sweller1998)", entries).length,
    1
  );
});

test("modo de conferência detecta divergência da página gerada", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-refs-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "referencias.bib"), fixture, "utf8");
  buildReadableReferences({ root });
  assert.doesNotThrow(() => buildReadableReferences({ root, check: true }));
  fs.appendFileSync(path.join(root, "docs", "referencias.md"), "alteração manual\n", "utf8");
  assert.throws(() => buildReadableReferences({ root, check: true }), /diverge de docs\/referencias\.bib/u);
});
