import assert from "node:assert/strict";
import test from "node:test";
import { formatCoverageLabel, renderCourseCurriculumMap } from "../../src/ui/CourseCurriculumMap.js";
import { curriculumMapFixture } from "../fixtures/courseCurriculumMapFixture.js";

test("rótulo nominal omite somente ponto terminal e mantém pontos técnicos internos", () => {
  for (const [input, expected] of [
    ["Redes de computadores.", "Redes de computadores"],
    ["Rede, host, interface e protocolo.", "Rede, host, interface e protocolo"],
    ["LAN, WAN e redes sem fio.", "LAN, WAN e redes sem fio"],
    ["Meios de transmissão.", "Meios de transmissão"],
    ["IEEE 802.3.", "IEEE 802.3"], ["H.323.", "H.323"],
    ["IPv4 e IPv6", "IPv4 e IPv6"]
  ]) assert.equal(formatCoverageLabel(input), expected);
});

test("abreviações, reticências e enunciados sentenciais conservam pontuação", () => {
  for (const input of ["Prof.", "Dr.", "Materiais etc.", "Letra A.", "Padrão U.S.A.",
    "Alternativas...", "Alternativas…", "Explicar quando o quadro é encaminhado.",
    "Redes conectam computadores.", "O quadro segue a porta indicada.",
    "A rede transmite dados.", "Protocolos definem regras.", "Primeiro caso. Segundo caso.",
    "Relações: causa e consequência."]
  ) assert.equal(formatCoverageLabel(input), input);
});

test("setas de módulo e lição ficam fora de summary; microssequência é título estrutural", () => {
  const fixture = curriculumMapFixture({ moduleCount: 1, lessonCount: 1, microsequenceCount: 2 });
  const html = renderCourseCurriculumMap(fixture);
  const summaries = [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)];
  assert.ok(summaries.every(([, content]) => !content.includes("<a ")));
  assert.match(html, /<\/details><a [^>]*data-curriculum-key="module:module-1"/);
  assert.match(html, /<\/details><a [^>]*data-curriculum-key="lesson:lesson-1-1"/);
  assert.match(html, /class="course-curriculum-map-node-heading"><h5>[^<]+<\/h5><a /);
  assert.match(html, /data-curriculum-key="microsequence:micro-1-1-1"[^>]*aria-label="Abrir microssequência em Conteúdo:/);
  assert.match(html, /data-curriculum-key="dependency:micro-1-1-2:micro-1-1-1">[^<]+<\/a>/);
});

test("apresentação mantém statement, aprovação, dependências, IDs e destinos sem produção", () => {
  const fixture = curriculumMapFixture({ moduleCount: 1, lessonCount: 1, microsequenceCount: 2 });
  fixture.curriculumScopeItems[0].statement = "IEEE 802.3.";
  fixture.curriculumScopeItems[0].developedIn = [];
  fixture.curriculumScopeItems[0].state = "planned";
  const before = structuredClone(fixture);
  const html = renderCourseCurriculumMap(fixture);
  assert.match(html, /class="course-curriculum-map-node-title">IEEE 802\.3<\/span>/);
  assert.doesNotMatch(html, /Desenvolvido em|unidades prontas/);
  assert.match(html, /didacticMicrosequenceId=micro/u);
  assert.deepEqual(fixture, before);
});
