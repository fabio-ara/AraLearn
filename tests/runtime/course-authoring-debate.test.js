import assert from "node:assert/strict";
import test from "node:test";
import { buildCourseAuthoringDebate, renderCourseAuthoringDebate, bindCourseAuthoringDebate } from "../../src/ui/courseAuthoringDebate.js";

const courseId = "123e4567-e89b-42d3-a456-426614174000";
const context = { courseId, courseRevision: 8, title: "Rede <sintética>", contextLabel: "a Explicação compartilhada",
  route: `#/authoring/courses/${courseId}?section=content&didacticMicrosequenceId=ms-rede` };

test("debate exige recorte da mesma identidade e revisão, oferece literal e não autoriza escrita", () => {
  const text = buildCourseAuthoringDebate(context);
  assert.ok(text.includes(context.route));
  assert.match(text, /Revisão observada: 8/u);
  assert.match(text, /ler o recorte atual/u);
  assert.match(text, /não autoriza escrita/u);
  assert.match(text, /Não registre revisão humana por mim/u);
  assert.throws(() => buildCourseAuthoringDebate({ ...context, courseRevision: 0 }), TypeError);
  assert.throws(() => buildCourseAuthoringDebate({ ...context, courseId: "other" }), TypeError);
  assert.match(renderCourseAuthoringDebate(context), /Rede &lt;sintética&gt;/u);
});

test("cópia mantém deep link exato sem query de sessão; falta de clipboard conserva texto selecionável", async () => {
  let click, copied, selected = false;
  const field = { value: buildCourseAuthoringDebate(context), focus() {}, select() { selected = true; } };
  const status = {};
  const host = { querySelector(selector) { return selector.includes("prompt") ? field : status; } };
  const button = { closest: () => host };
  const root = { contains: () => true, addEventListener(_type, value) { click = value; }, removeEventListener() {} };
  const event = { target: { closest: () => button }, preventDefault() {}, stopPropagation() {} };
  bindCourseAuthoringDebate(root, { navigatorValue: { clipboard: { async writeText(text) { copied = text; } } },
    locationValue: { href: "https://example.test/app/?token=never-copy#/old" } });
  await click(event);
  assert.ok(copied.includes(`https://example.test/app/${context.route}`));
  assert.doesNotMatch(copied, /token=|never-copy|#\/old/u);
  bindCourseAuthoringDebate(root, { navigatorValue: {}, locationValue: {} });
  await click(event);
  assert.equal(selected, true);
  assert.match(status.textContent, /Cópia automática indisponível/u);
});
