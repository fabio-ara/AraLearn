import { getContractCardKind, sanitizeContractCard } from "../contract/contractCard.js";
import {
  buildSourceGuideTextForModel,
  sanitizeSourceGuideStructuredForModel,
  SOURCE_GUIDE_LEVELS
} from "../sourceGuides/sourceGuideStructured.js";
import {
  listLessonContentTypeIds,
  listLessonLearningActionIds,
  listLessonResourceTagIds,
  listLessonSupportLevelIds,
  normalizeLessonGuidance
} from "../generation/guidance/lessonGuidance.js";
import { buildLessonDomainCoverageReport } from "../generation/domain/lessonDomainModel.js";

function fail(message) {
  throw new Error(message);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildOptionalGuideLine(label, value) {
  const normalized = normalizeText(value);
  return normalized ? `${label}: ${normalized}` : "";
}

function buildOptionalStructuredGuideLine(label, value) {
  if (!value || typeof value !== "object") {
    return "";
  }
  const entries = Object.entries(value)
    .map(([key, entryValue]) => [normalizeText(key), normalizeText(entryValue)])
    .filter(([, entryValue]) => entryValue);
  if (!entries.length) {
    return "";
  }
  return `${label}: ${entries.map(([key, entryValue]) => `${key}=${entryValue}`).join("; ")}`;
}

function buildOptionalDomainCoverageLine(context) {
  if (!context?.lessonDomainMap || typeof context.lessonDomainMap !== "object") {
    return "";
  }
  const coverage = buildLessonDomainCoverageReport({
    sourceGuideStructured: context.lessonSourceGuideStructured || {},
    domainMap: context.lessonDomainMap,
    microsequences: context.existingMicrosequences || []
  });
  const parts = [
    coverage.uncoveredItems.length ? `sem microssequência: ${coverage.uncoveredItems.join("; ")}` : "",
    coverage.weakItems.length ? `fracos: ${coverage.weakItems.join("; ")}` : "",
    coverage.explainedWithoutPractice.length ? `explicados sem prática: ${coverage.explainedWithoutPractice.join("; ")}` : "",
    coverage.practiceWithoutVariation.length ? `prática sem variação: ${coverage.practiceWithoutVariation.join("; ")}` : "",
    coverage.examMissing.length ? `sem formato de prova: ${coverage.examMissing.join("; ")}` : ""
  ].filter(Boolean);
  return parts.length ? `Mapa de domínio da lição: ${parts.join(" | ")}` : "";
}

function buildExistingMicrosequenceLines(items = [], { includeKeys = false } = {}) {
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          key: normalizeText(item?.key),
          position: Number.isInteger(item?.position) ? item.position : null,
          title: normalizeText(item?.title),
          description: normalizeText(item?.description),
          tags: Array.isArray(item?.tags) ? item.tags.map((entry) => normalizeText(entry)).filter(Boolean) : [],
          domainRefs: Array.isArray(item?.domainRefs) ? item.domainRefs.map((entry) => normalizeText(entry)).filter(Boolean) : [],
          practiceVariantRefs: Array.isArray(item?.practiceVariantRefs)
            ? item.practiceVariantRefs.map((entry) => normalizeText(entry)).filter(Boolean)
            : [],
          didacticPurpose: normalizeText(item?.didacticPurpose),
          coverageRole: normalizeText(item?.coverageRole),
          status: normalizeText(item?.status),
          included: item?.included === true
        }))
        .filter((item) => item.title)
    : [];

  if (!normalizedItems.length) {
    return ["Microssequências atuais: nenhuma."];
  }

  return [
    "Microssequências atuais:",
    ...normalizedItems.map((item, index) => {
      const key = includeKeys && item.key ? `; key: ${item.key}` : "";
      const position = includeKeys && Number.isInteger(item.position) ? `; posição: ${item.position + 1}` : "";
      const tags = item.tags.length ? `; tags: ${item.tags.join(", ")}` : "";
      const domainRefs = item.domainRefs.length ? `; domainRefs: ${item.domainRefs.join(", ")}` : "";
      const variantRefs = item.practiceVariantRefs.length ? `; practiceVariants: ${item.practiceVariantRefs.join(", ")}` : "";
      const didacticPurpose = item.didacticPurpose ? `; finalidade: ${item.didacticPurpose}` : "";
      const coverageRole = item.coverageRole ? `; papel: ${item.coverageRole}` : "";
      const description = item.description ? `; descrição: ${item.description}` : "";
      return `${index + 1}. ${item.title}${key}${position}; status: ${item.status || "draft"}; included: ${item.included ? "sim" : "não"}${description}${coverageRole}${didacticPurpose}${domainRefs}${variantRefs}${tags}`;
    })
  ];
}

function buildHierarchySummaryLines(label, items = [], childLabel = "") {
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          title: normalizeText(item?.title),
          description: normalizeText(item?.description),
          sourceGuide: normalizeText(item?.sourceGuide),
          children: Array.isArray(item?.lessons)
            ? item.lessons
                .map((child) => ({
                  title: normalizeText(child?.title),
                  description: normalizeText(child?.description),
                  sourceGuide: normalizeText(child?.sourceGuide)
                }))
                .filter((child) => child.title || child.description || child.sourceGuide)
            : []
        }))
        .filter((item) => item.title || item.description || item.sourceGuide || item.children.length)
    : [];

  if (!normalizedItems.length) {
    return [`${label}: nenhum.`];
  }

  return [
    `${label}:`,
    ...normalizedItems.map((item, index) => {
      const description = item.description ? `; descrição: ${item.description}` : "";
      const sourceGuide = item.sourceGuide ? `; fonte-guia: ${item.sourceGuide}` : "";
      const children = item.children.length
        ? `; ${childLabel}: ${item.children
            .map((child) => {
              const childDescription = child.description ? ` (${child.description})` : "";
              const childGuide = child.sourceGuide ? ` [${child.sourceGuide}]` : "";
              return `${child.title || "sem título"}${childDescription}${childGuide}`;
            })
            .join(" | ")}`
        : "";
      return `${index + 1}. ${item.title || "sem título"}${description}${sourceGuide}${children}`;
    })
  ];
}

export function buildLadderPrompt({ context, promptText }) {
  return [
    "Você é o planejador simples do AraLearn.",
    "",
    "O usuário escolheu um contexto hierárquico e escreveu uma dúvida.",
    "Crie uma escada breve de microssequências para estudar essa dúvida.",
    "",
    "Contexto:",
    `Curso: ${normalizeText(context?.courseTitle)}`,
    `Módulo: ${normalizeText(context?.moduleTitle)}`,
    `Lição: ${normalizeText(context?.lessonTitle)}`,
    "",
    "Dúvida do usuário:",
    promptText,
    "",
    "Regras:",
    "- Cada item deve ser o título claro de uma microssequência pequena.",
    "- As etapas devem ir das dependências mínimas até a dúvida principal.",
    "- Não use nível iniciante/intermediário/avançado.",
    "- Não use tags.",
    "- Não gere cards.",
    "- Não gere explicação.",
    "- Não gere HTML.",
    "- Retorne apenas JSON válido no formato:",
    "",
    "{",
    '  "title": "string",',
    '  "steps": [',
    '    { "title": "string" }',
    "  ]",
    "}",
    "",
    "- A lista steps deve ter de 2 a 7 itens."
  ].join("\n");
}

export function buildStructurePrompt({ context, promptText }) {
  const courseTitle = normalizeText(context?.courseTitle) || "novo curso";
  const moduleTitle = normalizeText(context?.moduleTitle) || "novo módulo";
  const lessonTitle = normalizeText(context?.lessonTitle) || "nova lição";

  return [
    "Você gera estrutura top-down para o AraLearn.",
    "",
    `Ação prevista: ${normalizeText(context?.actionLabel) || "criar curso completo"}.`,
    `Curso fixado: ${context?.courseFixed ? "sim" : "não"}.`,
    `Módulo fixado: ${context?.moduleFixed ? "sim" : "não"}.`,
    `Lição fixada: ${context?.lessonFixed ? "sim" : "não"}.`,
    "",
    "Contexto atual:",
    `Curso: ${courseTitle}`,
    `Descrição breve do curso: ${normalizeText(context?.courseDescription) || "ausente"}`,
    `Módulo: ${moduleTitle}`,
    `Descrição breve do módulo: ${normalizeText(context?.moduleDescription) || "ausente"}`,
    `Lição: ${lessonTitle}`,
    `Descrição breve da lição: ${normalizeText(context?.lessonDescription) || "ausente"}`,
    buildOptionalGuideLine("Fonte-guia da lição", context?.lessonSourceGuide),
    buildOptionalStructuredGuideLine("Fonte-guia estruturada da lição", context?.lessonSourceGuideStructured),
    buildOptionalGuideLine("Recursos atuais da lição", Array.isArray(context?.lessonResourceTags) ? context.lessonResourceTags.join(", ") : ""),
    buildOptionalGuideLine("Tipos atuais de conteúdo", Array.isArray(context?.lessonContentTypeTags) ? context.lessonContentTypeTags.join(", ") : ""),
    buildOptionalGuideLine("Ações atuais de estudo", Array.isArray(context?.lessonLearningActionTags) ? context.lessonLearningActionTags.join(", ") : ""),
    buildOptionalGuideLine("Nível atual de apoio", context?.lessonSupportLevel),
    buildOptionalDomainCoverageLine(context),
    "",
    ...buildHierarchySummaryLines("Módulos atuais do curso", context?.courseModules, "lições"),
    ...buildHierarchySummaryLines("Lições atuais do módulo", context?.moduleLessons),
    ...buildExistingMicrosequenceLines(context?.lessonMicrosequences),
    "",
    "Entrada do usuário:",
    promptText,
    "",
    "Regras:",
    "- Retorne apenas curso, módulos e lições.",
    "- Não gere microssequências.",
    "- Não gere cards.",
    "- description deve ser breve, própria para UI.",
    "- Curso e módulo não têm fonte-guia própria neste contrato.",
    "- Em lição, use apenas: lessonGoal, notationRules, commonErrors.",
    `- Em lição, resourceTags deve usar apenas: ${listLessonResourceTagIds().join(", ")}.`,
    `- Em lição, contentTypeTags deve usar apenas: ${listLessonContentTypeIds().join(", ")}.`,
    `- Em lição, learningActionTags deve usar apenas: ${listLessonLearningActionIds().join(", ")}.`,
    `- Em lição, supportLevel deve usar apenas: ${listLessonSupportLevelIds().join(", ")}.`,
    "- sourceGuide deve ser apenas um resumo curto e legível de sourceGuideStructured.",
    "- Quando o assunto usar símbolos, conectivos, comandos, fórmulas ou nomes curtos, registre isso em notationRules.",
    "- Não use description como substituto de sourceGuide.",
    "- Ao atualizar estrutura existente, use os textos atuais dos níveis afetados como base e devolva textos compatíveis com a mudança solicitada.",
    "- Se um nível estiver fixado, preserve exatamente o título informado pelo usuário.",
    "- Se o escopo estiver dentro de um curso existente, devolva somente os módulos e lições relevantes para esse curso.",
    "- Se o escopo estiver dentro de um módulo fixado, devolva exatamente um módulo com suas lições.",
    "- Se o escopo estiver dentro de uma lição fixada, devolva exatamente um curso, um módulo e uma lição.",
    "- Não inclua HTML, Markdown estrutural nem explicações fora do JSON.",
    "",
    "Formato obrigatório do JSON:",
    "{",
    '  "course": {',
    '    "title": "string",',
    '    "description": "string",',
    '    "modules": [',
    '      {',
    '        "title": "string",',
    '        "description": "string",',
    '        "lessons": [',
    '          {',
    '            "title": "string",',
    '            "description": "string",',
    '            "sourceGuide": "string",',
    '            "sourceGuideStructured": {',
    '              "lessonGoal": "string",',
    '              "notationRules": "string",',
    '              "commonErrors": "string"',
    "            }",
    "          }",
    "        ]",
    "      }",
    "    ]",
    "  }",
    "}"
  ].join("\n");
}

export function buildEditPrompt({ microsequence, card, dependencyTitles, promptText }) {
  const courseTitle = normalizeText(microsequence?.courseTitle) || "Curso atual";
  const courseDescription = normalizeText(microsequence?.courseDescription) || "não informado";
  const moduleTitle = normalizeText(microsequence?.moduleTitle) || "Módulo atual";
  const moduleDescription = normalizeText(microsequence?.moduleDescription) || "não informado";
  const lessonTitle = normalizeText(microsequence?.lessonTitle) || "Lição atual";
  const lessonDescription = normalizeText(microsequence?.lessonDescription) || "não informado";
  const microsequenceTitle = normalizeText(microsequence?.title) || "Microssequência atual";
  const cardTitle = normalizeText(card?.title) || "Card atual";
  const cardKind = getContractCardKind(card) || "say";
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags";

  return [
    `Curso: ${courseTitle}`,
    `Objetivo do curso: ${courseDescription}`,
    buildOptionalGuideLine("Fonte-guia do curso", microsequence?.courseSourceGuide),
    `Módulo: ${moduleTitle}`,
    `Objetivo do módulo: ${moduleDescription}`,
    buildOptionalGuideLine("Fonte-guia do módulo", microsequence?.moduleSourceGuide),
    `Lição: ${lessonTitle}`,
    `Objetivo da lição: ${lessonDescription}`,
    buildOptionalGuideLine("Fonte-guia da lição", microsequence?.lessonSourceGuide),
    `Microssequência: ${microsequenceTitle}`,
    buildOptionalGuideLine("Finalidade didática da microssequência", microsequence?.didacticPurpose),
    `Card atual: ${cardTitle}`,
    `Intenção atual: ${cardKind}`,
    `Tags explícitas: ${tags}`,
    "Tarefa: revisar apenas este card mantendo a mesma intenção principal.",
    "Não faça resumo genérico. Decomponha o ponto didático solicitado.",
    "Princípio didático: mostre antes de nomear, concretize antes de generalizar e não esconda a ponte do raciocínio.",
    "Restrições:",
    "- não use campo type, text, columns, rows, src, runtime, intent nem data;",
    "- use apenas o formato semântico raso do contrato;",
    "- não invente novas tags nem sinônimos de tags;",
    "- se o card for prática, mantenha no próprio card os dados, regras, fórmulas e notações necessários para resolver;",
    "- não introduza prática de regra ainda não ensinada na microssequência; nesse caso, transforme o card em microteoria ou exemplo simples;",
    "- se a explicação estiver abstrata demais para iniciante, concretize com caso pequeno, tabela curta ou exemplo guiado mantendo a mesma intenção do card;",
    "- se o card definir um conceito, acrescente exemplo mínimo, contraste ou quadro curto;",
    "- se houver notação pouco familiar para iniciante, traduza para linguagem comum antes de cobrar uso ou interpretação;",
    "- se o card usar recurso visual como `plane`, `table`, `matrix` ou `tree`, coloque no próprio card os valores, passos e conclusão que o aluno deve ler;",
    "- em recurso visual, destaque só o que o texto nomear explicitamente;",
    "- se usar `table`, prefira poucas linhas e poucas colunas; quando houver linha ou coluna decisiva, use `table.focus` com `label` curto para guiar a leitura;",
    "- não use linguagem de bastidor nem referência externa ou volátil como caderno, aula, prova, material, trecho acima ou equivalente;",
    "- não mantenha exercício cuja resposta já esteja explicitamente dada no mesmo card por texto, legenda, nota ou fórmula pronta; nesse caso, separe a explicação e a prática;",
    "- não use feedback que já interprete o resultado final se o aluno ainda não foi ensinado a montar ou ler a conta; confirme primeiro a etapa operacional;",
    "- em prática de iniciante, reduza o salto de raciocínio ao mínimo e cobre primeiro reconhecimento de padrão antes de combinação de ideias novas;",
    "- se a explicação ficar pesada demais, divida em mais cards em vez de comprimir tudo num quadro largo ou denso;",
    "- se a figura existir para justificar um resultado, escreva esse resultado explicitamente no próprio card em vez de deixá-lo implícito na imagem;",
    "- não use prática que apenas peça para repetir uma resposta já visível por destaque ou posição óbvia;",
    "- destaque símbolos, conectivos, comandos, fórmulas e nomes curtos com acentos graves;",
    "- não repita o título do card no corpo nem como título interno;",
    `Pedido do usuário: ${promptText}`
  ].join("\n");
}

export function buildRepositionPrompt({ microsequence, dependencyTitles, promptText, destinationSlots }) {
  const microsequenceTitle = normalizeText(microsequence?.title) || "Microssequência atual";
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags";
  const destinations = (destinationSlots || [])
    .map((item) => {
      const placement = item.insertBeforeMicrosequenceKey ? `antes de ${item.insertBeforeTitle}` : `após ${item.insertAfterTitle}`;
      return [
        `- slotId: ${item.slotId}`,
        `  curso: ${item.courseTitle}`,
        `  módulo: ${item.moduleTitle}`,
        `  lição: ${item.lessonTitle}`,
        `  posição: ${placement}`,
        `  sequência da tag até o fim: ${item.sequenceTitles.join(" -> ")}`
      ].join("\n");
    })
    .join("\n");

  return [
    `Microssequência: ${microsequenceTitle}`,
    `Tags explícitas: ${tags}`,
    "Tarefa: escolher o slot mais apropriado para reposicionar esta microssequência.",
    "Restrições:",
    "- escolha apenas um slot listado;",
    "- devolva exatamente o slotId escolhido;",
    "- se precisar acomodar a nomenclatura, renomeie apenas microssequências da lição de destino;",
    "- cada renomeação deve apontar para microsequenceKey existente na lição de destino;",
    `Pedido do usuário: ${promptText}`,
    "Slots disponíveis:",
    destinations || "- nenhuma lição disponível"
  ].join("\n");
}

export function normalizeEditResult(value) {
  return sanitizeContractCard(value);
}

export function normalizeRepositionResult(value) {
  const slotId = normalizeText(value?.slotId);
  const renames = Array.isArray(value?.renames)
    ? value.renames.map((item) => ({
        microsequenceKey: normalizeText(item?.microsequenceKey),
        title: normalizeText(item?.title)
      }))
    : null;

  if (!slotId || !renames || renames.some((item) => !item.microsequenceKey || !item.title)) {
    fail("O serviço de IA devolveu um slot inválido para o reposicionamento da microssequência.");
  }

  return { slotId, renames };
}

export function normalizeLadderResult(value) {
  const title = normalizeText(value?.title) || "Escada de microssequências";
  const seen = new Set();
  const steps = Array.isArray(value?.steps)
    ? value.steps
        .map((item) => ({ title: normalizeText(item?.title) }))
        .filter((item) => {
          if (!item.title) {
            return false;
          }
          const key = item.title.toLowerCase();
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        })
        .slice(0, 7)
    : [];

  if (steps.length < 2) {
    fail("O serviço de IA devolveu poucos títulos de microssequências.");
  }

  return { title, steps };
}

export function normalizeStructureResult(value) {
  const course = value?.course && typeof value.course === "object" ? value.course : null;
  const courseTitle = normalizeText(course?.title);
  const courseDescription = normalizeText(course?.description);

  const modules = Array.isArray(course?.modules)
    ? course.modules
        .map((moduleValue) => {
          const moduleTitle = normalizeText(moduleValue?.title);
          const moduleDescription = normalizeText(moduleValue?.description);
          const lessons = Array.isArray(moduleValue?.lessons)
            ? moduleValue.lessons
                .map((lesson) => {
                  const lessonSourceGuideStructured = sanitizeSourceGuideStructuredForModel(lesson?.sourceGuideStructured, {
                    level: SOURCE_GUIDE_LEVELS.LESSON
                  });
                  const lessonSourceGuide = buildSourceGuideTextForModel(lessonSourceGuideStructured, {
                    level: SOURCE_GUIDE_LEVELS.LESSON
                  });
                  const lessonGuidance = normalizeLessonGuidance(lesson);
                  return {
                    title: normalizeText(lesson?.title),
                    description: normalizeText(lesson?.description),
                    sourceGuide: lessonSourceGuide,
                    sourceGuideStructured: lessonSourceGuideStructured,
                    ...lessonGuidance
                  };
                })
                .filter((lesson) => lesson.title && lesson.description && lesson.sourceGuide && Object.keys(lesson.sourceGuideStructured).length)
            : [];

          if (!moduleTitle || !moduleDescription || !lessons.length) {
            return null;
          }

          const seenLessons = new Set();
          return {
            title: moduleTitle,
            description: moduleDescription,
            lessons: lessons.filter((lesson) => {
              const key = lesson.title.toLowerCase();
              if (seenLessons.has(key)) {
                return false;
              }
              seenLessons.add(key);
              return true;
            })
          };
        })
        .filter(Boolean)
    : [];

  if (!courseTitle || !courseDescription || !modules.length) {
    fail("O serviço de IA devolveu uma estrutura de curso incompleta.");
  }

  const seenModules = new Set();
  return {
    course: {
      title: courseTitle,
      description: courseDescription,
      modules: modules.filter((moduleValue) => {
        const key = moduleValue.title.toLowerCase();
        if (seenModules.has(key)) {
          return false;
        }
        seenModules.add(key);
        return true;
      })
    }
  };
}
