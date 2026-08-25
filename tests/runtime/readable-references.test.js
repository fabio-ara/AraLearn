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
  renderLocalReferences,
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
  const first = renderReadableReferences(entries, { guides: [] });
  const second = renderReadableReferences(parseBibTeX(fixture), { guides: [] });
  assert.equal(first, second);
  assert.match(first, /<a id="ref-sweller1998"><\/a>/u);
  assert.match(first, /https:\/\/doi\.org\/10\.1000\/example/u);
  assert.match(first, /Chave bibliográfica: `freire2021`/u);
});

test("DOI prefixado é normalizado sem duplicar o resolvedor", () => {
  const entries = parseBibTeX(`@article{fonte2024,
  author = {Fonte, Ana},
  title = {Fonte de teste},
  year = {2024},
  doi = {HTTPS://DX.DOI.ORG/10.1000/SOURCE/}
}\n`);
  const rendered = renderReadableReferences(entries, { guides: [] });
  assert.match(rendered, /\[DOI 10\.1000\/source\]\(https:\/\/doi\.org\/10\.1000\/source\)/u);
  assert.doesNotMatch(rendered, /doi\.org\/https?:/iu);
});

test("percurso temático deriva rótulos e destinos sem duplicar metadados", () => {
  const entries = parseBibTeX(fixture);
  const rendered = renderReadableReferences(entries, {
    guides: [{
      title: "Aprendizagem",
      introduction: "Ordem focal para o teste.",
      readings: [{
        key: "sweller1998",
        purpose: "introduz a arquitetura cognitiva",
        limit: "não define um tamanho universal de conteúdo"
      }]
    }]
  });
  assert.match(rendered, /## Percursos temáticos de leitura/u);
  assert.match(rendered, /\[Sweller et al\. \(1998\)\]\(#ref-sweller1998\)/u);
  assert.match(rendered, /\*\*Função da leitura:\*\* introduz a arquitetura cognitiva/u);
  assert.match(rendered, /\*\*Limite principal:\*\* não define um tamanho universal/u);
});

test("percurso temático rejeita chave ausente da bibliografia canônica", () => {
  const entries = parseBibTeX(fixture);
  assert.throws(() => renderReadableReferences(entries, {
    guides: [{
      title: "Aprendizagem",
      introduction: "Percurso inválido para o teste.",
      readings: [{
        key: "fonte-ausente",
        purpose: "não pode ser resolvida",
        limit: "não possui metadados canônicos"
      }]
    }]
  }), /chave desconhecida: fonte-ausente/u);
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

test("cada página deriva sua seção Referências apenas das obras citadas", () => {
  const entries = parseBibTeX(fixture);
  const source = "# Conceito\n\nAfirmação ([Sweller et al. (1998)](referencias.md#ref-sweller1998)).\n";
  const rendered = renderLocalReferences(source, entries);
  assert.match(rendered, /## Referências/u);
  assert.match(rendered, /Cognitive Architecture and Instructional Design/u);
  assert.doesNotMatch(rendered, /Pedagogia da autonomia/u);
  assert.equal(renderLocalReferences(rendered, entries), rendered);
});

test("modo de conferência detecta divergência da página gerada", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aralearn-refs-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "referencias.bib"), fixture, "utf8");
  buildReadableReferences({ root, guides: [] });
  assert.doesNotThrow(() => buildReadableReferences({ root, check: true, guides: [] }));
  const output = path.join(root, "docs", "referencias.md");
  const crlf = fs.readFileSync(output, "utf8").replace(/\n/gu, "\r\n");
  fs.writeFileSync(output, crlf, "utf8");
  assert.doesNotThrow(() => buildReadableReferences({ root, check: true, guides: [] }));
  fs.appendFileSync(path.join(root, "docs", "referencias.md"), "alteração manual\n", "utf8");
  assert.throws(() => buildReadableReferences({ root, check: true, guides: [] }), /diverge de docs\/referencias\.bib/u);
});
