import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import { validateContractDocument } from "../../src/contract/validateContract.js";
import {
  generateMicrosequenceProjectDocument,
  generateStructureProjectDocument,
  resolveGenerationProviderRuntime
} from "../../src/generation/runtime/projectGenerationRuntime.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function uniqueList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => text(item)).filter(Boolean))];
}

function normalizeToken(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slugify(value) {
  return normalizeToken(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function writeJsonIfNeeded(filePath, payload) {
  if (!filePath) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function buildProgressTracker(progressPath = "") {
  const normalizedPath = text(progressPath);
  return ({ phase = "", provider = "", scenario = "", message = "", status = "running" } = {}) => {
    const payload = {
      status,
      phase: text(phase),
      provider: text(provider),
      scenario: text(scenario),
      message: text(message),
      updatedAt: nowIso()
    };
    if (normalizedPath) {
      writeJsonIfNeeded(normalizedPath, payload);
    }
    const parts = [payload.phase, payload.provider, payload.scenario, payload.message].filter(Boolean);
    if (parts.length) {
      console.error(`[progress] ${parts.join(" | ")}`);
    }
  };
}

function readScopeLabel(item) {
  if (typeof item === "string") {
    return text(item);
  }
  return text(item?.label || item);
}

function buildAssistConfig(modelId) {
  if (text(modelId).startsWith("codex")) {
    return {
      model: modelId,
      codexEndpoint: text(process.env.ARALEARN_CODEX_ASSIST_URL) || "http://127.0.0.1:4183/assist",
      codexToken: text(process.env.ARALEARN_CODEX_TOKEN)
    };
  }
  return {
    model: modelId,
    apiKey: text(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
  };
}

function isModelReady(modelId) {
  if (text(modelId).startsWith("codex")) {
    return Boolean(text(process.env.ARALEARN_CODEX_ASSIST_URL) || text(process.env.ARALEARN_CODEX_TOKEN));
  }
  return Boolean(text(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY));
}

function readJsonFileIfPresent(filePath = "") {
  const normalizedPath = text(filePath);
  if (!normalizedPath) {
    return null;
  }
  return JSON.parse(fs.readFileSync(normalizedPath, "utf8"));
}

function buildDefaultScenarioDefinition() {
  return {
    id: "arquitetura-pc-ir",
    label: "Arquitetura de Computadores - PC, IR e memória",
    topDownDraft: {
      courseInput: "Arquitetura de Computadores",
      moduleInput: "Ciclo basico de instrucao",
      lessonInput: "PC, IR e memoria no ciclo basico",
      includeTopics: [
        "contador de programa (PC)",
        "registrador de instrucoes (IR)",
        "busca, decodificacao e execucao no ciclo basico",
        "relacao minima entre CPU, memoria e registradores"
      ],
      excludeTopics: [
        "desvio especulativo",
        "pipeline superescalar",
        "cache",
        "predicao de salto"
      ],
      promptText: [
        "Planeje uma licao introdutoria de nivel de graduacao inicial.",
        "O curso deve ficar estritamente dentro do incluir e fora do excluir.",
        "A estrutura precisa dar contexto suficiente para bottom-up fraco gerar cards coerentes sem pressupostos extras.",
        "Use progressao clara, teoria simples e bastante treino pratico basico."
      ].join(" ")
    },
    bottomUp: {
      extend_current: {
        promptText: "Gere uma primeira versao muito didatica, simples e com bastante pratica basica, sem pressupor nada alem da trilha ja aberta.",
        attachmentText: "Use apenas o escopo top-down, recupere dependencias explicitadas e explique termos tecnicos no proprio card.",
        selectedDidacticTypeId: "explain"
      },
      create_support_branch: {
        promptText: "Crie uma microssequencia de apoio curta para sanar uma lacuna local antes da continuacao, e devolva o aluno a trilha principal."
      },
      repair_current: {
        promptText: "Reescreva a microssequencia porque a teoria precisa ficar ainda mais simples e os exercicios mais guiados, sem mudar de assunto."
      },
      generate_planned_next: {
        promptText: ""
      }
    }
  };
}

function normalizeScenarioDefinition(input = {}) {
  const fileScenario = readJsonFileIfPresent(input.scenarioFile);
  const inlineScenario = input.scenario && typeof input.scenario === "object" ? input.scenario : null;
  const baseScenario = fileScenario || inlineScenario || buildDefaultScenarioDefinition();
  return {
    id: text(baseScenario.id) || "custom-scenario",
    label: text(baseScenario.label) || text(baseScenario.id) || "Cenario customizado",
    topDownDraft: {
      courseInput: text(baseScenario?.topDownDraft?.courseInput),
      moduleInput: text(baseScenario?.topDownDraft?.moduleInput),
      lessonInput: text(baseScenario?.topDownDraft?.lessonInput),
      includeTopics: uniqueList(baseScenario?.topDownDraft?.includeTopics),
      excludeTopics: uniqueList(baseScenario?.topDownDraft?.excludeTopics),
      promptText: text(baseScenario?.topDownDraft?.promptText)
    },
    bottomUp: {
      extend_current: {
        promptText: text(baseScenario?.bottomUp?.extend_current?.promptText)
          || "Amplie a microssequencia atual com explicacao simples, exemplos locais e pratica abundante sem sair do assunto.",
        attachmentText: text(baseScenario?.bottomUp?.extend_current?.attachmentText),
        selectedDidacticTypeId: text(baseScenario?.bottomUp?.extend_current?.selectedDidacticTypeId) || "explain"
      },
      create_support_branch: {
        promptText: text(baseScenario?.bottomUp?.create_support_branch?.promptText)
          || "Crie apoio curto para lacuna local, marque retorno explicito e nao abra trilha paralela."
      },
      repair_current: {
        promptText: text(baseScenario?.bottomUp?.repair_current?.promptText)
          || "Reescreva a microssequencia com teoria mais simples, pratica mais guiada e sem mudar de assunto."
      },
      generate_planned_next: {
        promptText: text(baseScenario?.bottomUp?.generate_planned_next?.promptText)
      }
    }
  };
}

function findCourse(projectDocument, courseKey) {
  return (Array.isArray(projectDocument?.courses) ? projectDocument.courses : []).find((item) => item?.key === courseKey) || null;
}

function findModule(projectDocument, courseKey, moduleKey) {
  return (findCourse(projectDocument, courseKey)?.modules || []).find((item) => item?.key === moduleKey) || null;
}

function findLesson(projectDocument, courseKey, moduleKey, lessonKey) {
  return (findModule(projectDocument, courseKey, moduleKey)?.lessons || []).find((item) => item?.key === lessonKey) || null;
}

function findMicrosequence(projectDocument, selection) {
  return (
    findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey)?.microsequences || []
  ).find((item) => item?.key === selection.microsequenceKey) || null;
}

function listScopeLabels(moduleValue = {}, microsequence = {}) {
  const labelById = new Map(
    (Array.isArray(moduleValue?.include) ? moduleValue.include : [])
      .map((item) => [text(item?.id), readScopeLabel(item)])
      .filter(([id, label]) => id && label)
  );
  return uniqueList([
    ...(Array.isArray(microsequence?.scopeRefs) ? microsequence.scopeRefs.map((item) => labelById.get(text(item)) || "") : []),
    ...(Array.isArray(microsequence?.tags) ? microsequence.tags : [])
  ]);
}

function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isUsageLimitError(error) {
  const message = normalizeErrorMessage(error);
  return /usage limit|purchase more credits|try again at/i.test(message)
    || /quota exceeded|free[_-]?tier|rate[-\s]?limit/i.test(message);
}

function collectCardText(card = {}) {
  const lines = [];
  if (text(card?.title)) {
    lines.push(text(card.title));
  }
  if (text(card?.say)) {
    lines.push(text(card.say));
  }
  if (text(card?.code)) {
    lines.push(text(card.code));
  }
  if (Array.isArray(card?.table?.columns)) {
    lines.push(card.table.columns.map((item) => text(item)).filter(Boolean).join(" | "));
  }
  if (Array.isArray(card?.table?.rows)) {
    card.table.rows.forEach((row) => lines.push((Array.isArray(row) ? row : []).map((item) => text(item)).filter(Boolean).join(" | ")));
  }
  return lines.filter(Boolean).join("\n");
}

function collectMicrosequenceText(microsequence = {}) {
  const parts = [
    text(microsequence?.title),
    text(microsequence?.goal),
    text(microsequence?.description),
    text(microsequence?.didacticPurpose),
    text(microsequence?.supportReason),
    ...(Array.isArray(microsequence?.expectedEvidence) ? microsequence.expectedEvidence.map((item) => text(item)) : []),
    ...(Array.isArray(microsequence?.cards) ? microsequence.cards.map((card) => collectCardText(card)) : [])
  ];
  return parts.filter(Boolean).join("\n");
}

function includesForbiddenTerm(sourceText, forbiddenTerms = []) {
  const normalizedSource = normalizeToken(sourceText);
  return uniqueList(forbiddenTerms).some((term) => {
    const normalizedTerm = normalizeToken(term);
    return normalizedTerm && normalizedSource.includes(normalizedTerm);
  });
}

function countPracticeCards(cards = []) {
  const practiceRegex = /\[\[|complete|resolva|identifique|classifique|calcule|marque|pratique|preencha|corrija|qual e|qual eh|\?/i;
  return (Array.isArray(cards) ? cards : []).filter((card) => {
    const cardText = collectCardText(card);
    return Boolean(card?.code || card?.table || practiceRegex.test(cardText));
  }).length;
}

function listTheoryCards(cards = []) {
  return (Array.isArray(cards) ? cards : []).filter((card) => text(card?.say) && !card?.code && !card?.table);
}

function hasReturnSignal(textValue = "") {
  return /\b(volte|retome|siga|continue|agora siga|depois siga|retorne)\b/i.test(textValue);
}

function countTheoryCardsBeforeFirstPractice(cards = []) {
  const items = Array.isArray(cards) ? cards : [];
  const practiceRegex = /\[\[|complete|resolva|identifique|classifique|calcule|marque|pratique|preencha|corrija|qual e|qual eh|\?/i;
  let theoryCount = 0;
  for (const card of items) {
    const cardText = collectCardText(card);
    const isPractice = Boolean(card?.code || card?.table || practiceRegex.test(cardText));
    if (isPractice) {
      return theoryCount;
    }
    if (text(card?.say)) {
      theoryCount += 1;
    }
  }
  return theoryCount;
}

function hasPriorKnowledgeLeak(cards = []) {
  const source = (Array.isArray(cards) ? cards : []).map((card) => collectCardText(card)).join("\n");
  return /\b(como voce ja sabe|como vimos|ja explicado|retomando sem explicar|obviamente|como ja estudado)\b/i.test(source);
}

function hasOvercompressedCard(cards = []) {
  return (Array.isArray(cards) ? cards : []).some((card) => {
    const content = collectCardText(card);
    const lineBreaks = content.split(/\n+/).length;
    return content.length > 520 || lineBreaks >= 6;
  });
}

function dependencyAnchoringOk(baseProjectDocument, baseSelection, cards = []) {
  const lesson = findLesson(baseProjectDocument, baseSelection.courseKey, baseSelection.moduleKey, baseSelection.lessonKey);
  const current = findMicrosequence(baseProjectDocument, baseSelection);
  const dependencyKeys = uniqueList(current?.dependsOn);
  if (!dependencyKeys.length) {
    return true;
  }
  const dependencies = (Array.isArray(lesson?.microsequences) ? lesson.microsequences : [])
    .filter((item) => dependencyKeys.includes(text(item?.key)));
  const terms = uniqueList([
    ...dependencies.map((item) => text(item?.title)),
    ...dependencies.flatMap((item) => uniqueList(item?.tags))
  ]).map((item) => normalizeToken(item)).filter(Boolean);
  if (!terms.length) {
    return true;
  }
  const source = normalizeToken((Array.isArray(cards) ? cards : []).slice(0, 3).map((card) => collectCardText(card)).join(" "));
  return terms.some((term) => term && source.includes(term));
}

function makeFinding({
  scenario = "",
  severity = "medium",
  category = "content",
  fixArea = "prompt",
  finding = "",
  evidence = "",
  recommendation = ""
} = {}) {
  return {
    scenario,
    severity,
    category,
    fixArea,
    finding,
    evidence,
    recommendation
  };
}

function summarizeChecks(checks = []) {
  let score = 5;
  checks.filter((item) => item.ok === false).forEach((item) => {
    if (item.severity === "high") {
      score -= 1.25;
      return;
    }
    if (item.severity === "medium") {
      score -= 0.6;
      return;
    }
    score -= 0.25;
  });
  return Math.max(0, Math.min(5, Number(score.toFixed(2))));
}

function snapshotMicrosequence(moduleValue = {}, microsequence = {}) {
  return {
    key: text(microsequence?.key),
    title: text(microsequence?.title),
    goal: text(microsequence?.goal),
    description: text(microsequence?.description),
    type: text(microsequence?.type),
    status: text(microsequence?.status),
    included: microsequence?.included === true,
    scopeLabels: listScopeLabels(moduleValue, microsequence),
    coverageRole: text(microsequence?.coverageRole),
    didacticKind: text(microsequence?.didacticKind),
    practiceMode: text(microsequence?.practiceMode),
    representationNeed: text(microsequence?.representationNeed),
    dependencyPolicy: text(microsequence?.dependencyPolicy),
    expectedEvidence: uniqueList(microsequence?.expectedEvidence),
    dependsOn: uniqueList(microsequence?.dependsOn),
    cards: (Array.isArray(microsequence?.cards) ? microsequence.cards : []).map((card) => ({
      key: text(card?.key),
      title: text(card?.title),
      say: text(card?.say),
      hasCode: Boolean(card?.code),
      hasTable: Boolean(card?.table),
      preview: collectCardText(card).slice(0, 220)
    }))
  };
}

function evaluateTopDownResult({ projectDocument, scopeContract, selection }) {
  const moduleValue = findModule(projectDocument, selection.courseKey, selection.moduleKey);
  const lesson = findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey);
  const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
  const moduleLessons = Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : [];
  const moduleMicrosequences = moduleLessons.flatMap((item) => (Array.isArray(item?.microsequences) ? item.microsequences : []));
  const includeLabels = (Array.isArray(moduleValue?.include) ? moduleValue.include : []).map((item) => readScopeLabel(item)).filter(Boolean);
  const excludeLabels = (Array.isArray(moduleValue?.exclude) ? moduleValue.exclude : []).map((item) => readScopeLabel(item)).filter(Boolean);
  const coveredLabels = new Set(
    moduleMicrosequences.flatMap((item) => listScopeLabels(moduleValue, item).map((entry) => normalizeToken(entry)))
  );
  const metadataCount = microsequences.filter((item) =>
    text(item?.coverageRole)
    || text(item?.didacticKind)
    || text(item?.practiceMode)
    || (Array.isArray(item?.expectedEvidence) && item.expectedEvidence.length)
  ).length;
  const dependencyCount = microsequences.filter((item) => Array.isArray(item?.dependsOn) && item.dependsOn.length).length;
  const combinedTopDownText = moduleLessons
    .flatMap((moduleLesson) => [
      text(moduleLesson?.title),
      text(moduleLesson?.goal),
      text(moduleLesson?.sourceGuideStructured?.lessonGoal),
      text(moduleLesson?.sourceGuideStructured?.notationRules),
      ...(Array.isArray(moduleLesson?.microsequences) ? moduleLesson.microsequences.map((item) => collectMicrosequenceText(item)) : [])
    ])
    .filter(Boolean)
    .join("\n");

  const checks = [];
  const findings = [];

  const uncoveredLabels = includeLabels.filter((label) => !coveredLabels.has(normalizeToken(label)));
  checks.push({
    ok: uncoveredLabels.length === 0,
    severity: "high"
  });
  if (uncoveredLabels.length) {
    findings.push(
      makeFinding({
        scenario: "top_down",
        severity: "high",
        category: "scope",
        fixArea: "validator",
        finding: "O planejamento top-down deixou itens de include sem cobertura explicita.",
        evidence: uncoveredLabels.join(", "),
        recommendation: "Reforce cobertura obrigatoria de include e mantenha a checagem bloqueante."
      })
    );
  }

  const leakedTerms = excludeLabels.filter((label) => includesForbiddenTerm(combinedTopDownText, [label]));
  checks.push({
    ok: leakedTerms.length === 0,
    severity: "high"
  });
  if (leakedTerms.length) {
    findings.push(
      makeFinding({
        scenario: "top_down",
        severity: "high",
        category: "scope",
        fixArea: "prompt",
        finding: "O planejamento top-down mencionou topicos fora do escopo do modulo.",
        evidence: leakedTerms.join(", "),
        recommendation: "Torne mais explicita a proibicao de extrapolar o exclude no prompt e nas correcoes."
      })
    );
  }

  checks.push({
    ok: microsequences.length >= 3,
    severity: "medium"
  });
  if (microsequences.length < 3) {
    findings.push(
      makeFinding({
        scenario: "top_down",
        severity: "medium",
        category: "progression",
        fixArea: "prompt",
        finding: "A trilha ficou curta demais para dar contexto progressivo a modelos fracos.",
        evidence: `Microssequencias geradas: ${microsequences.length}.`,
        recommendation: "Peça uma progressao minima com abertura, consolidacao e pratica."
      })
    );
  }

  checks.push({
    ok: dependencyCount >= Math.min(1, Math.max(0, microsequences.length - 1)) || microsequences.length <= 2,
    severity: "medium"
  });
  if (!(dependencyCount >= Math.min(1, Math.max(0, microsequences.length - 1)) || microsequences.length <= 2)) {
    findings.push(
      makeFinding({
        scenario: "top_down",
        severity: "medium",
        category: "progression",
        fixArea: "prompt",
        finding: "A progressao entre microssequencias ficou pouco explicitada.",
        evidence: `Dependencias declaradas: ${dependencyCount}.`,
        recommendation: "Induza a LLM a declarar encadeamento entre etapas quando houver mais de duas microssequencias."
      })
    );
  }

  const metadataRatio = microsequences.length ? metadataCount / microsequences.length : 0;
  checks.push({
    ok: metadataRatio >= 0.5,
    severity: "medium"
  });
  if (metadataRatio < 0.5) {
    findings.push(
      makeFinding({
        scenario: "top_down",
        severity: "medium",
        category: "context",
        fixArea: "runtime_context",
        finding: "Poucas microssequencias carregam metadados didaticos suficientes para orientar o bottom-up.",
        evidence: `Cobertura de metadados: ${metadataCount}/${microsequences.length}.`,
        recommendation: "Propague e exija coverageRole, didacticKind, practiceMode ou expectedEvidence em mais etapas."
      })
    );
  }

  const practiceMicrosequences = microsequences.filter((item) => /practice|extend_practice|exam_apply|consolidate/i.test(text(item?.coverageRole)));
  checks.push({
    ok: practiceMicrosequences.length >= 1,
    severity: "medium"
  });
  if (!practiceMicrosequences.length) {
    findings.push(
      makeFinding({
        scenario: "top_down",
        severity: "medium",
        category: "practice",
        fixArea: "prompt",
        finding: "A trilha top-down nao reservou uma etapa claramente voltada a pratica.",
        evidence: "Nenhuma coverageRole de pratica foi encontrada.",
        recommendation: "Peca uma progressao com pratica explicita e treino basico abundante."
      })
    );
  }

  return {
    score: summarizeChecks(checks),
    findings,
    lessonSnapshot: {
      title: text(lesson?.title),
      goal: text(lesson?.goal || lesson?.description),
      include: includeLabels,
      exclude: excludeLabels,
      moduleCoverage: {
        coveredInclude: includeLabels.filter((label) => coveredLabels.has(normalizeToken(label))),
        uncoveredInclude: uncoveredLabels
      },
      microsequences: microsequences.map((item) => snapshotMicrosequence(moduleValue, item))
    }
  };
}

function evaluateBottomUpScenario({
  scenarioId,
  projectDocument,
  selection,
  baseProjectDocument,
  baseSelection
}) {
  const contract = validateContractDocument(projectDocument);
  const moduleValue = findModule(projectDocument, selection.courseKey, selection.moduleKey);
  const lesson = findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey);
  const microsequence = findMicrosequence(projectDocument, selection);
  const excludeLabels = (Array.isArray(moduleValue?.exclude) ? moduleValue.exclude : []).map((item) => readScopeLabel(item)).filter(Boolean);
  const cards = Array.isArray(microsequence?.cards) ? microsequence.cards : [];
  const cardText = cards.map((card) => collectCardText(card)).join("\n");
  const practiceCount = countPracticeCards(cards);
  const theoryCards = listTheoryCards(cards);
  const lastCardText = collectCardText(cards[cards.length - 1] || {});
  const checks = [];
  const findings = [];

  checks.push({
    ok: contract.ok,
    severity: "high"
  });
  if (!contract.ok) {
    findings.push(
      makeFinding({
        scenario: scenarioId,
        severity: "high",
        category: "contract",
        fixArea: "schema",
        finding: "A saida final da geracao nao passou no contrato publico.",
        evidence: contract.errors.slice(0, 4).map((item) => `${item.path}: ${item.message}`).join(" | "),
        recommendation: "Ajuste schema, normalizacao ou aplicacao do payload antes de persistir."
      })
    );
  }

  const minimumCardCount = {
    extend_current: 4,
    repair_current: 3,
    create_support_branch: 4,
    generate_planned_next: 4
  }[scenarioId] || 3;
  checks.push({
    ok: cards.length >= minimumCardCount,
    severity: "medium"
  });
  if (cards.length < minimumCardCount) {
    findings.push(
      makeFinding({
        scenario: scenarioId,
        severity: "medium",
        category: "progression",
        fixArea: "prompt",
        finding: "A microssequencia gerada ficou curta demais para cumprir a funcao didatica prevista.",
        evidence: `Cards: ${cards.length}; minimo esperado: ${minimumCardCount}.`,
        recommendation: "Peca quantidade minima de cards com abertura, treino e fechamento coerentes."
      })
    );
  }

  const minimumPractice = {
    extend_current: 2,
    repair_current: 1,
    create_support_branch: 1,
    generate_planned_next: 2
  }[scenarioId] || 1;
  checks.push({
    ok: practiceCount >= minimumPractice,
    severity: "medium"
  });
  if (practiceCount < minimumPractice) {
    findings.push(
      makeFinding({
        scenario: scenarioId,
        severity: "medium",
        category: "practice",
        fixArea: "prompt",
        finding: "Houve pouco treino pratico para a funcao da microssequencia.",
        evidence: `Cards praticos detectados: ${practiceCount}; minimo esperado: ${minimumPractice}.`,
        recommendation: "Reforce o plano para sempre incluir pratica basica suficiente."
      })
    );
  }

  const theoryBeforePractice = countTheoryCardsBeforeFirstPractice(cards);
  checks.push({
    ok: theoryBeforePractice >= 1,
    severity: "medium"
  });
  if (theoryBeforePractice < 1) {
    findings.push(
      makeFinding({
        scenario: scenarioId,
        severity: "medium",
        category: "clarity",
        fixArea: "prompt",
        finding: "A prática apareceu sem microteoria local suficiente antes dela.",
        evidence: "Nenhum card teórico claro apareceu antes da primeira prática.",
        recommendation: "Exija abertura teórica curta antes de cobrar ação do aluno."
      })
    );
  }

  const leakedTerms = excludeLabels.filter((label) => includesForbiddenTerm(`${collectMicrosequenceText(microsequence)}\n${cardText}`, [label]));
  checks.push({
    ok: leakedTerms.length === 0,
    severity: "high"
  });
  if (leakedTerms.length) {
    findings.push(
      makeFinding({
        scenario: scenarioId,
        severity: "high",
        category: "scope",
        fixArea: "runtime_context",
        finding: "O bottom-up puxou conteudo fora do escopo excluido pelo modulo.",
        evidence: leakedTerms.join(", "),
        recommendation: "Passe include/exclude com mais destaque e bloqueie termos proibidos nas correcoes."
      })
    );
  }

  checks.push({
    ok: !hasPriorKnowledgeLeak(cards),
    severity: "high"
  });
  if (hasPriorKnowledgeLeak(cards)) {
    findings.push(
      makeFinding({
        scenario: scenarioId,
        severity: "high",
        category: "context",
        fixArea: "prompt",
        finding: "Os cards pressupõem conhecimento prévio não explicitado no próprio fluxo local.",
        evidence: "Foram detectadas fórmulas de retomada que dependem de memória implícita do aluno.",
        recommendation: "Troque referências vagas por retomadas concretas dentro do próprio card."
      })
    );
  }

  checks.push({
    ok: !hasOvercompressedCard(cards),
    severity: "medium"
  });
  if (hasOvercompressedCard(cards)) {
    findings.push(
      makeFinding({
        scenario: scenarioId,
        severity: "medium",
        category: "clarity",
        fixArea: "prompt",
        finding: "Há card concentrando carga didática demais para uma etapa curta.",
        evidence: "Foi detectado card longo ou com blocos demais em uma única unidade.",
        recommendation: "Prefira decompor teoria, exemplo e prática em cards distintos."
      })
    );
  }

  const firstTheoryText = text(theoryCards[0]?.say);
  checks.push({
    ok: firstTheoryText.length > 0 && firstTheoryText.length <= 320,
    severity: "medium"
  });
  if (!(firstTheoryText.length > 0 && firstTheoryText.length <= 320)) {
    findings.push(
      makeFinding({
        scenario: scenarioId,
        severity: "medium",
        category: "clarity",
        fixArea: "prompt",
        finding: "A abertura teorica nao ficou simples o suficiente para estudo inicial.",
        evidence: firstTheoryText ? `Primeiro card teorico com ${firstTheoryText.length} caracteres.` : "Nao houve card teorico simples logo na abertura.",
        recommendation: "Peca teoria curta, vocabulario direto e explicacao sem pressupostos ocultos."
      })
    );
  }

  const shouldReturn = scenarioId === "create_support_branch";
  checks.push({
    ok: !shouldReturn || hasReturnSignal(lastCardText),
    severity: "medium"
  });
  if (shouldReturn && !hasReturnSignal(lastCardText)) {
    findings.push(
      makeFinding({
        scenario: scenarioId,
        severity: "medium",
        category: "return_to_track",
        fixArea: "prompt",
        finding: "A sequencia de suporte ou duvida local nao fecha retornando explicitamente a trilha principal.",
        evidence: lastCardText.slice(0, 180),
        recommendation: "Inclua fechamento que devolva o aluno ao fluxo planejado."
      })
    );
  }

  if (scenarioId === "extend_current" || scenarioId === "repair_current") {
    const baseLesson = findLesson(baseProjectDocument, baseSelection.courseKey, baseSelection.moduleKey, baseSelection.lessonKey);
    const currentLesson = findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey);
    checks.push({
      ok:
        text(selection?.microsequenceKey) === text(baseSelection?.microsequenceKey)
        && (Array.isArray(currentLesson?.microsequences) ? currentLesson.microsequences.length : 0)
          === (Array.isArray(baseLesson?.microsequences) ? baseLesson.microsequences.length : 0),
      severity: "high"
    });
    if (!(
      text(selection?.microsequenceKey) === text(baseSelection?.microsequenceKey)
      && (Array.isArray(currentLesson?.microsequences) ? currentLesson.microsequences.length : 0)
        === (Array.isArray(baseLesson?.microsequences) ? baseLesson.microsequences.length : 0)
    )) {
      findings.push(
        makeFinding({
          scenario: scenarioId,
          severity: "high",
          category: "progression",
          fixArea: "runtime_context",
          finding: "A intervenção local alterou a trilha quando deveria permanecer na microssequência atual.",
          evidence: JSON.stringify({
            baseMicrosequenceKey: text(baseSelection?.microsequenceKey),
            targetMicrosequenceKey: text(selection?.microsequenceKey),
            baseCount: Array.isArray(baseLesson?.microsequences) ? baseLesson.microsequences.length : 0,
            currentCount: Array.isArray(currentLesson?.microsequences) ? currentLesson.microsequences.length : 0
          }),
          recommendation: "Mantenha repair_current e extend_current estritamente dentro da microssequência atual."
        })
      );
    }

    checks.push({
      ok: dependencyAnchoringOk(baseProjectDocument, baseSelection, cards),
      severity: "medium"
    });
    if (!dependencyAnchoringOk(baseProjectDocument, baseSelection, cards)) {
      findings.push(
        makeFinding({
          scenario: scenarioId,
          severity: "medium",
          category: "context",
          fixArea: "runtime_context",
          finding: "A intervenção local não retomou de forma concreta a dependência já estudada da trilha.",
          evidence: "Os primeiros cards não ancoram explicitamente a base declarada em dependsOn/tags.",
          recommendation: "Use a dependência declarada como ponto de partida local antes de aprofundar."
        })
      );
    }
  }

  if (scenarioId === "create_support_branch") {
    const baseLesson = findLesson(baseProjectDocument, baseSelection.courseKey, baseSelection.moduleKey, baseSelection.lessonKey);
    const currentIndex = (baseLesson?.microsequences || []).findIndex((item) => item?.key === baseSelection.microsequenceKey);
    const lessonMicrosequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
    const supportIndex = lessonMicrosequences.findIndex((item) => item?.key === selection.microsequenceKey);
    const insertedAfterCurrent = supportIndex === currentIndex + 1;
    const supportTypeOk = text(microsequence?.type) === "support";
    checks.push({
      ok:
        insertedAfterCurrent
        && supportTypeOk
        && text(microsequence?.parentMicrosequenceKey) === text(baseSelection.microsequenceKey)
        && text(microsequence?.returnToMicrosequenceKey) === text(baseSelection.microsequenceKey)
        && text(microsequence?.branchPolicy) === "must_return_to_planned_track"
        && !!text(microsequence?.supportReason),
      severity: "high"
    });
    if (!(
      insertedAfterCurrent
      && supportTypeOk
      && text(microsequence?.parentMicrosequenceKey) === text(baseSelection.microsequenceKey)
      && text(microsequence?.returnToMicrosequenceKey) === text(baseSelection.microsequenceKey)
      && text(microsequence?.branchPolicy) === "must_return_to_planned_track"
      && !!text(microsequence?.supportReason)
    )) {
      findings.push(
        makeFinding({
          scenario: scenarioId,
          severity: "high",
          category: "progression",
          fixArea: "runtime_context",
          finding: "A microssequencia de suporte nao ficou marcada e encaixada corretamente na trilha.",
          evidence: JSON.stringify({
            insertedAfterCurrent,
            type: text(microsequence?.type),
            parentMicrosequenceKey: text(microsequence?.parentMicrosequenceKey),
            returnToMicrosequenceKey: text(microsequence?.returnToMicrosequenceKey),
            branchPolicy: text(microsequence?.branchPolicy),
            supportReason: text(microsequence?.supportReason)
          }),
          recommendation: "Persista metadata de suporte e preserve a ordem local da trilha."
        })
      );
    }
  }

  if (scenarioId === "generate_planned_next") {
    const baseLesson = findLesson(baseProjectDocument, baseSelection.courseKey, baseSelection.moduleKey, baseSelection.lessonKey);
    const baseMicrosequences = Array.isArray(baseLesson?.microsequences) ? baseLesson.microsequences : [];
    const baseIndex = baseMicrosequences.findIndex((item) => item?.key === baseSelection?.microsequenceKey);
    const expectedNext = baseIndex >= 0
      ? baseMicrosequences.slice(baseIndex + 1).find((item) => text(item?.type || "main") === "main")
      : null;
    checks.push({
      ok:
        !!expectedNext
        && text(selection?.microsequenceKey) === text(expectedNext?.key)
        && (Array.isArray(lesson?.microsequences) ? lesson.microsequences.length : 0) === baseMicrosequences.length,
      severity: "high"
    });
    if (!(
      !!expectedNext
      && text(selection?.microsequenceKey) === text(expectedNext?.key)
      && (Array.isArray(lesson?.microsequences) ? lesson.microsequences.length : 0) === baseMicrosequences.length
    )) {
      findings.push(
        makeFinding({
          scenario: scenarioId,
          severity: "high",
          category: "progression",
          fixArea: "runtime_context",
          finding: "O avanço planejado não preencheu a próxima microssequência já prevista pelo top-down.",
          evidence: JSON.stringify({
            expectedNextKey: text(expectedNext?.key),
            targetMicrosequenceKey: text(selection?.microsequenceKey),
            baseCount: baseMicrosequences.length,
            currentCount: Array.isArray(lesson?.microsequences) ? lesson.microsequences.length : 0
          }),
          recommendation: "Use a próxima microssequência principal planejada em vez de criar uma nova etapa."
        })
      );
    }
  }

  return {
    score: summarizeChecks(checks),
    findings,
    microsequenceSnapshot: snapshotMicrosequence(moduleValue, microsequence),
    contract: {
      ok: contract.ok,
      errorCount: Array.isArray(contract.errors) ? contract.errors.length : 0,
      errors: Array.isArray(contract.errors) ? contract.errors.slice(0, 6) : []
    }
  };
}

function buildJudgeSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["acceptable", "overallScore", "summary", "categoryScores", "blockingFindings", "strengths", "recommendedFixAreas"],
    properties: {
      acceptable: { type: "boolean" },
      overallScore: { type: "number" },
      summary: { type: "string" },
      categoryScores: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "score", "rationale"],
          properties: {
            category: {
              type: "string",
              enum: [
                "scope_discipline",
                "context_for_weak_llm",
                "didactic_progression",
                "theory_clarity",
                "practice_density",
                "return_to_track"
              ]
            },
            score: { type: "number" },
            rationale: { type: "string" }
          }
        }
      },
      blockingFindings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["scenario", "severity", "category", "fixArea", "finding", "evidence", "recommendation"],
          properties: {
            scenario: { type: "string" },
            severity: { type: "string", enum: ["high", "medium"] },
            category: {
              type: "string",
              enum: ["scope", "context", "progression", "clarity", "practice", "return_to_track", "contract"]
            },
            fixArea: {
              type: "string",
              enum: ["prompt", "runtime_context", "validator", "schema", "provider_adapter", "tests"]
            },
            finding: { type: "string" },
            evidence: { type: "string" },
            recommendation: { type: "string" }
          }
        }
      },
      strengths: { type: "array", items: { type: "string" } },
      recommendedFixAreas: {
        type: "array",
        items: {
          type: "string",
          enum: ["prompt", "runtime_context", "validator", "schema", "provider_adapter", "tests"]
        }
      }
    }
  };
}

async function runJudge({ judgeModelId, report }) {
  if (!text(judgeModelId) || !isModelReady(judgeModelId)) {
    return {
      skipped: true,
      reason: "Judge indisponivel."
    };
  }

  const judgeRuntime = resolveGenerationProviderRuntime(buildAssistConfig(judgeModelId));
  const promptPayload = {
    scope: report.scopeSummary,
    topDown: report.topDown?.deterministic?.lessonSnapshot || {},
    scenarios: Object.fromEntries(
      Object.entries(report.scenarios || {}).map(([scenarioId, scenario]) => [
        scenarioId,
        {
          interactionFeedback: scenario?.interactionFeedback || {},
          microsequence: scenario?.deterministic?.microsequenceSnapshot || {}
        }
      ])
    )
  };
  const prompt = [
    "Avalie a calibragem do AraLearn com foco em forma e conteudo.",
    "Seja estrito, mas considere as limitacoes normais de modelos por API sem raciocinio profundo.",
    "O curso deve ficar rigorosamente dentro de include/exclude, sustentar bottom-up fraco com contexto suficiente, manter progressao top-down, teoria simples e bastante treino pratico basico.",
    "Quando houver duvida local ou suporte, a resposta deve voltar explicitamente a trilha principal.",
    "Considere apenas os artefatos abaixo.",
    "",
    JSON.stringify(promptPayload, null, 2)
  ].join("\n");

  return judgeRuntime.provider.generateStructured({
    ...judgeRuntime.providerOptions,
    modelId: judgeRuntime.modelId,
    mode: "calibration-judge",
    system: "Responda somente JSON valido. Julgue a qualidade didatica e de contrato do material.",
    prompt,
    schema: buildJudgeSchema(),
    temperature: 0.1
  });
}

async function main() {
  const input = JSON.parse(process.argv[2] || "{}");
  const targetModelId = text(input.targetModelId) || "gemini-2.5-flash";
  const judgeModelId = text(input.judgeModelId);
  const skipJudge = input.skipJudge === true;
  const reportDir = text(input.reportDir);
  const updateProgress = buildProgressTracker(input.progressPath);
  const providerDir = reportDir ? path.join(reportDir, slugify(targetModelId) || "provider") : "";
  const scenarioDefinition = normalizeScenarioDefinition(input);
  if (providerDir) {
    fs.mkdirSync(providerDir, { recursive: true });
  }
  updateProgress({
    phase: "startup",
    provider: targetModelId,
    message: "Inicializando runner real."
  });

  const topDownDraft = scenarioDefinition.topDownDraft;

  const runtimeReport = {
    providerModelId: targetModelId,
    judgeModelId,
    scenarioId: scenarioDefinition.id,
    scenarioLabel: scenarioDefinition.label,
    scopeSummary: {
      course: topDownDraft.courseInput,
      module: topDownDraft.moduleInput,
      lesson: topDownDraft.lessonInput,
      include: topDownDraft.includeTopics,
      exclude: topDownDraft.excludeTopics
    },
    topDown: null,
    scenarios: {},
    judge: {
      skipped: true,
      reason: "Judge ainda nao executado."
    },
    overall: {
      acceptable: false,
      deterministicScore: 0,
      judgeScore: null,
      finalScore: 0,
      blockingFindings: []
    }
  };

  try {
    updateProgress({
      phase: "top_down",
      provider: targetModelId,
      message: "Executando geração top-down."
    });
    const topDown = await generateStructureProjectDocument({
      draft: topDownDraft,
      scopeState: {},
      projectDocument: createEmptyProjectDocument(),
      assistConfig: buildAssistConfig(targetModelId),
      ingestAttachments: async () => ({ attachments: [], warnings: [], extractedCount: 0 })
    });
    writeJsonIfNeeded(path.join(providerDir, "top-down.project.json"), topDown.projectDocument);
    writeJsonIfNeeded(path.join(providerDir, "top-down.scope-contract.json"), topDown.scopeContract);
    writeJsonIfNeeded(path.join(providerDir, "top-down.planned-course.json"), topDown.plannedCourse);

    const targetSelection = {
      courseKey: topDown.patch.target.courseKey,
      moduleKey: topDown.patch.target.moduleKey,
      lessonKey: topDown.patch.target.lessonKey
    };
    const lesson = findLesson(topDown.projectDocument, targetSelection.courseKey, targetSelection.moduleKey, targetSelection.lessonKey);
    const chosenMicrosequence = Array.isArray(lesson?.microsequences) && lesson.microsequences.length > 1
      ? lesson.microsequences[1]
      : lesson?.microsequences?.[0];
    if (!chosenMicrosequence) {
      throw new Error("Top-down nao gerou microssequencia utilizavel.");
    }
    const selection = {
      ...targetSelection,
      microsequenceKey: chosenMicrosequence.key
    };

    runtimeReport.topDown = {
      selection,
      deterministic: evaluateTopDownResult({
        projectDocument: topDown.projectDocument,
        scopeContract: topDown.scopeContract,
        selection
      })
    };

    const dependencyTitles = (Array.isArray(lesson?.microsequences) ? lesson.microsequences : [])
      .filter((item) => item?.key !== chosenMicrosequence.key)
      .slice(0, 2)
      .map((item) => text(item?.title))
      .filter(Boolean);

    const scenarioInputs = [
      {
        id: "extend_current",
        baseProjectDocument: topDown.projectDocument,
        baseSelection: selection,
        run: () =>
          generateMicrosequenceProjectDocument({
            selection,
            draft: {
              promptText: scenarioDefinition.bottomUp.extend_current.promptText,
              operationMode: "reinforce",
              interventionTargetMode: "current",
              attachments: [{ name: "roteiro-local.md" }]
            },
            assistConfig: buildAssistConfig(targetModelId),
            projectDocument: clone(topDown.projectDocument),
            dependencyTitles,
            selectedDidacticTypeId: scenarioDefinition.bottomUp.extend_current.selectedDidacticTypeId,
            // Nao force conteiner; apenas sugerencias devem vir do draft/cardPlan.
            preferredContainerLabel: "",
            ingestAttachments: async (attachments) => ({
              attachments: attachments.map((item) => ({
                ...item,
                contentText: scenarioDefinition.bottomUp.extend_current.attachmentText
              })),
              extractedCount: text(scenarioDefinition.bottomUp.extend_current.attachmentText) ? 1 : 0,
              warnings: []
            })
          })
      },
      {
        id: "create_support_branch",
        baseProjectDocument: topDown.projectDocument,
        baseSelection: selection,
        run: () =>
          generateMicrosequenceProjectDocument({
            selection,
            draft: {
              promptText: scenarioDefinition.bottomUp.create_support_branch.promptText,
              operationMode: "reinforce",
              interventionTargetMode: "new_after_current"
            },
            assistConfig: buildAssistConfig(targetModelId),
            projectDocument: clone(topDown.projectDocument),
            ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
          })
      },
      {
        id: "generate_planned_next",
        dependsOn: "extend_current",
        baseProjectDocument: topDown.projectDocument,
        baseSelection: selection,
        run: (baseScenario) =>
          generateMicrosequenceProjectDocument({
            selection: baseScenario?.target || selection,
            draft: {
              promptText: scenarioDefinition.bottomUp.generate_planned_next.promptText,
              actionIntent: "next_planned",
              operationMode: "reinforce",
              interventionTargetMode: "current"
            },
            assistConfig: buildAssistConfig(targetModelId),
            projectDocument: clone(baseScenario?.projectDocument || topDown.projectDocument),
            ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
          })
      },
      {
        id: "repair_current",
        dependsOn: "extend_current",
        run: (baseScenario) =>
          generateMicrosequenceProjectDocument({
            selection: baseScenario.target,
            draft: {
              promptText: scenarioDefinition.bottomUp.repair_current.promptText,
              operationMode: "repair",
              interventionTargetMode: "current"
            },
            assistConfig: buildAssistConfig(targetModelId),
            projectDocument: clone(baseScenario.projectDocument),
            ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
          })
      }
    ];

    const executedScenarios = {};
    let quotaExhausted = false;
    for (const scenarioInput of scenarioInputs) {
      updateProgress({
        phase: "bottom_up",
        provider: targetModelId,
        scenario: scenarioInput.id,
        message: "Executando cenário bottom-up."
      });
      const dependencyId = text(scenarioInput.dependsOn);
      const baseScenario = dependencyId ? executedScenarios[dependencyId] : null;
      if (dependencyId && !baseScenario) {
        runtimeReport.scenarios[scenarioInput.id] = {
          error: `Cenário não executado porque depende de "${dependencyId}" que falhou.`,
          deterministic: {
            score: 0,
            findings: [
              makeFinding({
                scenario: scenarioInput.id,
                severity: "high",
                category: "contract",
                fixArea: "prompt",
                finding: "Cenário pulado por falha em dependência anterior.",
                evidence: `dependsOn=${dependencyId}`,
                recommendation: "Corrija o cenário base (ou relaxe a validação) antes de avaliar cenários dependentes."
              })
            ]
          }
        };
        continue;
      }
      try {
        const result = await scenarioInput.run(baseScenario);
        writeJsonIfNeeded(path.join(providerDir, `${scenarioInput.id}.project.json`), result.projectDocument);
        const deterministic = evaluateBottomUpScenario({
          scenarioId: scenarioInput.id,
          projectDocument: result.projectDocument,
          selection: result.target,
          baseProjectDocument: clone(scenarioInput.baseProjectDocument || baseScenario?.projectDocument || topDown.projectDocument),
          baseSelection: clone(scenarioInput.baseSelection || baseScenario?.target || selection)
        });
        executedScenarios[scenarioInput.id] = {
          projectDocument: result.projectDocument,
          target: result.target,
          interactionFeedback: result.interventionFeedback,
          deterministic
        };
        runtimeReport.scenarios[scenarioInput.id] = {
          target: result.target,
          interactionFeedback: result.interventionFeedback,
          deterministic
        };
      } catch (error) {
        if (isUsageLimitError(error)) {
          quotaExhausted = true;
          runtimeReport.availability = "quota_exhausted";
          runtimeReport.note = normalizeErrorMessage(error);
          updateProgress({
            phase: "bottom_up",
            provider: targetModelId,
            scenario: scenarioInput.id,
            message: "Provider indisponível por cota.",
            status: "quota_exhausted"
          });
          break;
        }
        const message = normalizeErrorMessage(error);
        runtimeReport.scenarios[scenarioInput.id] = {
          error: message,
          deterministic: {
            score: 0,
            findings: [
              makeFinding({
                scenario: scenarioInput.id,
                severity: "high",
                category: "contract",
                fixArea: "prompt",
                finding: "Cenário falhou na validação local (contrato/didática).",
                evidence: message.slice(0, 260),
                recommendation: "Ajuste prompt/políticas de bottom-up para passar na validação mantendo o contrato mínimo."
              })
            ]
          }
        };
      }
    }

    if (skipJudge) {
      runtimeReport.judge = {
        skipped: true,
        reason: "Judge desabilitado nesta execução."
      };
    } else {
      updateProgress({
        phase: "judge",
        provider: targetModelId,
        message: "Executando juiz e agregação final."
      });
      const judge = await runJudge({
        judgeModelId,
        report: runtimeReport
      }).catch((error) => {
        if (isUsageLimitError(error)) {
          return {
            skipped: true,
            reason: "Judge indisponivel por cota do Codex local."
          };
        }
        return {
          skipped: false,
          ok: false,
          error: normalizeErrorMessage(error)
        };
      });
      runtimeReport.judge = judge;
    }

    const deterministicScores = [
      runtimeReport.topDown?.deterministic?.score || 0,
      ...Object.values(runtimeReport.scenarios).map((item) => item?.deterministic?.score || 0)
    ];
    const deterministicScore = deterministicScores.length
      ? Number((deterministicScores.reduce((sum, value) => sum + value, 0) / deterministicScores.length).toFixed(2))
      : 0;
    const deterministicFindings = [
      ...(runtimeReport.topDown?.deterministic?.findings || []),
      ...Object.values(runtimeReport.scenarios).flatMap((item) => item?.deterministic?.findings || [])
    ];
    const judgeReport = runtimeReport.judge || {};
    const judgeFindings = Array.isArray(judgeReport?.blockingFindings) ? judgeReport.blockingFindings : [];
    const judgeScore = Number.isFinite(Number(judgeReport?.overallScore)) ? Number(Number(judgeReport.overallScore).toFixed(2)) : null;
    const finalScore = judgeScore === null ? deterministicScore : Number(((deterministicScore + judgeScore) / 2).toFixed(2));
    const blockingFindings = [...deterministicFindings.filter((item) => item.severity === "high"), ...judgeFindings];

    runtimeReport.overall = {
      acceptable:
        !quotaExhausted
        && deterministicScore >= 3.8
        && blockingFindings.length === 0
        && (judgeScore === null || judgeReport.acceptable === true),
      deterministicScore,
      judgeScore,
      finalScore,
      blockingFindings
    };
  } catch (error) {
    if (isUsageLimitError(error)) {
      runtimeReport.availability = "quota_exhausted";
      runtimeReport.note = normalizeErrorMessage(error);
    } else {
      runtimeReport.error = normalizeErrorMessage(error);
    }
  }

  writeJsonIfNeeded(path.join(providerDir, "provider-report.json"), runtimeReport);
  updateProgress({
    phase: "completed",
    provider: targetModelId,
    message: runtimeReport.error
      ? "Runner concluído com erro."
      : runtimeReport.availability === "quota_exhausted"
        ? "Runner interrompido por cota."
        : "Runner concluído.",
    status: runtimeReport.error
      ? "failed"
      : runtimeReport.availability === "quota_exhausted"
        ? "quota_exhausted"
        : "completed"
  });
  console.log(JSON.stringify(runtimeReport, null, 2));
}

await main();
