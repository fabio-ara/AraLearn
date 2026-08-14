import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const docs = path.join(root, "docs");
const canonical = Object.freeze([
  "revisao-de-literatura.md",
  "quadro-teorico.md",
  "matriz-rastreabilidade-pedagogica.md",
  "glossario-construtos.md",
  "protocolo-avaliacao-artefato.md",
  "contribuicao-originalidade.md"
]);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function parseBibtexEntries(source) {
  const starts = [...source.matchAll(/^@[A-Za-z]+\{([^,]+),/gmu)];
  return starts.map((match, index) => ({
    key: match[1],
    body: source.slice(match.index + match[0].length, starts[index + 1]?.index ?? source.length)
  }));
}

test("frente pedagógica possui as seis fontes canônicas e mapa de leitura", () => {
  const map = read("docs/README.md");
  for (const name of canonical) {
    const source = fs.readFileSync(path.join(docs, name), "utf8");
    assert.ok(source.length > 1200, `${name} precisa conter síntese operacional`);
    assert.match(map, new RegExp(name.replaceAll(".", "\\."), "u"));
  }
});

test("revisão e contribuição distinguem hipótese de eficácia comprovada", () => {
  const review = read("docs/revisao-de-literatura.md");
  const contribution = read("docs/contribuicao-originalidade.md");
  assert.match(review, /não deve ser apresentado como revisão sistemática/u);
  assert.match(review, /## Lacunas e agenda da revisão formal/u);
  assert.match(contribution, /contribuição integrada a investigar/u);
  assert.match(contribution, /### Ainda proibidas/u);
});

test("quadro e protocolo proíbem proxies comportamentais ambíguos", () => {
  const framework = read("docs/quadro-teorico.md");
  const protocol = read("docs/protocolo-avaliacao-artefato.md");
  const glossary = read("docs/glossario-construtos.md");
  for (const source of [framework, protocol, glossary]) {
    assert.match(source, /atenção|aprendizagem|domínio/u);
  }
  assert.match(framework, /abertura ou tempo como atenção/u);
  assert.match(protocol, /\| retomada .* abertura ou tempo como atenção \|/u);
  assert.match(glossary, /Não equivale a/u);
});

test("bibliografia canônica cobre método, público, feedback, IA e analytics", () => {
  const bibliography = read("docs/referencias.bib");
  for (const key of [
    "dbrc2003designbased",
    "hevner2004designscience",
    "degagne2019microlearning",
    "lai2022mobile",
    "shute2008feedback",
    "tsai2022humancentered",
    "unesco2023genai"
  ]) {
    assert.match(bibliography, new RegExp(`\\{${key},`, "u"));
  }
  assert.doesNotMatch(bibliography, /doi\s*=\s*\{https?:/iu);
});

test("bibliografia de pesquisa é ampla, identificável e livre de duplicatas", () => {
  const entries = parseBibtexEntries(read("docs/referencias.bib"));
  assert.ok(entries.length >= 60, "a base deve sustentar uma revisão técnico-científica ampla");

  const keys = entries.map(({ key }) => key.toLowerCase());
  assert.equal(new Set(keys).size, keys.length, "chaves BibTeX devem ser únicas");

  const dois = entries
    .map(({ body }) => body.match(/\bdoi\s*=\s*\{([^}]+)\}/iu)?.[1]?.toLowerCase())
    .filter(Boolean);
  assert.equal(new Set(dois).size, dois.length, "DOIs devem ser únicos");

  for (const { key, body } of entries) {
    assert.match(body, /\b(?:doi|isbn|url)\s*=\s*\{[^}]+\}/iu, `${key} precisa de identificador persistente`);
  }
});

test("bibliografia cobre desenho de pesquisa, cognição, autorregulação e IA responsável", () => {
  const bibliography = read("docs/referencias.bib");
  for (const key of [
    "tricco2018prismascr",
    "peffers2007dsrm",
    "venable2016feds",
    "ainsworth2006deft",
    "cepeda2006distributed",
    "brunmair2019interleaving",
    "panadero2017selfregulated",
    "pardo2014ethical",
    "nist2024genai",
    "amershi2019humanai",
    "bandura2001agency",
    "knowles1975selfdirected",
    "ryan2020motivation",
    "iso2018usability"
  ]) {
    assert.match(bibliography, new RegExp(`\\{${key},`, "u"));
  }
});

test("governança de pesquisa separa DBR, DSR e estados epistêmicos", () => {
  const foundations = read("docs/fundamentos-pesquisa-e-governanca.md");
  const protocol = read("docs/protocolo-avaliacao-artefato.md");
  const review = read("docs/revisao-de-literatura.md");

  assert.match(foundations, /DBR e DSR são complementares, não sinônimos/u);
  assert.match(protocol, /Trilha A — Design-Based Research \(DBR\)/u);
  assert.match(protocol, /Trilha B — Design Science Research \(DSR\)/u);
  for (const marker of ["evidência externa", "inferência", "hipótese", "decisão", "limitação"]) {
    assert.match(`${foundations}\n${review}`, new RegExp(marker, "iu"));
  }
});
