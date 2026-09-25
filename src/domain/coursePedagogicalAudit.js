import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { inspectCourseAudioReadiness } from "./courseMedia.js";

export const PEDAGOGICAL_AUDIT_DIMENSIONS = Object.freeze([
  "alignment", "evidence", "representation", "feedback", "sufficiency"
]);
const comparable = value => String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR");
const controlText = value => [...value].some(character => {
  const code = character.codePointAt(0);
  return code < 32 && ![9, 10, 13].includes(code) || code === 127;
});
const text = (instance, slot) => {
  try { return RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, slot).trim(); }
  catch { return ""; }
};

// The server verifies contradictions it can observe. The report below is input
// for a separate semantic review, not a score or a certification of learning.
export function inspectPedagogicalEvidence({ content, practices = [], requirements = [], objective = "" }) {
  const issues = inspectCourseAudioReadiness(content);
  const add = (code, path, message) => issues.push({ code, path, message });
  let studentContent = [];
  try {
    const visible = RESOURCE_PACKAGE_REGISTRY.prepareStudyUnitForSemantics(content);
    studentContent = (visible?.content ?? []).map(instance => ({ component: instance.package,
      text: RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, "content").trim() }));
  } catch {
    add("pedagogical_student_view_unavailable", "content", "Não foi possível reconstruir o enunciado com as respostas ocultas. Corrija os alvos antes da inspeção.");
  }
  const response = content?.response;
  const feedback = (content?.feedback ?? []).map(instance => text(instance, "feedback")).filter(Boolean);
  if (practices.length && !response) add("pedagogical_evidence_without_response", "response",
    "O requisito declarado não possui resposta observável nesta unidade.");
  practices.forEach((practice, index) => {
    if (!requirements.some(requirement => requirement.id === practice.evidenceRequirementId)) {
      add("pedagogical_requirement_missing", `practices[${index}]`, "A prática referencia um requisito ausente do plano.");
    }
  });
  const data = response?.data ?? {};
  const feedbackTexts = [...feedback, ...(data.options ?? []).map(option => option.feedback).filter(value => typeof value === "string")];
  if (response && feedbackTexts.some(value =>
    /(?:^|[.!?]\s+)(?:critério de revisão\b|conteúdo salvo sem revisão autoral\b|accessibleText\b|a operação-alvo da tarefa é(?:\s|$))/iu.test(value))) {
    add("pedagogical_editorial_feedback", "feedback",
      "O retorno contém orientação editorial, mesmo que também explique a resposta. Retire o texto de bastidor e preserve a explicação do erro plausível ao estudante.");
  }
  const completeOptionFeedback = response?.package === "aralearn.response.choice" && data.options?.length > 0 &&
    data.options.every(option => typeof option.feedback === "string" && option.feedback.trim());
  if (response && !feedback.length && !completeOptionFeedback) add("pedagogical_feedback_missing", "feedback",
    "A prática precisa explicar a resposta e ajudar a superar erros, também sem conexão.");
  const options = (data.options ?? []).map(option => option.text ?? option.code ?? "");
  if (response?.package === "aralearn.response.choice" &&
      new Set(options.map(comparable)).size !== options.length) {
    add("pedagogical_duplicate_alternatives", "response.data.options", "Há alternativas visivelmente equivalentes; diferencie as decisões oferecidas.");
  }
  const targets = [];
  for (const [index, blank] of (data.blanks ?? []).entries()) {
    const instance = (content?.content ?? []).find(item => item.id === blank.targetInstanceId);
    const path = blank.targetPath.split(":", 1)[0];
    const compareAnswer = value => {
      const normalized = RESOURCE_PACKAGE_REGISTRY.normalizePracticeValue(instance, path, value);
      return ["aralearn.resource.code", "aralearn.resource.terminal_session"].includes(instance?.package)
        ? normalized : comparable(normalized);
    };
    const accepted = new Set([blank.answer, ...(blank.acceptedAnswers ?? [])].map(compareAnswer));
    if ((blank.distractors ?? []).some(value => accepted.has(compareAnswer(value)))) {
      add("pedagogical_ambiguous_gap", `response.data.blanks[${index}].distractors`,
        "Um distrator também é uma resposta aceita para esta lacuna.");
    }
    const target = instance && RESOURCE_PACKAGE_REGISTRY.practiceTargets(instance)
      .find(item => item.path === path);
    const visibleText = [data.prompt ?? "", ...studentContent.map(item => item.text)].join(" ");
    targets.push({ label: target?.label ?? "Alvo ausente", component: instance?.package,
      path: blank.targetPath, answer: blank.answer, alternatives: [blank.answer, ...(blank.distractors ?? [])],
      answerAppearsInStudentText: [blank.answer, ...(blank.acceptedAnswers ?? [])]
        .some(answer => comparable(answer) && comparable(visibleText).includes(comparable(answer))) });
  }
  return { issues, observation: {
    objective, title: content?.title ?? "", requirements: practices.map(practice => {
      const requirement = requirements.find(item => item.id === practice.evidenceRequirementId);
      return requirement ? { statement: requirement.statement, description: requirement.description ?? "",
        operation: practice.invariantTaskOperation ?? "" } : null;
    }).filter(Boolean),
    question: data.question ?? data.prompt ?? "", response: response?.package ?? null,
    selectionMode: data.selectionMode ?? null, options, correctAlternativeCount: data.answerIds?.length ?? null,
    alternatives: (data.options ?? []).map(option => ({ text: option.text ?? option.code ?? "",
      expected: (data.answerIds ?? []).includes(option.id), feedback: option.feedback ?? "" })),
    targets, studentContent, feedback, content: (content?.content ?? []).map(instance => text(instance, "content")).filter(Boolean),
    review: "Compare a operação realmente exigida e a resposta observável com cada requisito. studentContent já oculta as lacunas; verifique se outros trechos entregam a resposta e se os dados determinam o cálculo. answerAppearsInStudentText é um indício, não um defeito automático: julgue sua função no enunciado. Um rótulo correto não demonstra uma relação ou procedimento. Examine distratores cruzados, suficiência da explicação, variedade necessária e feedback específico. Contagem e schema não certificam suficiência. Cite fragmentos da base salva nas evidências."
  } };
}

// A focal packet is assembled by the database under the same revision/hash as
// the report. The projection makes the demanded operation and collected answer
// inspectable, without asking the model to join IDs or infer hidden feedback.
export function projectPedagogicalAudit(basis) {
  const units = basis.studyUnits.map(unit => {
    const audit = inspectPedagogicalEvidence({ content: unit.content,
      objective: basis.microsequence?.goal ?? "",
      practices: unit.application?.practiceApplications ?? [],
      requirements: basis.planItems.filter(item => item.kind === "evidence_requirement") });
    return { unitId: unit.id, ...audit };
  });
  return { basis, units, instruction: "Faça uma segunda leitura crítica do percurso salvo. Compare objetivo, Explicação, operação exigida, evidência esperada, resposta efetivamente recolhida e feedback. Julgue alinhamento, evidência, representação, feedback e suficiência; cite passagens reais. Examine a combinação das lacunas, os distratores e o conjunto de alternativas corretas. Procure atalhos óbvios, repetições mecânicas, explicação rasa ou quantidade artificialmente mínima. No feedback, verifique se cada trecho ajuda a compreender a resposta ou superar o erro; a extensão deve servir à necessidade, sem repetir a Explicação inteira nem acrescentar títulos internos dispensáveis. Considere também o feedback específico das alternativas. Uma alternativa ou lacuna não é insuficiente por contagem: demonstre qual relação necessária foi perdida. " +
    "Em citations, confronte as ocorrências locais com as passagens das âncoras selecionadas, considerando a relação declarada em cada vínculo. A pertinência geral da obra não demonstra suporte a uma afirmação que o vínculo declara sustentar ou citar. Não cruze âncoras de fontes diferentes nem presuma pareamento por posição quando há várias ocorrências. Se a âncora só indicar uma página, confira a passagem no destino ou registre que falta verificação; fonte existente não é fonte ausente. Divergência ou suporte declarado mas não demonstrado devem constar no parecer e impedir declarar consistência. " +
    "Insuficiência exige correção e nova inspeção; a gravação não certifica aprendizagem." };
}

export function requirePedagogicalAuditConsistency(report, basis) {
  const audit = projectPedagogicalAudit(basis);
  const units = basis.targetKind === "study_unit" ? audit.units.filter(unit => unit.unitId === basis.targetId) : audit.units;
  if (report.outcome === "consistent" && units.some(unit => unit.issues.length)) {
    throw Object.assign(new TypeError("Há contradições objetivas na prática. Registre as insuficiências e corrija antes de declarar consistência."),
      { code: "pedagogical_audit_contradiction", issues: units.flatMap(unit => unit.issues) });
  }
  const hasPractice = basis.studyUnits.some(unit => (basis.targetKind !== "study_unit" || unit.id === basis.targetId) && unit.content?.response);
  if (report.checks.some(check => check.result === "not_applicable" &&
      (["alignment", "representation", "sufficiency"].includes(check.dimension) || hasPractice))) {
    throw Object.assign(new TypeError("Alinhamento, representação e suficiência sempre precisam de julgamento; com prática, examine também evidência e feedback."),
      { code: "pedagogical_audit_not_applicable" });
  }
}

function strings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  return value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
}

export function normalizePedagogicalAudit(checks, basis = null) {
  const fail = message => { throw Object.assign(new TypeError(message), { code: "invalid_pedagogical_audit" }); };
  if (!Array.isArray(checks) || checks.length !== PEDAGOGICAL_AUDIT_DIMENSIONS.length ||
      new Set(checks.map(check => check?.dimension)).size !== checks.length) {
    fail("A inspeção deve examinar alinhamento, evidência, representação, feedback e suficiência.");
  }
  const passages = basis === null ? null : strings(basis).map(comparable);
  return checks.map(check => {
    if (!check || typeof check !== "object" || Object.keys(check).sort().join() !== "dimension,evidence,reason,result" ||
        !PEDAGOGICAL_AUDIT_DIMENSIONS.includes(check.dimension) || !["sufficient", "insufficient", "not_applicable"].includes(check.result) ||
        typeof check.reason !== "string" || !check.reason.trim() || [...check.reason].length > 1000 || controlText(check.reason) ||
        !Array.isArray(check.evidence) || check.evidence.length < 1 || check.evidence.length > 6 ||
        check.evidence.some(quote => typeof quote !== "string" || !quote.trim() || [...quote].length > 500 || controlText(quote))) {
      fail("Cada dimensão precisa de julgamento, justificativa e trechos observados na base salva.");
    }
    if (passages && check.evidence.some(quote => !passages.some(passage => passage.includes(comparable(quote))))) {
      fail(`A evidência de ${check.dimension} não foi encontrada na base inspecionada.`);
    }
    return structuredClone(check);
  });
}
