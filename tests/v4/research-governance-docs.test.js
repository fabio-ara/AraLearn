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
  assert.match(review, /Não é uma revisão sistemática/u);
  assert.match(review, /Lacunas que permanecem abertas/u);
  assert.match(contribution, /contribuição integrada a investigar/u);
  assert.match(contribution, /Alegações ainda não permitidas/u);
});

test("quadro e protocolo proíbem proxies comportamentais ambíguos", () => {
  const framework = read("docs/quadro-teorico.md");
  const protocol = read("docs/protocolo-avaliacao-artefato.md");
  const glossary = read("docs/glossario-construtos.md");
  for (const source of [framework, protocol, glossary]) {
    assert.match(source, /atenção|aprendizagem|domínio/u);
  }
  assert.match(framework, /abertura ou tempo como atenção/u);
  assert.match(protocol, /não registrar tempo em tela, cliques ou tentativas/u);
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
