function cloneList(items = []) {
  return items.map((item) => (Array.isArray(item) ? [...item] : item && typeof item === "object" ? { ...item } : item));
}

const DIDACTIC_GUARDRAILS = Object.freeze({
  studentProfile: "iniciante absoluto",
  generationFlow: ["microteoria", "exemplo guiado", "prática autossuficiente", "consolidação"],
  hardRules: [
    "bastidor zero no texto do aluno",
    "contexto crítico no próprio card",
    "lacunas atômicas ou quase atômicas",
    "explicação antes da prática",
    "menor salto de raciocínio possível"
  ],
  auditPriorities: [
    "auditar bastidor exposto ao aluno",
    "auditar contexto volátil, bastidor e resposta já revelada",
    "dividir cards ou trocar recurso quando a prática não couber com clareza",
    "concretizar antes de generalizar"
  ],
  practiceContract: {
    minimumSequence: ["explicar", "mostrar", "fazer junto", "consolidar"],
    practiceGoals: [
      "discriminar a habilidade central",
      "repetir o elemento novo em mais de um item",
      "usar feedback corretivo sem pular etapa operacional",
      "preferir recuperação ativa curta a reconhecimento passivo quando o conteúdo já foi mostrado"
    ],
    deterministicChecks: [
      "bloquear referência a card anterior, aula, material ou fonte externa no texto do aluno",
      "bloquear lacuna longa que peça frase inteira ou condição inteira",
      "bloquear prática sem os dados locais necessários no próprio card"
    ]
  }
});

const PLANNING_PROMPT_LINES = Object.freeze([
  "Pense na microssequência como contrato auditável: planeje a sequência microteoria -> exemplo guiado -> prática autossuficiente -> consolidação.",
  "Use sourceGuide de curso, módulo e lição como governança principal; userPrompt só especializa o escopo.",
  "Planeje prática apenas depois da explicação necessária e com contexto crítico no próprio card.",
  "Se a prática exigir contexto invisível ou lacuna longa, divida em mais cards ou troque o resourceType."
]);

const GENERATION_PROMPT_LINES = Object.freeze([
  "Trate sourceGuide de curso, módulo e lição como contrato de governança.",
  "Explique antes de cobrar: a prática deve reutilizar dados, passos ou notações já mostrados localmente.",
  "Prefira cards auditáveis: contexto local explícito, pergunta curta, resposta única e feedback corretivo.",
  "Se a prática não couber com clareza em um único card, divida em mais cards."
]);

const REPAIR_PROMPT_LINES = Object.freeze([
  "- trate bastidor exposto ao aluno, contexto crítico ausente e lacuna longa como falhas bloqueadoras;",
  "- quando uma prática estiver comprimida demais, prefira dividir em mais cards ou trocar resourceType;",
  "- preserve a cadeia microteoria -> exemplo guiado -> prática autossuficiente -> consolidação quando ela já existir no plano;"
]);

const EDIT_PLANNING_PROMPT_LINES = Object.freeze([
  "Planeje a edição mantendo bastidor zero, contexto crítico no próprio card e prática só depois da explicação necessária.",
  "Se o card estiver fraco, priorize operações que reforcem microteoria local, exemplo guiado e autossuficiência.",
  "Se o problema for contexto invisível ou lacuna longa, planeje dividir em mais cards ou trocar o recurso."
]);

const EDIT_PROMPT_LINES = Object.freeze([
  "Aplique a edição preservando bastidor zero no texto do aluno, contexto crítico no próprio card e lacunas curtas com resposta única.",
  "Se um card ainda depender de exemplo anterior, aula, material, figura acima ou contexto invisível, reescreva o card para ficar autossuficiente.",
  "Quando o pedido implicar prática nova ou mais difícil, inclua a microteoria ou o exemplo guiado local necessário."
]);

const LESSON_GOVERNANCE_FIELD_LABELS = Object.freeze({
  lessonGoal: "Meta da lição",
  notationRules: "Sinais e notação",
  commonErrors: "Confusões prováveis"
});

const DIDACTIC_TEXT_PATTERNS = Object.freeze([
  {
    pattern: /\b(card|exemplo|quest[aã]o|figura|tabela|trecho)\s+anterior\b/i,
    message: "Referência a item anterior no texto do aluno."
  },
  {
    pattern: /\b(figura|tabela|trecho)\s+acima\b/i,
    message: "Referência a contexto visual fora do próprio card."
  },
  {
    pattern: /\b(como vimos|como mostrado|como no caderno|na aula|na prova|no material|na fonte|no pdf|no documento)\b/i,
    message: "Referência externa ou volátil no texto do aluno."
  },
  {
    pattern: /\b(pipeline|builder|editor|subparte|container|recurso nativo)\b/i,
    message: "Bastidor exposto ao aluno."
  }
]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function listStringLeaves(value, path = "card") {
  if (typeof value === "string") {
    return [{ path, value }];
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => listStringLeaves(item, `${path}[${index}]`));
  }

  return Object.entries(value).flatMap(([key, item]) => {
    if (["resourceType", "optionId", "correctOptionId", "language", "key"].includes(key)) {
      return [];
    }
    return listStringLeaves(item, `${path}.${key}`);
  });
}

function listGapErrors(text, path) {
  const source = normalizeText(text);
  const errors = [];
  for (const match of source.matchAll(/\[\[([\s\S]*?)\]\]/g)) {
    const raw = normalizeText(match[1]);
    const delimiterIndex = raw.indexOf("::");
    const answer = normalizeText(delimiterIndex >= 0 ? raw.slice(0, delimiterIndex) : raw);
    const wordCount = answer ? answer.split(/\s+/).filter(Boolean).length : 0;
    if (answer.length > 40 || wordCount > 5) {
      errors.push(`Lacuna longa demais em ${path}.`);
    }
  }
  return errors;
}

export function buildDidacticGuardrails() {
  return {
    studentProfile: DIDACTIC_GUARDRAILS.studentProfile,
    generationFlow: cloneList(DIDACTIC_GUARDRAILS.generationFlow),
    hardRules: cloneList(DIDACTIC_GUARDRAILS.hardRules),
    auditPriorities: cloneList(DIDACTIC_GUARDRAILS.auditPriorities),
    practiceContract: {
      minimumSequence: cloneList(DIDACTIC_GUARDRAILS.practiceContract.minimumSequence),
      practiceGoals: cloneList(DIDACTIC_GUARDRAILS.practiceContract.practiceGoals),
      deterministicChecks: cloneList(DIDACTIC_GUARDRAILS.practiceContract.deterministicChecks)
    }
  };
}

export function buildDidacticPlanningPromptLines() {
  return cloneList(PLANNING_PROMPT_LINES);
}

export function buildDidacticGenerationPromptLines() {
  return cloneList(GENERATION_PROMPT_LINES);
}

export function buildDidacticRepairPromptLines() {
  return cloneList(REPAIR_PROMPT_LINES);
}

export function buildDidacticEditPlanningPromptLines() {
  return cloneList(EDIT_PLANNING_PROMPT_LINES);
}

export function buildDidacticEditPromptLines() {
  return cloneList(EDIT_PROMPT_LINES);
}

export function buildLessonRequestGovernance(lessonSourceGuideStructured = {}) {
  const anchors = Object.entries(LESSON_GOVERNANCE_FIELD_LABELS)
    .map(([field, label]) => {
      const value = normalizeText(lessonSourceGuideStructured?.[field]);
      return value ? { field, label, value } : null;
    })
    .filter(Boolean);

  return {
    precedence: [
      "context.lesson.sourceGuideStructured",
      "context.sourceGuideLineage",
      "selectedLessonTopicRefs",
      "request.userPrompt"
    ],
    userPromptRole: "especializar o recorte imediato e a ênfase dentro da lição atual",
    userPromptLimits: [
      "não ampliar a operação para fora da meta governada pela lição",
      "não contradizer notação, confusões prováveis nem critério final da lição",
      "não usar o pedido do usuário para substituir a progressão didática já governada"
    ],
    lessonAnchors: anchors
  };
}

export function collectDidacticCardErrors(card) {
  const errors = [];
  listStringLeaves(card).forEach(({ path, value }) => {
    const text = normalizeText(value);
    if (!text) {
      return;
    }
    DIDACTIC_TEXT_PATTERNS.forEach(({ pattern, message }) => {
      if (pattern.test(text)) {
        errors.push(`${message} (${path}).`);
      }
    });
    errors.push(...listGapErrors(text, path));
  });
  return errors;
}
