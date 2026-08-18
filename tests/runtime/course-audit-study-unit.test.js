import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCourseAuditEditableFields,
  listCourseAuditEditableFields,
  materializeCourseAuditStudyUnit,
  renderCourseAuditStudyUnitPreview
} from "../../src/ui/courseAuditStudyUnit.js";

function content() {
  return {
    title: "Unidade sobre protocolos",
    role: "theory",
    content: [{
      id: "explicacao",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Um protocolo define regras compartilhadas." }
    }],
    response: null,
    feedback: [],
    topics: ["redes", "protocolos"]
  };
}

test("editor de correção usa editableTargets reais e preserva topics sem relações", () => {
  const original = content();
  const fields = listCourseAuditEditableFields(original, { studyUnitId: "unit-1" });
  assert.deepEqual(fields.map(({ label }) => label), [
    "Título da Unidade",
    "Editar explicação"
  ]);
  const explanation = fields.find(({ slot }) => slot === "content");
  const edited = applyCourseAuditEditableFields(original, {
    title: "Unidade revisada",
    [explanation.key]: "Um protocolo define regras verificáveis e compartilhadas."
  }, { studyUnitId: "unit-1" });

  assert.equal(edited.title, "Unidade revisada");
  assert.equal(edited.content[0].data.text, "Um protocolo define regras verificáveis e compartilhadas.");
  assert.deepEqual(edited.topics, ["redes", "protocolos"]);
  assert.equal(Object.hasOwn(edited, "id"), false);
  assert.equal(Object.hasOwn(edited, "position"), false);
  assert.deepEqual(original, content());
});

test("preview de Before/After usa o renderer real e não expõe JSON bruto", () => {
  const snapshot = { content: content(), sourceLinks: [], hash: "a".repeat(64) };
  const html = renderCourseAuditStudyUnitPreview(snapshot, {
    studyUnitId: "unit-1",
    heading: "Antes"
  });

  assert.match(html, /data-package="aralearn\.resource\.paragraph"/u);
  assert.match(html, /runtime-paragraph-block/u);
  assert.match(html, /Prévia somente leitura/u);
  assert.doesNotMatch(html, /\{"title"/u);
  assert.deepEqual(materializeCourseAuditStudyUnit(content(), {
    studyUnitId: "unit-1"
  }).topics, ["redes", "protocolos"]);
  assert.throws(() => applyCourseAuditEditableFields(content(), {
    "campo-inventado": "valor"
  }, { studyUnitId: "unit-1" }), /campo editável deixou de existir/u);
});
