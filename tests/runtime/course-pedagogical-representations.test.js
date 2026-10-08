import test from "node:test";
import assert from "node:assert/strict";
import { inspectPedagogicalEvidence, projectPedagogicalAudit, requirePedagogicalAuditConsistency,
  PEDAGOGICAL_AUDIT_DIMENSIONS } from "../../src/domain/coursePedagogicalAudit.js";
import { inspectBpmnSemantics } from "../../src/resources/packages/bpmn-process/semantics.js";
import { shareHumanAuditContext } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanAuditContext.js";
import { bpmnInstance } from "../helpers/bpmnFixture.js";

function basis(targetKind = "study_unit") {
  const content = id => ({ id, title: `Unidade ${id}`, position: 1, role: "theory", topics: [],
    content: [bpmnInstance()], response: null, feedback: [] });
  return { targetKind, targetId: targetKind === "study_unit" ? "u1" : "ms", audience: null,
    microsequence: { id: "ms", title: "Processo", goal: "Interpretar a comunicação",
      explanation: { title: "Comunicação", content: [bpmnInstance()] } },
    planItems: [], studyUnits: ["u1", "u2"].map(id => ({ id, content: content(id),
      application: { practiceApplications: [] }, design: { parameters: { practice_position: "before_and_after" } } })),
    dependencies: [{ title: "Outro processo", explanation: { title: "Dependência", content: [bpmnInstance({ invalid: true })] } }],
    citations: [{ targetKind, links: [{ source: { title: "Fonte" }, anchors: [{ verificationExcerpt: null }],
      occurrences: [{ quote: "Passagem literal α 😀" }] }] }] };
}
const report = (outcome = "consistent") => ({ outcome, checks: PEDAGOGICAL_AUDIT_DIMENSIONS.map(dimension => ({
  dimension, result: outcome === "needs_attention" && dimension === "representation" ? "insufficient" : "sufficient"
})) });

test("BPMN da unidade inspecionada impede consistent em conteúdo e feedback", () => {
  for (const slot of ["content", "feedback"]) {
    const saved = basis();
    const instance = { ...bpmnInstance({ invalid: true }), id: `bpmn-${slot}` };
    saved.studyUnits[0].content[slot] = [instance];
    assert.deepEqual(inspectPedagogicalEvidence({ content: saved.studyUnits[0].content }).issues, []);
    assert.throws(() => requirePedagogicalAuditConsistency(report(), saved), error => {
      assert.equal(error.code, "pedagogical_audit_contradiction");
      assert.match(error.message, /Unidade u1/u);
      assert.match(error.message, /evento final não recebe mensagem/u);
      return true;
    });
    const issues = projectPedagogicalAudit(saved).representationIssues;
    const expected = inspectBpmnSemantics(saved.studyUnits[0].content[slot][0].data);
    assert.deepEqual(issues.map(issue => issue.code), expected.map(issue => issue.code));
    assert.equal(issues[0].targetKind, "study_unit");
    assert.equal(issues[0].targetId, "u1");
    assert.equal(issues[0].resourceId, instance.id);
    assert.equal(issues[0].path, `${slot}[0].data.${expected[0].path}`);
    assert.match(issues[0].message, slot === "feedback" ? /Feedback/u : /Conteúdo/u);
  }
});

test("BPMN da Explicação e de seu percurso impede consistent, sem auditar dependências", () => {
  for (const placement of ["explanation", "unit"]) {
    const saved = basis("microsequence_explanation");
    const target = placement === "explanation" ? saved.microsequence.explanation : saved.studyUnits[1].content;
    target.content = [bpmnInstance({ invalid: true })];
    assert.throws(() => requirePedagogicalAuditConsistency(report(), saved), { code: "pedagogical_audit_contradiction" });
    const issues = projectPedagogicalAudit(saved).representationIssues;
    assert.equal(issues.length, 1);
    assert.equal(issues[0].targetId, placement === "explanation" ? "ms" : "u2");
    assert.equal(issues[0].targetKind, placement === "explanation" ? "microsequence_explanation" : "study_unit");
    assert.match(issues[0].message, placement === "explanation" ? /Explicação “Comunicação”/u : /Unidade u2/u);
  }
});

test("BPMN válido e needs_attention passam; diagnóstico não altera a base nem a validação de materialização", () => {
  for (const targetKind of ["study_unit", "microsequence_explanation"]) {
    const saved = basis(targetKind);
    assert.deepEqual(projectPedagogicalAudit(saved).representationIssues, []);
    assert.doesNotThrow(() => requirePedagogicalAuditConsistency(report(), saved));
    saved.studyUnits[0].content.content = [bpmnInstance({ invalid: true })];
    const before = structuredClone(saved);
    assert.doesNotThrow(() => requirePedagogicalAuditConsistency(report("needs_attention"), saved));
    assert.deepEqual(inspectPedagogicalEvidence({ content: saved.studyUnits[0].content }).issues, []);
    assert.deepEqual(saved, before);
  }
});

test("inspeção de uma unidade não transforma outras unidades, Explicação ou fontes em alvo", () => {
  const saved = basis();
  saved.studyUnits[1].content.content = [bpmnInstance({ invalid: true })];
  saved.microsequence.explanation.content = [bpmnInstance({ invalid: true })];
  saved.citations[0].links[0].source.content = [bpmnInstance({ invalid: true })];
  assert.deepEqual(projectPedagogicalAudit(saved).representationIssues, []);
  assert.doesNotThrow(() => requirePedagogicalAuditConsistency(report(), saved));
});

test("compartilhamento conserva base integral e diagnósticos específicos de cada alvo", () => {
  const saved = basis();
  saved.studyUnits[1].content.content = [bpmnInstance({ invalid: true })];
  const explanation = { ...saved, targetKind: "microsequence_explanation", targetId: "ms" };
  const unitAudit = projectPedagogicalAudit(saved), explanationAudit = projectPedagogicalAudit(explanation);
  const context = { studyUnits: [{ auditoriaPedagogica: unitAudit }], explicacoes: [{ auditoriaPedagogica: explanationAudit }] };
  const projected = shareHumanAuditContext(context, { id: "course", revision: 7 });
  assert.equal(projected.auditoriasPedagogicas.length, 1);
  const shared = projected.auditoriasPedagogicas[0];
  for (const [key, expected] of [["studyUnits", unitAudit], ["explicacoes", explanationAudit]]) {
    const local = projected[key][0].auditoriaPedagogica;
    const { foco, unidadesParaConfronto, citacoesDoFoco, ...resolved } = { ...local, instruction: shared.instruction, basis: { ...shared.basis, ...local.basis } };
    if (citacoesDoFoco) resolved.basis = { ...resolved.basis,
      citations: citacoesDoFoco.map(position => shared.citacoes[position - 1]) };
    resolved.units = unidadesParaConfronto.map(position => {
      const { observation, ...unit } = shared.unidadesParaConfronto[position - 1];
      const { declarado, tarefaApresentada, ...rest } = observation;
      return { ...unit, observation: { ...rest, ...declarado, ...tarefaApresentada } };
    });
    assert.equal(foco, shared.foco);
    assert.deepEqual(resolved, expected);
  }
  assert.deepEqual(projected.studyUnits[0].auditoriaPedagogica.representationIssues, []);
  assert.equal(projected.explicacoes[0].auditoriaPedagogica.representationIssues.length, 1);
});
