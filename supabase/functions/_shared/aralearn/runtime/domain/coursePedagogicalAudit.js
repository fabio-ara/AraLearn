import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { inspectBpmnSemantics } from "../resources/packages/bpmn-process/semantics.js";
import { inspectCourseAudioReadiness } from "./courseMedia.js";
import { CONTEXTUAL_STUDY_TOOLS } from "../resources/studySupport.js";
import { responseAuthoredFeedback, responseFeedbackStates } from "../resources/sdk/responseFeedback.js";

const LEGACY_PEDAGOGICAL_AUDIT_DIMENSIONS = Object.freeze([
  "alignment", "evidence", "representation", "feedback", "sufficiency"
]);
export const PEDAGOGICAL_AUDIT_DIMENSIONS = Object.freeze([...LEGACY_PEDAGOGICAL_AUDIT_DIMENSIONS, "configuration"]);
export function hasCurrentPedagogicalAudit(checks) {
  return Array.isArray(checks) && checks.length === PEDAGOGICAL_AUDIT_DIMENSIONS.length &&
    PEDAGOGICAL_AUDIT_DIMENSIONS.every(dimension => checks.some(check => check?.dimension === dimension));
}
const comparable = value => String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR");
const folded = value => comparable(value).normalize("NFD").replace(/\p{M}/gu, "");
const explanatoryOperation = value => /\b(?:compar|calcul|justific|relacion|explic|infer|interpret|analis|transform)/u.test(folded(value));
const genericFeedback = value => /^(?:corret[oa]|incorret[oa]|cert[oa]|errad[oa]|resposta\s+(?:in)?correta|isso\s+mesmo|boa\s+tentativa|tente\s+novamente)[.!?…\s]*$/iu.test(comparable(value));
const controlText = value => [...value].some(character => {
  const code = character.codePointAt(0);
  return code < 32 && ![9, 10, 13].includes(code) || code === 127;
});
const text = (instance, slot) => {
  try { return RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, slot).trim(); }
  catch { return ""; }
};
const plain = value => Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

const calculationOperation = value =>
  /\b(?:calcul|somar|somando|subtra|multiplic|divid|divis|potenc|raiz|porcent|percentu)\w*/u.test(folded(value));

// O material que o aluno vê (conteúdos, resposta, feedback e passagens citadas)
// nunca se confunde com a declaração de autoria (plano, aplicação, objetivo).
function citationStrings(citations) {
  return (Array.isArray(citations) ? citations : [])
    .flatMap(citation => strings(citation?.links ?? []));
}

// Apoios/ferramentas declarados no conteúdo apresentado (ex.: calculadora).
function supportLabels(content) {
  try { return RESOURCE_PACKAGE_REGISTRY.listStudyTools(content).map(({ label }) => label).filter(Boolean); }
  catch { return []; }
}

// Apoios disponíveis no Estudo que a autoria não declarou no conteúdo. A lista
// de ferramentas contextuais vem da mesma fonte de dados da UI de Estudo.
function hostSupportLabels(content) {
  const declared = new Set((content?.content ?? []).map(instance => `${instance?.package}@${instance?.version}`));
  return CONTEXTUAL_STUDY_TOOLS.flatMap(({ package: packageId, version }) => {
    if (declared.has(`${packageId}@${version}`)) return [];
    const definition = RESOURCE_PACKAGE_REGISTRY.get(packageId, version);
    const label = definition?.manifest?.tool?.label ?? definition?.manifest?.label;
    return label ? [label] : [];
  });
}

// Folhas que o envelope guarda para avaliar: não demonstram a apresentação. Em
// lacuna por escolha os distratores podem aparecer como opções, mas isolados são
// insuficientes como prova de ensino; a projeção acessível do pacote decide o
// que aparece. Usado só no fallback de conteúdo/retorno sem projeção.
const NON_PRESENTED_KEYS = new Set(["answer", "acceptedAnswers", "distractors", "answerIds",
  "id", "targetInstanceId", "targetPath", "misconceptionId"]);

// Percorre os campos de dados descartando as folhas de avaliação.
function presentedDataStrings(value) {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(presentedDataStrings);
  if (plain(value)) return Object.entries(value)
    .filter(([key]) => !NON_PRESENTED_KEYS.has(key))
    .flatMap(([, child]) => presentedDataStrings(child));
  return [];
}

// Texto que o aluno efetivamente lê numa instância: a projeção acessível do
// pacote e, sem ela, os campos de dados sem as folhas de avaliação.
function presentedInstance(instance, slot) {
  if (!plain(instance)) return [];
  const accessible = text(instance, slot);
  if (accessible) return [accessible];
  return presentedDataStrings(instance?.data ?? {});
}

// Projeção acessível estrita da resposta: sem projeção, nada é presumido
// apresentado — enums de controle (modo, critério, kind, modo de resposta) não
// podem entrar como material.
function projectedResponse(response) {
  if (!plain(response)) return [];
  const accessible = text(response, "response");
  return accessible ? [accessible] : [];
}

// Retorno autoral declarado na própria prática, com escopo e condição de exibição.
// A lista vem da mesma fonte que o renderer usa: o material apresentado e o juízo
// de feedback não divergem do que o estudante pode ler.
function authoredResponseFeedback(response) {
  return responseAuthoredFeedback(response?.package, plain(response?.data) ? response.data : {});
}

function responseReturns(response) {
  return [...new Set(authoredResponseFeedback(response).map(({ text }) => text))];
}

// A ordenação apresenta os próprios alvos como valores reordenáveis. A
// projeção semântica os oculta para evitar gabaritos, mas o renderer os mostra.
// Só recupere esses labels depois que a relação completa provar que cada
// resposta ocorre uma vez no campo e materializa um controle visível. Nenhum
// id, metadado ou valor solto de target entra no material apresentado.
function presentedOrderingLabels(studyUnit) {
  if (!plain(studyUnit) || studyUnit.response?.package !== "aralearn.response.ordering") return [];
  const targets = studyUnit.response?.data?.targets;
  if (!Array.isArray(targets) || targets.length === 0) return [];
  try {
    if (RESOURCE_PACKAGE_REGISTRY.validateStudyUnitRelations(studyUnit).length) return [];
    const instances = new Map((studyUnit.content ?? []).filter(plain).map(instance => [instance.id, instance]));
    return [...new Set(targets.map(target => {
      const instance = instances.get(target?.targetInstanceId);
      if (!plain(instance)) return "";
      const field = String(target?.targetPath ?? "").split(":", 1)[0].trim();
      return field && typeof target?.answer === "string"
        ? RESOURCE_PACKAGE_REGISTRY.practiceValueLabel(instance, field, target.answer).trim()
        : "";
    }).filter(Boolean))];
  } catch { return []; }
}

// Resposta apresentada: pergunta e itens pela projeção acessível do pacote mais
// os retornos por alternativa.
function presentedResponse(response) {
  return [...projectedResponse(response), ...responseReturns(response)];
}

// Apresentação de uma unidade: conteúdo já preparado (lacunas ainda ocultas),
// resposta e retornos.
function presentedStudyUnit(content) {
  if (!plain(content)) return [];
  let visible;
  try { visible = RESOURCE_PACKAGE_REGISTRY.prepareStudyUnitForSemantics(content); }
  catch { visible = content; }
  return [
    ...(Array.isArray(visible?.content) ? visible.content : []).flatMap(instance => presentedInstance(instance, "content")),
    ...(visible?.response ? presentedResponse(visible.response) : []),
    ...(Array.isArray(visible?.feedback) ? visible.feedback : []).flatMap(instance => presentedInstance(instance, "feedback")),
    ...presentedOrderingLabels(content)
  ];
}

// Apresentação da Explicação compartilhada: alvo próprio, mas ainda assim
// delimitado ao texto apresentado (a prosa, não o envelope dos recursos).
function presentedExplanation(explanation) {
  if (!plain(explanation)) return [];
  return ["content", "feedback"].flatMap(slot =>
    (Array.isArray(explanation[slot]) ? explanation[slot] : []).flatMap(instance => presentedInstance(instance, slot)));
}

// Escopo de evidência da leitura positiva: o texto do próprio alvo apresentado.
// Títulos identificam; plano, declaração de autoria e a Explicação compartilhada
// (alvo próprio) não demonstram a apresentação. Sem forma canônica de base,
// devolve null e a leitura antiga permanece válida.
export function pedagogicalAuditScopes(basis) {
  if (!plain(basis)) return null;
  const units = Array.isArray(basis.studyUnits) ? basis.studyUnits : null;
  const microsequence = plain(basis.microsequence) ? basis.microsequence : null;
  if (units === null && microsequence === null) return null;
  const targetKind = basis.targetKind;
  const targetId = basis.targetId;
  const explanation = microsequence?.explanation;
  const unitMaterial = unit => (plain(unit) ? presentedStudyUnit(unit.content ?? {}) : []);
  // material = o texto apresentado neste alvo (conteúdo, resposta, feedback).
  // identity = títulos do foco, da Explicação e das Unidades: identificam.
  const material = targetKind === "microsequence_explanation"
    ? [...presentedExplanation(explanation), ...(units ?? []).flatMap(unitMaterial)]
    : targetKind === "study_unit"
      ? (units ?? []).filter(unit => unit?.id === targetId).flatMap(unitMaterial)
      : [];
  const identity = [
    ...(typeof microsequence?.title === "string" ? [microsequence.title] : []),
    ...(typeof explanation?.title === "string" ? [explanation.title] : []),
    ...(units ?? []).map(unit => (unit?.content?.title ?? unit?.title ?? null)).filter(title => typeof title === "string")
  ];
  const passages = [...material, ...identity,
    ...citationStrings((basis.citations ?? []).filter(citation => citation?.targetKind === targetKind))]
    .filter(value => typeof value === "string" && value.trim()).map(comparable);
  return { material: material.map(comparable), own: passages };
}

// Dimensões que julgam o que o aluno lê exigem evidência do material do alvo;
// títulos sozinhos (identidade) não demonstram suficiência nem continuidade.
const CONTENT_JUDGMENT_DIMENSIONS = new Set(["alignment", "evidence", "representation", "feedback", "sufficiency"]);

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
    studentContent.push(...presentedOrderingLabels(content).map(value => ({
      component: content.response.package, text: value
    })));
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
  const feedbackTexts = [...feedback, ...authoredResponseFeedback(response).map(({ text }) => text)];
  const operationTexts = practices.map(practice => practice.invariantTaskOperation).filter(Boolean);
  const requiresExplanatoryFeedback = operationTexts.some(explanatoryOperation);
  const optionFeedback = (data.options ?? []).map(option => option.feedback).filter(value => typeof value === "string");
  const genericOptionFeedback = optionFeedback.some(genericFeedback);
  const onlyGenericFeedback = feedbackTexts.length > 0 && feedbackTexts.every(genericFeedback);
  if (response && requiresExplanatoryFeedback && onlyGenericFeedback) {
    add("pedagogical_feedback_non_explanatory", "feedback",
      "A operação declarada exige relação ou procedimento; um rótulo de acerto, erro ou tentativa não explica a resposta nem ajuda a superar o erro.");
  }
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
    targets, studentContent, feedback, operation: operationTexts,
    feedbackAssessment: { requiresExplanatoryFeedback, genericOptionFeedback, onlyGenericFeedback },
    // Retorno visível por estado da prática, distinguindo o texto autoral do
    // rótulo padrão do package. É o mesmo conteúdo que o renderer exibe. Só entra
    // quando há prática: a leitura humana da auditoria tem orçamento de página e a
    // unidade de teoria não tem retorno de resposta.
    ...(response ? { feedbackStates: responseFeedbackStates(response.package, data) } : {}),
    content: (content?.content ?? []).map(instance => text(instance, "content")).filter(Boolean),
    // Início efetivo do alvo: a abertura que o aluno lê primeiro, para confrontar
    // continuidade com o contexto que só existe na Explicação compartilhada.
    inicio: studentContent[0]?.text ?? "",
    apoios: supportLabels(content),
    apoiosDoHost: hostSupportLabels(content),
    operacaoExigeCalculo: [data.question ?? data.prompt ?? "", ...operationTexts]
      .some(value => calculationOperation(String(value ?? ""))),
    review: "Compare a operação realmente exigida e a resposta observável com cada requisito. studentContent já oculta as lacunas; verifique se outros trechos entregam a resposta e se os dados determinam o cálculo. answerAppearsInStudentText é um indício, não um defeito automático: julgue sua função no enunciado. Um rótulo correto não demonstra uma relação ou procedimento. Examine distratores cruzados, suficiência da explicação, variedade necessária e feedback específico. Contagem e schema não certificam suficiência. Cite fragmentos da base salva nas evidências."
  } };
}

function representationIssues(content, targetKind, targetId) {
  const target = `${targetKind === "study_unit" ? "Unidade" : "Explicação"} “${content?.title ?? ""}”`;
  return ["content", "feedback"].flatMap(slot => (content?.[slot] ?? []).flatMap((instance, index) => {
    if (instance.package !== "aralearn.resource.bpmn_process") return [];
    return inspectBpmnSemantics(instance.data).map(issue => ({ ...issue, targetKind, targetId,
      resourceId: instance.id, path: `${slot}[${index}].data.${issue.path}`,
      message: `${target}, ${slot === "feedback" ? "Feedback" : "Conteúdo"}, diagrama ${index + 1}: ${issue.message}` }));
  }));
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
  // Ordem efetiva do ensino neste foco: a continuidade é julgada contra a
  // sequência real, não contra a memória do produtor.
  const percurso = basis.studyUnits.map((unit, index) => ({ unitId: unit.id,
    position: Number.isSafeInteger(unit.content?.position) ? unit.content.position : index + 1,
    title: unit.content?.title ?? "", mode: unit.application?.mode ?? unit.content?.role ?? null }));
  // Inspect only the saved target/percurso. Dependencies and citations remain
  // context; legacy-compatible materialization keeps its separate checks above.
  const representations = [
    ...(basis.targetKind === "microsequence_explanation"
      ? representationIssues(basis.microsequence?.explanation, basis.targetKind, basis.targetId) : []),
    ...basis.studyUnits.filter(unit => basis.targetKind === "microsequence_explanation" || unit.id === basis.targetId)
      .flatMap(unit => representationIssues(unit.content, "study_unit", unit.id))
  ];
  return { basis, units, percurso, representationIssues: representations, instruction: "Faça uma segunda leitura crítica do percurso salvo. Compare objetivo, Explicação, operação exigida, evidência esperada, resposta efetivamente recolhida e feedback. Em application.practiceApplications, oportunidade é o texto autoral de cada caso; invariantTaskOperation é a operação-alvo do requisito; variedDimensions são dimensões variadas declaradas. Não confunda oportunidade com enunciado ou descrição do requisito. Julgue alinhamento, evidência, representação, feedback e suficiência; cite passagens reais. Examine a combinação das lacunas, os distratores e o conjunto de alternativas corretas. Procure atalhos óbvios, repetições mecânicas, explicação rasa ou quantidade artificialmente mínima. Em feedbackStates, cada estado traz o retorno e sua origem: author é texto declarado na decisão, com escopo e condição, e default é o rótulo do package. Julgue se o retorno do erro explica o erro plausível, sem repetir a Explicação inteira nem acrescentar títulos internos dispensáveis; a condição não afirma o que o estudante viu e texto presente não demonstra adequação. Uma alternativa ou lacuna não é insuficiente por contagem: demonstre qual relação necessária foi perdida. " +
    "Na inspeção da Explicação, evidence e feedback avaliam as práticas, respostas e retornos das unidades da microssequência presentes na base. Para configuration, confronte seus parâmetros aplicados com a realização nessas unidades. Julgue a aplicabilidade desses critérios por esse conjunto; conteúdo expositivo e referências bibliográficas não substituem esse confronto. " +
    "Em citations, confronte as ocorrências locais com as passagens das âncoras selecionadas, considerando a relação declarada em cada vínculo. A pertinência geral da obra não demonstra suporte a uma afirmação que o vínculo declara sustentar ou citar. Não cruze âncoras de fontes diferentes nem presuma pareamento por posição quando há várias ocorrências. Se a âncora só indicar uma página, confira a passagem no destino ou registre que falta verificação; fonte existente não é fonte ausente. Divergência ou suporte declarado mas não demonstrado devem constar no parecer e impedir declarar consistência. " +
    "Em configuration, confronte os parâmetros pedagógicos aplicados em design com sua realização observável no alvo e no percurso pertinente: formas de explicação, oportunidades, variação e posição da prática. Cite conteúdo/ordem e distinga valor aplicado de realização. Preferência automática é contextual: justifique sua realização ou limite sem forçar alternância, formatos ou prática extra. Fixações e condições de pesquisa devem ser preservadas. Divergência ou realização relevante não demonstrada exige insufficient; pode demandar reconciliar declaração, calibrar o automático com justificativa ou corrigir conteúdo, sem alterar fixações. not_applicable só cabe quando não há parâmetro pedagógico observável aplicável, nunca por falta de evidência; conversa e cadência fora do alvo não são critérios sobre seu conteúdo. Uma tentativa anterior à explicação pode investigar um alvo ainda não ensinado: examine pré-requisitos e ensino posterior, sem contá-la como ensino. Seis juízos registrados não certificam sua correção nem aprendizagem. " +
    "findings registra pendências: consistent exige []; observações positivas vão em summary ou checks.reason. needs_attention exige findings não vazio; insufficient exige needs_attention. " +
    "Cada dimensão sufficient precisa citar o material apresentado neste alvo — o texto que o aluno lê: conteúdo, pergunta, alternativas e retornos. Use um trecho distintivo e relevante do alvo: a citação comprova ancoragem textual, não suficiência nem pertinência, e o juízo semântico e a inspeção visual continuam necessários. Títulos de Unidade, nome/versão de pacote, metadados de componente, o plano e a Explicação compartilhada identificam ou declaram, mas não demonstram a apresentação; a Explicação tem alvo próprio. Distinga apoios declarados no conteúdo (apoios) dos que o Estudo oferece contextualmente (apoiosDoHost, como a calculadora): não afirme ausência de apoio só porque a autoria não declarou o recurso. Confronte apoios e operacaoExigeCalculo com a operação exigida: o apoio disponível não substitui o raciocínio-alvo. Use percurso para situar a Unidade na ordem real do ensino e não aceite suficiência que dependa só da Explicação compartilhada. " +
    "Confronte o início efetivo de cada Unidade (inicio) com o contexto que só existe na Explicação compartilhada, que já viaja na base compartilhada (basis.microsequence.explanation): quando a Unidade pressupõe definições ou relações que aparecem apenas lá e não as apresenta nem remete claramente à Explicação, julgue suficiência e continuidade pelo que falta. A existência dessas definições no material compartilhado não torna a Unidade suficiente; a remissão clara e verificável à Explicação é legítima. Julgue apenas o que a base mostra: módulos, partes ou Unidades declarados rascunho e vazios não contam como ensino produzido, e não afirme cobertura que a base não apresenta. " +
    "Insuficiência exige correção e nova inspeção; a gravação não certifica aprendizagem." };
}

export function requirePedagogicalAuditConsistency(report, basis) {
  if (!hasCurrentPedagogicalAudit(report.checks)) {
    throw Object.assign(new TypeError("Novos pareceres precisam avaliar também configuration: a realização observável da configuração aplicada."),
      { code: "pedagogical_audit_configuration_required" });
  }
  const audit = projectPedagogicalAudit(basis);
  const units = basis.targetKind === "study_unit" ? audit.units.filter(unit => unit.unitId === basis.targetId) : audit.units;
  if (report.outcome === "consistent" && audit.representationIssues.length) {
    throw Object.assign(new TypeError(`Há inconsistências BPMN no alvo inspecionado. ${audit.representationIssues[0].message} Consulte representationIssues na auditoria, registre as insuficiências e corrija antes de declarar consistência.`),
      { code: "pedagogical_audit_contradiction", issues: audit.representationIssues });
  }
  if (report.outcome === "consistent" && units.some(unit => unit.issues.length)) {
    throw Object.assign(new TypeError("Há contradições objetivas na prática. Registre as insuficiências e corrija antes de declarar consistência."),
      { code: "pedagogical_audit_contradiction", issues: units.flatMap(unit => unit.issues) });
  }
  if (report.outcome === "consistent" && basis.studyUnits.some(unit =>
      (basis.targetKind !== "study_unit" || unit.id === basis.targetId) && unit.application == null)) {
    throw Object.assign(new TypeError("A base de aplicação instrucional está ausente. Verifique ou reaplique as escolhas sobre o conteúdo atual antes de declarar consistência."),
      { code: "pedagogical_audit_unapplied_design" });
  }
  const hasPractice = basis.studyUnits.some(unit => (basis.targetKind !== "study_unit" || unit.id === basis.targetId) && unit.content?.response);
  if (report.checks.some(check => check.result === "not_applicable" &&
      (["alignment", "representation", "sufficiency"].includes(check.dimension) ||
        hasPractice && ["evidence", "feedback"].includes(check.dimension)))) {
    throw Object.assign(new TypeError("Alinhamento, representação e suficiência sempre precisam de julgamento; com prática, examine também evidência e feedback."),
      { code: "pedagogical_audit_not_applicable" });
  }
}

function strings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  return value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
}

export function normalizePedagogicalAudit(checks, basis = null, { allowLegacy = false } = {}) {
  const fail = message => { throw Object.assign(new TypeError(message), { code: "invalid_pedagogical_audit" }); };
  const dimensions = allowLegacy && checks?.length === LEGACY_PEDAGOGICAL_AUDIT_DIMENSIONS.length
    ? LEGACY_PEDAGOGICAL_AUDIT_DIMENSIONS : PEDAGOGICAL_AUDIT_DIMENSIONS;
  if (!Array.isArray(checks) || checks.length !== dimensions.length ||
      new Set(checks.map(check => check?.dimension)).size !== checks.length) {
    fail("A inspeção deve examinar alinhamento, evidência, representação, feedback, suficiência e realização da configuração.");
  }
  const passages = basis === null ? null : strings(basis).map(comparable);
  const scopes = basis === null ? null : pedagogicalAuditScopes(basis);
  const cites = (scope, check) => !scope.length ||
    check.evidence.some(quote => scope.some(passage => passage.includes(comparable(quote))));
  const citesOwnMaterial = check => !scopes ||
    cites(CONTENT_JUDGMENT_DIMENSIONS.has(check.dimension) && scopes.material.length
      ? scopes.material : scopes.own, check);
  return checks.map(check => {
    if (!check || typeof check !== "object" || Object.keys(check).sort().join() !== "dimension,evidence,reason,result" ||
        !dimensions.includes(check.dimension) || !["sufficient", "insufficient", "not_applicable"].includes(check.result) ||
        typeof check.reason !== "string" || !check.reason.trim() || [...check.reason].length > 1000 || controlText(check.reason) ||
        !Array.isArray(check.evidence) || check.evidence.length < 1 || check.evidence.length > 6 ||
        check.evidence.some(quote => typeof quote !== "string" || !quote.trim() || [...quote].length > 500 || controlText(quote))) {
      fail("Cada dimensão precisa de julgamento, justificativa e trechos observados na base salva.");
    }
    if (passages && check.evidence.some(quote => !passages.some(passage => passage.includes(comparable(quote))))) {
      fail(`A evidência de ${check.dimension} não foi encontrada na base inspecionada.`);
    }
    // Julgamento positivo precisa de apresentação observada: a declaração, o plano
    // e a Explicação compartilhada não substituem o material do próprio alvo.
    if (scopes && check.result === "sufficient" && !citesOwnMaterial(check)) {
      fail(`A evidência de ${check.dimension} precisa citar o material apresentado ao aluno neste alvo: o texto que ele lê (conteúdo, pergunta, alternativas, retornos). Títulos de Unidade, nome/versão de pacote, metadados de componente, o plano e a Explicação compartilhada não demonstram a apresentação, e a Explicação tem alvo próprio.`);
    }
    return structuredClone(check);
  });
}
