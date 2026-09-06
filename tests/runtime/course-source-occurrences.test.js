import assert from "node:assert/strict";
import test from "node:test";
import {
  COURSE_SOURCE_MAX_OCCURRENCES,
  courseSourceOccurrenceTextTargets,
  listCourseSourceOccurrenceTargets,
  normalizeCourseSourceOccurrence,
  normalizeCourseSourceOccurrences,
  resolveCourseSourceOccurrence,
  resolveCourseSourceOccurrences
} from "../../src/domain/courseSourceOccurrences.js";

const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const unit = (content = [paragraph("p", "Um **quadro** transporta dados entre interfaces.")]) => ({
  id: "unit", position: 1, title: "Encaminhamento", role: "theory", content, response: null, feedback: [], topics: []
});
const occurrence = (overrides = {}) => ({
  occurrenceId: "citacao-um", slot: "content", resourceId: "p", path: "text",
  quote: "**quadro**", prefix: "Um ", suffix: " transporta", ...overrides
});

test("ocorrência resolve na folha literal sem remover markup ou perder contexto", () => {
  const original = occurrence();
  assert.deepEqual(normalizeCourseSourceOccurrence(original), original);
  assert.deepEqual(resolveCourseSourceOccurrence(unit(), original), { ...original, status: "resolved" });
  assert.equal(resolveCourseSourceOccurrence(unit(), occurrence({ quote: "quadro" })).status, "needs_review");
  assert.equal(resolveCourseSourceOccurrence(unit(), occurrence({ prefix: "Um", suffix: null })).status, "needs_review");
  assert.equal(Object.hasOwn(original, "status"), false);
});

test("citação repetida exige contexto unívoco e não escolhe outra instância", () => {
  const repeated = unit([paragraph("p", "A rede liga. A rede recebe."), paragraph("outro", "Um **quadro** transporta")]);
  assert.equal(resolveCourseSourceOccurrence(repeated, occurrence({ quote: "A rede", prefix: null, suffix: null })).status, "needs_review");
  assert.equal(resolveCourseSourceOccurrence(repeated, occurrence({ quote: "A rede", prefix: null, suffix: " recebe." })).status, "resolved");
  assert.equal(resolveCourseSourceOccurrence(repeated, occurrence({ resourceId: "ausente" })).status, "needs_review");
  assert.equal(resolveCourseSourceOccurrence(unit([paragraph("p", "aaaa")]), occurrence({ quote: "aa", prefix: null, suffix: null })).status, "needs_review");
});

test("mover a instância conserva identidade; retirar ou mudar a folha conserva a pendência", () => {
  const moved = unit([paragraph("primeiro", "Outra explicação."), paragraph("p", "Um **quadro** transporta dados entre interfaces.")]);
  assert.equal(resolveCourseSourceOccurrence(moved, occurrence()).status, "resolved");
  const removed = resolveCourseSourceOccurrence(unit([paragraph("primeiro", "Um **quadro** transporta dados entre interfaces.")]), occurrence());
  assert.deepEqual(removed, { ...occurrence(), status: "needs_review" });
  assert.equal(resolveCourseSourceOccurrence(moved, occurrence({ path: "title", quote: "Encaminhamento", prefix: null, suffix: null })).status, "needs_review");
});

test("folhas rich e slots usam o catálogo e instrumentação não ativa edição", () => {
  const studyUnit = unit([{
    id: "rich", package: "aralearn.resource.paragraph", version: "1.0.0",
    data: { format: "rich", blocks: [{ kind: "paragraph", inlines: [{ kind: "text", text: "木 representa árvore." }] }] }
  }]);
  studyUnit.feedback = [paragraph("retorno", "Releia a definição.")];
  const targets = listCourseSourceOccurrenceTargets(studyUnit);
  assert.equal(targets.find(({ resourceId }) => resourceId === "rich").path, "blocks[0].inlines[0].text");
  const rich = occurrence({ resourceId: "rich", path: "blocks[0].inlines[0].text", quote: "木", prefix: null, suffix: " representa" });
  const feedback = occurrence({ occurrenceId: "retorno", slot: "feedback", resourceId: "retorno", quote: "definição", prefix: "a ", suffix: "." });
  assert.deepEqual(resolveCourseSourceOccurrences(studyUnit, [rich, feedback]).map(({ status }) => status), ["resolved", "resolved"]);
  const before = structuredClone(studyUnit);
  const renderTargets = courseSourceOccurrenceTextTargets(studyUnit, [rich, rich, occurrence()]);
  assert.deepEqual(renderTargets.map(({ resourceId, path }) => ({ resourceId, path })), [{ resourceId: "rich", path: "blocks[0].inlines[0].text" }]);
  assert.deepEqual(studyUnit, before);
});

test("writer rejeita status, campos extras, controles, caminho inválido e identidade repetida", () => {
  for (const value of [
    occurrence({ status: "resolved" }), occurrence({ path: "text;delete" }), occurrence({ path: "constructor.name" }),
    occurrence({ path: "data.__proto__.text" }), occurrence({ path: "prototype[0].text" }),
    occurrence({ resourceId: " p" }), occurrence({ occurrenceId: "a\nb" }),
    occurrence({ quote: "\u0000" }), occurrence({ suffix: "" }),
    occurrence({ quote: "a".repeat(4_001) }), occurrence({ prefix: "a".repeat(501) })
  ]) assert.throws(() => normalizeCourseSourceOccurrence(value), { code: "invalid_course_source_occurrence" });
  assert.throws(() => normalizeCourseSourceOccurrences([occurrence(), occurrence()]), { code: "invalid_course_source_occurrence" });
  assert.equal(normalizeCourseSourceOccurrences(Array.from({ length: COURSE_SOURCE_MAX_OCCURRENCES }, (_, index) => occurrence({ occurrenceId: String(index) }))).length, 16);
  assert.throws(() => normalizeCourseSourceOccurrences(Array.from({ length: 17 }, (_, index) => occurrence({ occurrenceId: String(index) }))), { code: "invalid_course_source_occurrence" });
});

test("Unicode, quebras e limites são preservados por caracteres, sem transliteração", () => {
  const exact = "🪵".repeat(4_000);
  assert.equal(normalizeCourseSourceOccurrence(occurrence({ quote: exact, prefix: null, suffix: null })).quote, exact);
  const quoted = occurrence({ quote: "林\n representa bosque", prefix: "木 e ", suffix: "." });
  assert.equal(resolveCourseSourceOccurrence(unit([paragraph("p", "木 e 林\n representa bosque.")]), quoted).status, "resolved");
  assert.equal(resolveCourseSourceOccurrence(unit([paragraph("p", "木 e 林 representa bosque.")]), quoted).status, "needs_review");
});
