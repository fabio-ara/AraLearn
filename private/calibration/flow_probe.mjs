import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { validateContractDocument } from "../../src/contract/validateContract.js";
import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function writeJsonIfNeeded(filePath, payload) {
  if (!text(filePath)) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function isUsageLimitError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /usage limit|purchase more credits|try again at|quota exceeded|free[_-]?tier|rate[-\s]?limit/i.test(message);
}

function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function readScopeLabel(item) {
  if (typeof item === "string") {
    return text(item);
  }
  return text(item?.label || item);
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
  return [
    text(microsequence?.title),
    text(microsequence?.goal),
    text(microsequence?.description),
    text(microsequence?.didacticPurpose),
    text(microsequence?.supportReason),
    ...(Array.isArray(microsequence?.cards) ? microsequence.cards.map((card) => collectCardText(card)) : [])
  ].filter(Boolean).join("\n");
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

function hasReturnSignal(textValue = "") {
  return /\b(volte|retome|siga|continue|agora siga|depois siga|retorne)\b/i.test(textValue);
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

function snapshotMicrosequence(moduleValue = {}, microsequence = {}) {
  return {
    key: text(microsequence?.key),
    title: text(microsequence?.title),
    goal: text(microsequence?.goal),
    type: text(microsequence?.type),
    status: text(microsequence?.status),
    included: microsequence?.included === true,
    scopeLabels: listScopeLabels(moduleValue, microsequence),
    dependsOn: uniqueList(microsequence?.dependsOn),
    parentMicrosequenceKey: text(microsequence?.parentMicrosequenceKey),
    returnToMicrosequenceKey: text(microsequence?.returnToMicrosequenceKey),
    supportReason: text(microsequence?.supportReason),
    branchPolicy: text(microsequence?.branchPolicy),
    cardCount: Array.isArray(microsequence?.cards) ? microsequence.cards.length : 0
  };
}

function evaluateTopDownResult({ projectDocument, selection }) {
  const moduleValue = findModule(projectDocument, selection.courseKey, selection.moduleKey);
  const lesson = findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey);
  const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
  const includeLabels = (Array.isArray(moduleValue?.include) ? moduleValue.include : []).map((item) => readScopeLabel(item)).filter(Boolean);
  const excludeLabels = (Array.isArray(moduleValue?.exclude) ? moduleValue.exclude : []).map((item) => readScopeLabel(item)).filter(Boolean);
  const coveredLabels = new Set(
    microsequences.flatMap((item) => listScopeLabels(moduleValue, item).map((entry) => normalizeToken(entry)))
  );
  const combinedText = [
    text(lesson?.title),
    text(lesson?.goal),
    text(lesson?.sourceGuideStructured?.lessonGoal),
    text(lesson?.sourceGuideStructured?.notationRules),
    text(lesson?.sourceGuideStructured?.commonErrors),
    ...microsequences.map((item) => collectMicrosequenceText(item))
  ].filter(Boolean).join("\n");
  const uncoveredLabels = includeLabels.filter((label) => !coveredLabels.has(normalizeToken(label)));
  const leakedTerms = excludeLabels.filter((label) => includesForbiddenTerm(combinedText, [label]));
  const dependencyCount = microsequences.filter((item) => Array.isArray(item?.dependsOn) && item.dependsOn.length).length;
  const hasGuide = Boolean(
    text(lesson?.sourceGuideStructured?.lessonGoal)
    && text(lesson?.sourceGuideStructured?.notationRules)
    && text(lesson?.sourceGuideStructured?.commonErrors)
    && text(lesson?.sourceGuideStructured?.outOfScopeRules)
  );
  const generatedCardsCount = microsequences
    .filter((item) => text(item?.status) === "draft" || item?.included !== true)
    .reduce((sum, item) => sum + (Array.isArray(item?.cards) ? item.cards.length : 0), 0);
  const checks = [
    { ok: uncoveredLabels.length === 0, severity: "high" },
    { ok: leakedTerms.length === 0, severity: "high" },
    { ok: microsequences.length >= 3, severity: "medium" },
    { ok: dependencyCount >= 1, severity: "medium" },
    { ok: hasGuide, severity: "high" },
    { ok: generatedCardsCount === 0, severity: "high" }
  ];
  const findings = [];

  if (uncoveredLabels.length) {
    findings.push({
      scenario: "top_down",
      severity: "high",
      category: "scope",
      fixArea: "validator",
      finding: "O top-down deixou itens de include sem cobertura explícita.",
      evidence: uncoveredLabels.join(", "),
      expected: { coveredInclude: includeLabels },
      received: { coveredInclude: includeLabels.filter((label) => coveredLabels.has(normalizeToken(label))) }
    });
  }
  if (leakedTerms.length) {
    findings.push({
      scenario: "top_down",
      severity: "high",
      category: "scope",
      fixArea: "prompt",
      finding: "O top-down contaminou a trilha com assunto excluído.",
      evidence: leakedTerms.join(", "),
      expected: { excludeMentioned: [] },
      received: { excludeMentioned: leakedTerms }
    });
  }
  if (!hasGuide) {
    findings.push({
      scenario: "top_down",
      severity: "high",
      category: "context",
      fixArea: "runtime_context",
      finding: "A lição saiu sem fonte-guia mínima completa.",
      evidence: JSON.stringify(lesson?.sourceGuideStructured || {}),
      expected: {
        lessonGoal: true,
        notationRules: true,
        commonErrors: true,
        outOfScopeRules: true
      },
      received: lesson?.sourceGuideStructured || {}
    });
  }
  if (generatedCardsCount > 0) {
    findings.push({
      scenario: "top_down",
      severity: "high",
      category: "contract",
      fixArea: "runtime_context",
      finding: "O top-down gerou cards, o que é proibido nessa fase.",
      evidence: "Há cards persistidos em microssequências replanejadas ainda em draft.",
      expected: { generatedCards: 0 },
      received: { generatedCards: generatedCardsCount }
    });
  }

  return {
    score: summarizeChecks(checks),
    findings,
    lessonSnapshot: {
      title: text(lesson?.title),
      goal: text(lesson?.goal),
      microsequences: microsequences.map((item) => snapshotMicrosequence(moduleValue, item))
    }
  };
}

function evaluateBottomUpScenario({ scenarioId, projectDocument, selection, baseProjectDocument, baseSelection }) {
  const contract = validateContractDocument(projectDocument);
  const moduleValue = findModule(projectDocument, selection.courseKey, selection.moduleKey);
  const lesson = findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey);
  const microsequence = findMicrosequence(projectDocument, selection);
  const baseLesson = findLesson(baseProjectDocument, baseSelection.courseKey, baseSelection.moduleKey, baseSelection.lessonKey);
  const cards = Array.isArray(microsequence?.cards) ? microsequence.cards : [];
  const practiceCount = countPracticeCards(cards);
  const combinedText = `${collectMicrosequenceText(microsequence)}\n${cards.map((card) => collectCardText(card)).join("\n")}`;
  const excludeLabels = (Array.isArray(moduleValue?.exclude) ? moduleValue.exclude : []).map((item) => readScopeLabel(item)).filter(Boolean);
  const leakedTerms = excludeLabels.filter((label) => includesForbiddenTerm(combinedText, [label]));
  const lastCardText = collectCardText(cards[cards.length - 1] || {});
  const checks = [
    { ok: contract.ok, severity: "high" },
    { ok: leakedTerms.length === 0, severity: "high" }
  ];
  const findings = [];

  if (!contract.ok) {
    findings.push({
      scenario: scenarioId,
      severity: "high",
      category: "contract",
      fixArea: "schema",
      finding: "A saída final não passou no contrato público.",
      evidence: (contract.errors || []).slice(0, 4).map((item) => `${item.path}: ${item.message}`).join(" | "),
      expected: { contractOk: true },
      received: { contractOk: false, errors: (contract.errors || []).slice(0, 4) }
    });
  }

  if (leakedTerms.length) {
    findings.push({
      scenario: scenarioId,
      severity: "high",
      category: "scope",
      fixArea: "runtime_context",
      finding: "O bottom-up puxou conteúdo fora do escopo excluído.",
      evidence: leakedTerms.join(", "),
      expected: { excludeMentioned: [] },
      received: { excludeMentioned: leakedTerms }
    });
  }

  if (scenarioId === "generate_planned_next") {
    const baseMicrosequences = Array.isArray(baseLesson?.microsequences) ? baseLesson.microsequences : [];
    const baseIndex = baseMicrosequences.findIndex((item) => item?.key === baseSelection?.microsequenceKey);
    const expectedNext = baseIndex >= 0
      ? baseMicrosequences.slice(baseIndex + 1).find((item) => text(item?.type || "main") === "main")
      : null;
    const ok =
      !!expectedNext
      && text(selection?.microsequenceKey) === text(expectedNext?.key)
      && cards.length >= 4
      && practiceCount >= 2;
    checks.push({ ok, severity: "high" });
    if (!ok) {
      findings.push({
        scenario: scenarioId,
        severity: "high",
        category: "progression",
        fixArea: "runtime_context",
        finding: "O avanço planejado não preencheu a próxima microssequência já prevista.",
        evidence: JSON.stringify({
          expectedNextKey: text(expectedNext?.key),
          targetMicrosequenceKey: text(selection?.microsequenceKey),
          cardCount: cards.length,
          practiceCount
        }),
        expected: {
          targetMicrosequenceKey: text(expectedNext?.key),
          minimumCards: 4,
          minimumPracticeCards: 2
        },
        received: {
          targetMicrosequenceKey: text(selection?.microsequenceKey),
          cardCount: cards.length,
          practiceCount
        }
      });
    }
  }

  if (scenarioId === "extend_current" || scenarioId === "repair_current") {
    const currentLesson = findLesson(projectDocument, selection.courseKey, selection.moduleKey, selection.lessonKey);
    const sameTarget = text(selection?.microsequenceKey) === text(baseSelection?.microsequenceKey);
    const sameCount =
      (Array.isArray(currentLesson?.microsequences) ? currentLesson.microsequences.length : 0)
      === (Array.isArray(baseLesson?.microsequences) ? baseLesson.microsequences.length : 0);
    const minimumCards = scenarioId === "repair_current" ? 3 : 5;
    const minimumPractice = scenarioId === "repair_current" ? 1 : 2;
    const ok = sameTarget && sameCount && cards.length >= minimumCards && practiceCount >= minimumPractice;
    checks.push({ ok, severity: "high" });
    if (!ok) {
      findings.push({
        scenario: scenarioId,
        severity: "high",
        category: "progression",
        fixArea: "runtime_context",
        finding: "A intervenção local saiu da microssequência atual ou perdeu densidade didática.",
        evidence: JSON.stringify({
          baseMicrosequenceKey: text(baseSelection?.microsequenceKey),
          targetMicrosequenceKey: text(selection?.microsequenceKey),
          baseCount: Array.isArray(baseLesson?.microsequences) ? baseLesson.microsequences.length : 0,
          currentCount: Array.isArray(currentLesson?.microsequences) ? currentLesson.microsequences.length : 0,
          cardCount: cards.length,
          practiceCount
        }),
        expected: {
          targetMicrosequenceKey: text(baseSelection?.microsequenceKey),
          sameMicrosequenceCount: Array.isArray(baseLesson?.microsequences) ? baseLesson.microsequences.length : 0,
          minimumCards,
          minimumPracticeCards: minimumPractice
        },
        received: {
          targetMicrosequenceKey: text(selection?.microsequenceKey),
          currentMicrosequenceCount: Array.isArray(currentLesson?.microsequences) ? currentLesson.microsequences.length : 0,
          cardCount: cards.length,
          practiceCount
        }
      });
    }
  }

  if (scenarioId === "create_support_branch") {
    const baseLessonCurrentIndex = (baseLesson?.microsequences || []).findIndex((item) => item?.key === baseSelection.microsequenceKey);
    const currentLessonMicrosequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
    const supportIndex = currentLessonMicrosequences.findIndex((item) => item?.key === selection.microsequenceKey);
    const ok =
      supportIndex === baseLessonCurrentIndex + 1
      && text(microsequence?.type) === "support"
      && text(microsequence?.parentMicrosequenceKey) === text(baseSelection.microsequenceKey)
      && text(microsequence?.returnToMicrosequenceKey) === text(baseSelection.microsequenceKey)
      && text(microsequence?.branchPolicy) === "must_return_to_planned_track"
      && Boolean(text(microsequence?.supportReason))
      && hasReturnSignal(lastCardText);
    checks.push({ ok, severity: "high" });
    if (!ok) {
      findings.push({
        scenario: scenarioId,
        severity: "high",
        category: "progression",
        fixArea: "runtime_context",
        finding: "A microssequência de suporte não ficou marcada nem encaixada corretamente.",
        evidence: JSON.stringify({
          supportIndex,
          expectedIndex: baseLessonCurrentIndex + 1,
          type: text(microsequence?.type),
          parentMicrosequenceKey: text(microsequence?.parentMicrosequenceKey),
          returnToMicrosequenceKey: text(microsequence?.returnToMicrosequenceKey),
          branchPolicy: text(microsequence?.branchPolicy),
          supportReason: text(microsequence?.supportReason),
          lastCardText: lastCardText.slice(0, 180)
        }),
        expected: {
          insertedAfterCurrent: true,
          type: "support",
          parentMicrosequenceKey: text(baseSelection.microsequenceKey),
          returnToMicrosequenceKey: text(baseSelection.microsequenceKey),
          branchPolicy: "must_return_to_planned_track",
          supportReason: true,
          explicitReturn: true
        },
        received: snapshotMicrosequence(moduleValue, microsequence)
      });
    }
  }

  return {
    score: summarizeChecks(checks),
    findings,
    microsequenceSnapshot: snapshotMicrosequence(moduleValue, microsequence)
  };
}

function buildSeedProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course-arch",
        title: "Arquitetura de Computadores",
        goal: "Formar base para ler o ciclo básico de execução.",
        modules: [
          {
            key: "module-cycle",
            title: "Ciclo básico",
            include: [
              { id: "scope-pc", label: "papel do PC no ciclo básico" },
              { id: "scope-ir", label: "papel do IR no ciclo básico" },
              { id: "scope-memory", label: "busca da instrução na memória" }
            ],
            exclude: [
              { id: "scope-spec", label: "desvio especulativo" }
            ],
            assessmentStyle: "mixed",
            notes: "Não antecipar mecanismos avançados.",
            lessons: [
              {
                key: "lesson-cycle",
                title: "PC, IR e busca",
                goal: "Explicar a base do ciclo antes do próximo passo.",
                sourceGuideStructured: {
                  lessonGoal: "Base anterior pronta.",
                  notationRules: "papel do IR no ciclo básico",
                  commonErrors: "Não pular etapas.",
                  outOfScopeRules: "desvio especulativo"
                },
                microsequences: [
                  {
                    key: "micro-base",
                    title: "Base local",
                    goal: "Retomar o IR como ponto de partida.",
                    type: "main",
                    status: "ready",
                    included: true,
                    tags: ["IR"],
                    scopeRefs: ["scope-ir"],
                    cards: [
                      {
                        key: "card-base-1",
                        title: "Retomada",
                        say: "O IR guarda a instrução atual para a CPU continuar o ciclo."
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

function buildTopDownDraft() {
  return {
    courseFixed: true,
    courseInput: "Arquitetura de Computadores",
    courseKey: "course-arch",
    moduleFixed: true,
    moduleInput: "Ciclo básico",
    moduleKey: "module-cycle",
    lessonFixed: true,
    lessonInput: "PC, IR e busca",
    lessonKey: "lesson-cycle",
    includeTopics: [
      "papel do PC no ciclo básico",
      "papel do IR no ciclo básico",
      "busca da instrução na memória"
    ],
    excludeTopics: ["desvio especulativo"],
    promptText: "Planeje a lição até microssequências, com dependências explícitas e sem gerar cards."
  };
}

function buildFakeProvider() {
  return createFakeProvider({
    script: {
      "infer-scope-contract": {
        course: {
          title: "Arquitetura de Computadores",
          goal: "Formar base para ler o ciclo básico de execução.",
          evidencePriority: ["exercise_list"]
        },
        modules: [
          {
            title: "Ciclo básico",
            include: [
              "papel do PC no ciclo básico",
              "papel do IR no ciclo básico",
              "busca da instrução na memória"
            ],
            exclude: ["desvio especulativo"],
            notes: "Manter a lição no ciclo básico.",
            assessmentStyle: "mixed"
          }
        ]
      },
      "plan-scope": {
        course: {
          title: "Arquitetura de Computadores",
          modules: [
            {
              title: "Ciclo básico",
              lessons: [
                {
                  title: "PC, IR e busca",
                  goal: "Conectar PC, IR e busca da instrução em ordem didática.",
                  sourceGuideStructured: {
                    lessonGoal: "Explicar PC, IR e busca sem pressupor mecanismos avançados.",
                    notationRules: "papel do PC no ciclo básico, papel do IR no ciclo básico, busca da instrução na memória",
                    commonErrors: "Não confundir o ciclo básico com otimizações de pipeline.",
                    outOfScopeRules: "desvio especulativo"
                  },
                  microsequences: [
                    {
                      title: "PC e IR no ciclo",
                      goal: "Relacionar PC e IR durante a busca da instrução.",
                      dependsOnTitles: [],
                      scopeLabels: ["papel do PC no ciclo básico", "papel do IR no ciclo básico"]
                    },
                    {
                      title: "Busca da instrução na memória",
                      goal: "Explicar como a memória entrega a instrução ao IR.",
                      dependsOnTitles: ["PC e IR no ciclo"],
                      scopeLabels: ["busca da instrução na memória"]
                    },
                    {
                      title: "Fechamento guiado do ciclo básico",
                      goal: "Treinar a sequência básica antes de avançar.",
                      dependsOnTitles: ["Busca da instrução na memória"],
                      scopeLabels: ["papel do PC no ciclo básico", "busca da instrução na memória"]
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      "generate-microsequence": [
        {
          summary: "Primeira microssequência planejada preenchida.",
          cards: [
            { key: "pc-ir-1", position: 1, resourceType: "say", content: "O PC aponta o endereço da próxima instrução e o IR guarda a instrução carregada agora." },
            { key: "pc-ir-2", position: 2, resourceType: "say", content: "Primeiro a CPU usa o PC para buscar a instrução; depois o IR mantém essa instrução disponível para a etapa seguinte." },
            { key: "pc-ir-3", position: 3, resourceType: "code", content: { intro: "Sequência mínima do ciclo.", code: "PC -> memoria -> IR", language: "text" } },
            { key: "pc-ir-4", position: 4, resourceType: "block_gap_fill", content: "Complete: no ciclo básico, o [[PC::PC|IR]] aponta o endereço e o [[IR::IR|PC]] guarda a instrução atual." }
          ]
        },
        {
          summary: "Próxima microssequência planejada preenchida.",
          cards: [
            { key: "mem-1", position: 1, resourceType: "say", content: "A memória entrega ao IR a instrução localizada pelo endereço indicado no PC." },
            { key: "mem-2", position: 2, resourceType: "say", content: "A busca não executa a instrução ainda; ela apenas traz a instrução correta para o IR." },
            { key: "mem-3", position: 3, resourceType: "code", content: { intro: "Fluxo mínimo.", code: "memoria[PC] -> IR", language: "text" } },
            { key: "mem-4", position: 4, resourceType: "block_gap_fill", content: "Preencha: a instrução sai da [[memória::memória|ULA]] e entra no [[IR::IR|PC]]." }
          ]
        }
      ],
      "add-practice": {
        summary: "Mais prática no mesmo assunto.",
        cards: [
          { key: "pc-ir-1", position: 1, resourceType: "say", content: "O PC aponta o endereço da próxima instrução e o IR guarda a instrução carregada agora." },
          { key: "pc-ir-2", position: 2, resourceType: "say", content: "Pense no PC como o marcador do próximo passo e no IR como o cartão com a instrução atual." },
          { key: "pc-ir-3", position: 3, resourceType: "code", content: { intro: "Resumo operacional.", code: "PC -> memoria -> IR", language: "text" } },
          { key: "pc-ir-4", position: 4, resourceType: "block_gap_fill", content: "Complete: o [[PC::PC|IR]] aponta o endereço antes de a instrução chegar ao [[IR::IR|PC]]." },
          { key: "pc-ir-5", position: 5, resourceType: "say", content: "Exemplo: se o PC aponta a posição 120, a memória procura a instrução da posição 120 e o IR passa a guardar esse valor." },
          { key: "pc-ir-6", position: 6, resourceType: "block_gap_fill", content: "Preencha: a instrução atual fica no [[IR::IR|PC]], não no [[PC::PC|IR]]." }
        ]
      },
      "improve-microsequence": {
        summary: "Versão reparada e mais guiada.",
        cards: [
          { key: "pc-ir-r1", position: 1, resourceType: "say", content: "No ciclo básico, o PC só aponta onde buscar e o IR só guarda o que foi buscado." },
          { key: "pc-ir-r2", position: 2, resourceType: "say", content: "Isso evita duas confusões comuns: achar que o PC guarda a instrução ou achar que o IR aponta o próximo endereço." },
          { key: "pc-ir-r3", position: 3, resourceType: "block_gap_fill", content: "Corrija: o [[PC::PC|IR]] aponta o endereço e o [[IR::IR|PC]] guarda a instrução atual." },
          { key: "pc-ir-r4", position: 4, resourceType: "say", content: "Antes de avançar, releia a dupla função: PC aponta; IR guarda." }
        ]
      },
      "create-support": {
        title: "Apoio: endereço versus instrução",
        goal: "Separar claramente a ideia de endereço da ideia de instrução.",
        supportReason: "O aluno pode confundir endereço com a instrução carregada.",
        didacticKind: "concept",
        practiceMode: "guided_practice",
        representationNeed: "text",
        dependencyPolicy: "self_contained",
        expectedEvidence: ["distinguir endereço de instrução"],
        summary: "Microssequência curta de apoio.",
        cards: [
          { key: "support-1", position: 1, resourceType: "say", content: "Endereço responde onde buscar; instrução responde o que executar." },
          { key: "support-2", position: 2, resourceType: "say", content: "O PC trabalha com o endereço. O IR trabalha com a instrução já trazida." },
          { key: "support-3", position: 3, resourceType: "block_gap_fill", content: "Preencha: o [[PC::PC|IR]] aponta o endereço e o [[IR::IR|PC]] guarda a instrução." },
          { key: "support-4", position: 4, resourceType: "say", content: "Agora volte para a trilha principal e retome a microssequência sobre PC e IR no ciclo." }
        ]
      }
    }
  });
}

function buildAssistConfig(providerId) {
  if (providerId.startsWith("codex")) {
    return {
      model: providerId,
      codexEndpoint: text(process.env.ARALEARN_CODEX_ASSIST_URL) || "http://127.0.0.1:4183/assist",
      codexToken: text(process.env.ARALEARN_CODEX_TOKEN)
    };
  }
  return {
    model: providerId,
    apiKey: text(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
  };
}

function buildProviderWrapper({ providerId, route, cacheDir, realBudget, usage }) {
  if (providerId === "fake") {
    return {
      provider: buildFakeProvider(),
      modelId: "fake:model",
      providerKind: "fake"
    };
  }

  const runtime = resolveGenerationProviderRuntime(buildAssistConfig(providerId));
  const baseProvider = runtime.provider;
  const wrappedProvider = {
    ...baseProvider,
    async generateStructured(request = {}) {
      const promptHash = sha256(request.prompt || "");
      const schemaHash = sha256(JSON.stringify(request.schema || {}));
      const configHash = sha256(JSON.stringify({
        modelId: request.modelId || runtime.modelId,
        mode: request.mode || "",
        temperature: request.temperature ?? null
      }));
      const cacheKey = sha256(JSON.stringify({
        provider: providerId,
        modelId: request.modelId || runtime.modelId,
        route,
        mode: request.mode || "",
        promptHash,
        schemaHash,
        configHash
      }));
      const cachePath = path.join(cacheDir, providerId, `${cacheKey}.json`);

      if (fs.existsSync(cachePath)) {
        usage.cacheHits += 1;
        usage.callLog.push({
          provider: providerId,
          route,
          mode: request.mode || "",
          used: "cache",
          promptHash,
          schemaHash,
          configHash,
          cachePath
        });
        return JSON.parse(fs.readFileSync(cachePath, "utf8")).response;
      }

      if (usage.realCalls >= realBudget) {
        const error = new Error(`Real budget exhausted before cache miss at route "${route}".`);
        error.code = "REAL_BUDGET_EXHAUSTED";
        throw error;
      }

      const response = await baseProvider.generateStructured(request);
      usage.realCalls += 1;
      usage.callLog.push({
        provider: providerId,
        route,
        mode: request.mode || "",
        used: "real",
        promptHash,
        schemaHash,
        configHash,
        cachePath
      });
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, `${JSON.stringify({
        provider: providerId,
        modelId: request.modelId || runtime.modelId,
        route,
        mode: request.mode || "",
        promptHash,
        schemaHash,
        configHash,
        response
      }, null, 2)}\n`, "utf8");
      return response;
    }
  };

  return {
    provider: wrappedProvider,
    modelId: runtime.modelId,
    providerKind: "real_or_cache"
  };
}

function probableFileForFinding(finding = {}) {
  const fixArea = text(finding.fixArea);
  if (fixArea === "runtime_context") {
    return "src/generation/runtime/projectGenerationRuntime.js";
  }
  if (fixArea === "prompt") {
    return text(finding.scenario) === "top_down"
      ? "src/generation/topDown/planCourseFromScope.js"
      : "src/generation/prompts/bottomUpPrompt.js";
  }
  if (fixArea === "schema") {
    return "src/generation/schemas/bottomUpSchema.js";
  }
  if (fixArea === "validator") {
    return text(finding.scenario) === "top_down"
      ? "src/domain/scopeContract.js"
      : "src/generation/bottomUp/validateMicrosequenceCards.js";
  }
  return "src/generation/runtime/projectGenerationRuntime.js";
}

function testCommandForStage(stageId = "") {
  if (stageId === "top_down") {
    return "npm run validate:scope";
  }
  return "npm run harness:bottom-up";
}

function buildFailure(stageId, route, failureSource = {}, extra = {}) {
  const finding = failureSource?.findings?.[0] || null;
  return {
    stageId,
    route,
    error: extra.error || finding?.finding || "Falha sem diagnóstico estruturado.",
    fileHint: probableFileForFinding(finding || {}),
    expected: finding?.expected || extra.expected || {},
    received: finding?.received || extra.received || {},
    evidence: finding?.evidence || extra.evidence || "",
    fixArea: text(finding?.fixArea) || "runtime_context",
    testCommand: testCommandForStage(stageId),
    pedagogicalConstraints: [
      "Preservar a trilha top-down como linha principal.",
      "Não introduzir assunto fora de include/dependências.",
      "Não condensar artificialmente a didática.",
      "Manter o contrato público válido."
    ]
  };
}

async function runStage({ stageId, route, reportDir, action, evaluate }) {
  const result = await action();
  const evaluation = evaluate(result);
  writeJsonIfNeeded(path.join(reportDir, `${stageId}.result.json`), result);
  writeJsonIfNeeded(path.join(reportDir, `${stageId}.evaluation.json`), evaluation);
  return { result, evaluation };
}

async function main() {
  const input = JSON.parse(process.argv[2] || "{}");
  const providerId = text(input.provider) || "fake";
  const reportDir = text(input.reportDir);
  const cacheDir = text(input.cacheDir) || path.join(path.dirname(new URL(import.meta.url).pathname), "cache");
  const realBudget = Number.isFinite(Number(input.realBudget)) ? Number(input.realBudget) : 0;
  const usage = { realCalls: 0, cacheHits: 0, callLog: [] };
  const report = {
    provider: providerId,
    completedStages: [],
    stages: [],
    firstFailure: null,
    stopReason: "completed",
    usage: {
      mode: providerId === "fake" ? "fake" : "real_or_cache",
      realCalls: 0,
      cacheHits: 0,
      callLog: []
    }
  };

  try {
    const seedProject = buildSeedProjectDocument();
    const topDownRuntime = buildProviderWrapper({
      providerId,
      route: "top_down",
      cacheDir,
      realBudget,
      usage
    });

    const topDown = await runStage({
      stageId: "top_down",
      route: "top_down",
      reportDir,
      action: () =>
        generateStructureProjectDocument({
          draft: buildTopDownDraft(),
          scopeState: {
            course: { key: "course-arch", title: "Arquitetura de Computadores" },
            moduleValue: { key: "module-cycle", title: "Ciclo básico" },
            lesson: { key: "lesson-cycle", title: "PC, IR e busca" }
          },
          projectDocument: clone(seedProject),
          assistConfig: { model: topDownRuntime.modelId },
          provider: topDownRuntime.provider,
          ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
        }),
      evaluate: ({ projectDocument, patch }) =>
        evaluateTopDownResult({
          projectDocument,
          selection: {
            courseKey: patch.target.courseKey,
            moduleKey: patch.target.moduleKey,
            lessonKey: patch.target.lessonKey
          }
        })
    });
    report.stages.push({
      stageId: "top_down",
      route: "top_down",
      ok: topDown.evaluation.findings.length === 0,
      score: topDown.evaluation.score
    });
    if (topDown.evaluation.findings.length) {
      report.firstFailure = buildFailure("top_down", "top_down", topDown.evaluation);
      report.stopReason = "first_failure";
    } else {
      report.completedStages.push("top_down");
    }

    if (!report.firstFailure) {
      const lessonSelection = {
        courseKey: topDown.result.patch.target.courseKey,
        moduleKey: topDown.result.patch.target.moduleKey,
        lessonKey: topDown.result.patch.target.lessonKey
      };
      const lesson = findLesson(topDown.result.projectDocument, lessonSelection.courseKey, lessonSelection.moduleKey, lessonSelection.lessonKey);
      const baseSelection = {
        ...lessonSelection,
        microsequenceKey: lesson.microsequences[0].key
      };

      const stages = [
        {
          stageId: "generate_planned_next_1",
          route: "generate_planned_next",
          getContext: () => ({
            projectDocument: topDown.result.projectDocument,
            selection: baseSelection,
            dependencyTitles: ["Base local"]
          }),
          run: ({ projectDocument, selection }) => {
            const runtime = buildProviderWrapper({ providerId, route: "generate_planned_next", cacheDir, realBudget, usage });
            return generateMicrosequenceProjectDocument({
              selection,
              draft: {
                promptText: "",
                actionIntent: "next_planned",
                operationMode: "reinforce",
                interventionTargetMode: "current"
              },
              assistConfig: { model: runtime.modelId },
              provider: runtime.provider,
              projectDocument: clone(projectDocument),
              ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
            });
          }
        },
        {
          stageId: "extend_current",
          route: "extend_current",
          getContext: (previous) => ({
            projectDocument: previous.result.projectDocument,
            selection: previous.result.target
          }),
          run: ({ projectDocument, selection }) => {
            const runtime = buildProviderWrapper({ providerId, route: "extend_current", cacheDir, realBudget, usage });
            return generateMicrosequenceProjectDocument({
              selection,
              draft: {
                promptText: "Amplie a microssequência atual com mais explicação e prática, sem mudar de assunto.",
                operationMode: "reinforce",
                interventionTargetMode: "current"
              },
              assistConfig: { model: runtime.modelId },
              provider: runtime.provider,
              projectDocument: clone(projectDocument),
              dependencyTitles: ["Base local"],
              selectedDidacticTypeId: "explain",
              ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
            });
          }
        },
        {
          stageId: "repair_current",
          route: "repair_current",
          getContext: (previous) => ({
            projectDocument: previous.result.projectDocument,
            selection: previous.result.target
          }),
          run: ({ projectDocument, selection }) => {
            const runtime = buildProviderWrapper({ providerId, route: "repair_current", cacheDir, realBudget, usage });
            return generateMicrosequenceProjectDocument({
              selection,
              draft: {
                promptText: "Corrija a microssequência atual mantendo o mesmo objetivo local e sem abrir assunto novo.",
                operationMode: "repair",
                interventionTargetMode: "current"
              },
              assistConfig: { model: runtime.modelId },
              provider: runtime.provider,
              projectDocument: clone(projectDocument),
              ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
            });
          }
        },
        {
          stageId: "create_support_branch",
          route: "create_support_branch",
          getContext: (previous) => ({
            projectDocument: previous.result.projectDocument,
            selection: previous.result.target
          }),
          run: ({ projectDocument, selection }) => {
            const runtime = buildProviderWrapper({ providerId, route: "create_support_branch", cacheDir, realBudget, usage });
            return generateMicrosequenceProjectDocument({
              selection,
              draft: {
                promptText: "Crie uma microssequência de apoio curta para sanar uma lacuna local e depois retorne à trilha principal.",
                operationMode: "reinforce",
                interventionTargetMode: "new_after_current"
              },
              assistConfig: { model: runtime.modelId },
              provider: runtime.provider,
              projectDocument: clone(projectDocument),
              ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
            });
          }
        },
        {
          stageId: "generate_planned_next_2",
          route: "generate_planned_next",
          getContext: (previous) => ({
            projectDocument: previous.result.projectDocument,
            selection: previous.result.target
          }),
          run: ({ projectDocument, selection }) => {
            const runtime = buildProviderWrapper({ providerId, route: "generate_planned_next", cacheDir, realBudget, usage });
            return generateMicrosequenceProjectDocument({
              selection,
              draft: {
                promptText: "",
                actionIntent: "next_planned",
                operationMode: "reinforce",
                interventionTargetMode: "current"
              },
              assistConfig: { model: runtime.modelId },
              provider: runtime.provider,
              projectDocument: clone(projectDocument),
              ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
            });
          }
        }
      ];

      let previousStage = {
        result: {
          projectDocument: topDown.result.projectDocument,
          target: baseSelection
        }
      };
      let previousBase = {
        projectDocument: topDown.result.projectDocument,
        selection: baseSelection
      };

      for (const stage of stages) {
        try {
          const context = stage.getContext(previousStage, previousBase);
          const stageResult = await runStage({
            stageId: stage.stageId,
            route: stage.route,
            reportDir,
            action: () => stage.run(context),
            evaluate: (result) => evaluateBottomUpScenario({
              scenarioId: stage.route,
              projectDocument: result.projectDocument,
              selection: result.target,
              baseProjectDocument: context.projectDocument,
              baseSelection: context.selection
            })
          });
          report.stages.push({
            stageId: stage.stageId,
            route: stage.route,
            ok: stageResult.evaluation.findings.length === 0,
            score: stageResult.evaluation.score
          });
          if (stageResult.evaluation.findings.length) {
            report.firstFailure = buildFailure(stage.stageId, stage.route, stageResult.evaluation);
            report.stopReason = "first_failure";
            break;
          }
          report.completedStages.push(stage.stageId);
          previousBase = {
            projectDocument: context.projectDocument,
            selection: context.selection
          };
          previousStage = stageResult;
        } catch (error) {
          if (error?.code === "REAL_BUDGET_EXHAUSTED") {
            report.firstFailure = buildFailure(stage.stageId, stage.route, {}, {
              error: "Real budget exhausted before cache miss.",
              expected: { cacheReplay: true, realBudgetRemaining: "> 0" },
              received: { cacheReplay: false, realBudgetRemaining: 0 }
            });
            report.stopReason = "quota_exhausted";
            break;
          }
          if (isUsageLimitError(error)) {
            report.firstFailure = buildFailure(stage.stageId, stage.route, {}, {
              error: "Provider real indisponível por cota.",
              expected: { providerAvailable: true },
              received: { providerAvailable: false, message: normalizeErrorMessage(error) }
            });
            report.stopReason = "quota_exhausted";
            break;
          }
          report.firstFailure = buildFailure(stage.stageId, stage.route, {}, {
            error: normalizeErrorMessage(error),
            expected: { runtimeError: null },
            received: { runtimeError: normalizeErrorMessage(error) }
          });
          report.stopReason = "first_failure";
          break;
        }
      }
    }
  } catch (error) {
    report.firstFailure = buildFailure("top_down", "top_down", {}, {
      error: normalizeErrorMessage(error),
      expected: { runtimeError: null },
      received: { runtimeError: normalizeErrorMessage(error) }
    });
    report.stopReason = isUsageLimitError(error) ? "quota_exhausted" : "first_failure";
  }

  report.usage.realCalls = usage.realCalls;
  report.usage.cacheHits = usage.cacheHits;
  report.usage.callLog = usage.callLog;
  writeJsonIfNeeded(path.join(reportDir, "probe-report.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

await main();
