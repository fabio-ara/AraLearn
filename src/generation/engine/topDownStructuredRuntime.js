import { applyProjectPatch } from "../../core/patch.js";
import { plannedCourseToProjectPatch } from "../topDown/plannedCourseToProjectPatch.js";
import { validatePlannedCourse } from "../topDown/validatePlannedCourse.js";

const TOP_DOWN_STRUCTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["course"],
  properties: {
    course: {
      type: "object",
      additionalProperties: false,
      required: ["title", "goal", "modules"],
      properties: {
        title: { type: "string" },
        goal: { type: "string" },
        modules: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "lessons"],
            properties: {
              title: { type: "string" },
              lessons: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "microsequences"],
                  properties: {
                    title: { type: "string" },
                    microsequences: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["title", "goal", "role", "dependsOn", "covers", "checks"],
                        properties: {
                          title: { type: "string" },
                          goal: { type: "string" },
                          role: { type: "string", enum: ["explain", "practice", "review", "support"] },
                          dependsOn: { type: "array", items: { type: "string" } },
                          covers: { type: "array", minItems: 1, items: { type: "string" } },
                          checks: { type: "array", minItems: 1, items: { type: "string" } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

const TOP_DOWN_AUDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["patches"],
  properties: {
    patches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["target", "updates"],
        properties: {
          target: { type: "string" },
          updates: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["field", "value"],
              properties: {
                field: {
                  type: "string",
                  enum: ["dependsOn", "goal", "covers", "checks", "moveAfter"]
                },
                value: { type: "string" }
              }
            }
          }
        }
      }
    }
  }
};

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value = "", maxLength = 12000) {
  const normalized = text(value);
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength)}\n[conteúdo truncado pelo limite de contexto]`;
}

function buildGenerationContext(attachments = [], didacticPolicy = {}) {
  const sourceSections = (Array.isArray(attachments) ? attachments : [])
    .map((attachment, index) => {
      const content = truncate(attachment?.textContent);
      if (!content) {
        return "";
      }
      const title = text(attachment?.displayName || attachment?.name) || `Anexo ${index + 1}`;
      return `### ${title}\n${content}`;
    })
    .filter(Boolean);
  return [
    "CONTEXTO DIDÁTICO CONFIGURADO:",
    JSON.stringify(didacticPolicy && typeof didacticPolicy === "object" ? didacticPolicy : {}, null, 2),
    "",
    "FONTES EXTRAÍDAS DOS ANEXOS:",
    sourceSections.length ? sourceSections.join("\n\n") : "(sem anexo textual)"
  ].join("\n");
}

function buildTopDownCorrectionPrompt(scopeContract, issues = [], generationContext = "") {
  return [
    "Fase: top_down_structure",
    "Corrija somente os problemas abaixo no objeto estruturado.",
    ...issues.map((item) => `- ${item}`),
    "Use exatamente a quantidade de módulos do escopo.",
    "Cada módulo precisa de lições.",
    "Distribua todos os itens de include entre lições e microssequências.",
    "Não repita o pedido bruto do usuário em guide.goal.",
    generationContext,
    JSON.stringify(scopeContract, null, 2)
  ].join("\n\n");
}

function buildTopDownPrompt(scopeContract, generationContext = "") {
  return [
    "AraLearn top-down structured runtime.",
    "Planeje curso, módulos, lições e microssequências.",
    "Não gere cards.",
    "Use exatamente a quantidade de módulos do escopo.",
    "Cada módulo precisa de lições e cada lição precisa de microssequências.",
    "Cada microssequência precisa de title, goal, role, dependsOn, covers e checks.",
    "dependsOn só pode usar títulos anteriores da mesma lição.",
    "Use as fontes e o contexto didático abaixo para delimitar profundidade, progressão e vocabulário.",
    generationContext,
    JSON.stringify(scopeContract, null, 2)
  ].join("\n\n");
}

function buildTopDownAuditReferenceLines(plannedCourse) {
  return (plannedCourse?.course?.modules || []).flatMap((moduleValue) =>
    (moduleValue.lessons || []).map((lesson) => `Lição ${lesson.title}: ${(lesson.microsequences || []).map((item) => item.title).join(" | ")}`)
  );
}

function buildTopDownAuditPrompt(plannedCourse, generationContext = "") {
  return [
    "AraLearn top-down structure audit.",
    "Audite dependências, progressão, cobertura e escopo.",
    "Produza patches atômicos no objeto estruturado.",
    "Cada patch identifica uma microssequência por target e contém updates de field/value.",
    "Use | para separar valores de dependsOn, covers e checks.",
    "Se não houver correção a fazer, devolva patches vazio.",
    "Se a ordem e as dependências já estiverem coerentes, não crie novas dependsOn nem moveAfter.",
    "Não altere role.",
    "Nunca produza dependsOn ou moveAfter vazios. Se não usar, omita o update.",
    "dependsOn e moveAfter só podem citar títulos de microssequências, nunca títulos de lições.",
    generationContext,
    ...buildTopDownAuditReferenceLines(plannedCourse),
    JSON.stringify(plannedCourse, null, 2)
  ].join("\n\n");
}

function normalizeToken(value = "") {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => text(item)).filter(Boolean))];
}

function pickDependsOn(microsequence = {}) {
  return unique(
    Array.isArray(microsequence?.dependsOn)
      ? microsequence.dependsOn
      : typeof microsequence?.dependsOn === "string"
        ? microsequence.dependsOn.split("|")
        : []
  );
}

function inferIncludeMatches(sourceText = "", include = []) {
  const normalizedSource = normalizeToken(sourceText);
  return unique(include).filter((item) => normalizedSource.includes(normalizeToken(item)));
}

function overlapMatches(left = "", right = "") {
  const normalizedLeft = normalizeToken(left);
  const normalizedRight = normalizeToken(right);
  return normalizedLeft && normalizedRight && (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft));
}

function inferRole(microsequence = {}) {
  const source = normalizeToken(`${microsequence?.title || ""} ${microsequence?.operation || ""} ${microsequence?.questionKind || ""}`);
  if (/pratica|practice|question|identify|choose|locate|transpose/.test(source)) {
    return "practice";
  }
  return "explain";
}

function buildChecksFromCovers(covers = []) {
  return unique(covers).map((item) => `o aluno reconhece ${item}`);
}

function normalizeTopDownShape(rawPlan, scopeContract) {
  const scopeModule = Array.isArray(scopeContract?.modules) ? scopeContract.modules[0] : {};
  const sourceModules = Array.isArray(rawPlan?.course?.modules)
    ? rawPlan.course.modules
    : Array.isArray(rawPlan?.modules)
      ? rawPlan.modules
      : [];
  const normalizedModules = sourceModules.slice(0, Math.max(1, (scopeContract?.modules || []).length)).map((moduleValue, moduleIndex) => {
    const include = unique(moduleValue?.include?.length ? moduleValue.include : scopeModule.include);
    const exclude = unique(moduleValue?.exclude?.length ? moduleValue.exclude : scopeModule.exclude);
    const lessons = Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : [];
    const normalizedLessons = lessons.map((lesson, lessonIndex) => {
      const lessonSignals = inferIncludeMatches(
        `${lesson?.title || ""} ${(lesson.microsequences || []).map((item) => item?.title || "").join(" ")}`,
        include
      );
      const lessonInclude = lessonSignals.length ? lessonSignals : [include[Math.min(lessonIndex, Math.max(0, include.length - 1))]].filter(Boolean);
      const normalizedMicrosequences = (Array.isArray(lesson?.microsequences) ? lesson.microsequences : []).map((microsequence, microIndex) => {
        const coverSignals = inferIncludeMatches(`${microsequence?.title || ""} ${microsequence?.goal || ""}`, lessonInclude);
        const covers = coverSignals.length
          ? coverSignals
          : [lessonInclude[Math.min(microIndex, Math.max(0, lessonInclude.length - 1))]].filter(Boolean);
        return {
          id: text(microsequence?.id),
          title: text(microsequence?.title) || `Microssequência ${microIndex + 1}`,
          goal: text(microsequence?.goal) || `Trabalhar ${covers.join(" e ")} em caso curto.`,
          role: inferRole(microsequence),
          dependsOn: pickDependsOn(microsequence),
          covers,
          checks: buildChecksFromCovers(covers)
        };
      });
      const normalizedLessonInclude = unique([
        ...lessonInclude,
        ...normalizedMicrosequences.flatMap((microsequence) => microsequence.covers || [])
      ]);
      return {
        title: text(lesson?.title) || `Lição ${lessonIndex + 1}`,
        guide: {
          goal: `Trabalhar ${normalizedLessonInclude.join(" e ")} dentro do recorte do módulo.`,
          include: normalizedLessonInclude,
          exclude,
          notation: [],
          avoid: []
        },
        microsequences: normalizedMicrosequences
      };
    });
    return {
      title: text(moduleValue?.title) || text(scopeModule?.title) || `Módulo ${moduleIndex + 1}`,
      guide: {
        goal: `Cobrir ${include.join(", ")} sem sair do recorte do módulo.`,
        include,
        exclude,
        notation: [],
        avoid: []
      },
      lessons: normalizedLessons
    };
  });
  return {
    course: {
      title: text(rawPlan?.course?.title) || text(scopeContract?.course?.title),
      goal: text(rawPlan?.course?.goal) || text(scopeContract?.course?.goal),
      modules: normalizedModules
    }
  };
}

function repairLessonDependencies(lessons = []) {
  return (Array.isArray(lessons) ? lessons : []).map((lesson) => {
    const seen = [];
    const microsequences = (Array.isArray(lesson?.microsequences) ? lesson.microsequences : []).map((microsequence) => {
      const repairedDependsOn = unique(microsequence?.dependsOn).map((dependencyRef) => {
        const exact = seen.find((item) => normalizeToken(item.title) === normalizeToken(dependencyRef));
        if (exact) {
          return exact.title;
        }
        const semantic = [...seen].reverse().find((item) =>
          overlapMatches(item.title, dependencyRef)
          || (Array.isArray(item.covers) && item.covers.some((cover) => overlapMatches(cover, dependencyRef)))
        );
        return semantic?.title || "";
      }).filter(Boolean);
      const next = {
        ...microsequence,
        dependsOn: repairedDependsOn
      };
      seen.push(next);
      return next;
    });
    return {
      ...lesson,
      microsequences
    };
  });
}

function repairCoverageGaps(plannedCourse) {
  const next = structuredClone(plannedCourse);
  (next?.course?.modules || []).forEach((moduleValue) => {
    const moduleCovered = new Set();
    moduleValue.lessons = repairLessonDependencies(moduleValue.lessons || []);
    (moduleValue.lessons || []).forEach((lesson) => {
      const lessonCovered = new Set();
      (lesson.microsequences || []).forEach((microsequence) => {
        unique(microsequence.covers).forEach((item) => {
          lessonCovered.add(item);
          moduleCovered.add(item);
        });
      });
      const missingLessonIncludes = unique(lesson?.guide?.include).filter((item) => !lessonCovered.has(item));
      if (missingLessonIncludes.length && Array.isArray(lesson.microsequences) && lesson.microsequences.length) {
        lesson.microsequences[0].covers = unique([...(lesson.microsequences[0].covers || []), ...missingLessonIncludes]);
        lesson.microsequences[0].checks = unique([...(lesson.microsequences[0].checks || []), ...buildChecksFromCovers(missingLessonIncludes)]);
      }
    });
    const missingModuleIncludes = unique(moduleValue?.guide?.include).filter((item) => !moduleCovered.has(item));
    if (missingModuleIncludes.length && Array.isArray(moduleValue.lessons) && moduleValue.lessons.length) {
      const targetLesson = moduleValue.lessons[moduleValue.lessons.length - 1];
      targetLesson.guide.include = unique([...(targetLesson.guide.include || []), ...missingModuleIncludes]);
      if (Array.isArray(targetLesson.microsequences) && targetLesson.microsequences.length) {
        targetLesson.microsequences[0].covers = unique([...(targetLesson.microsequences[0].covers || []), ...missingModuleIncludes]);
        targetLesson.microsequences[0].checks = unique([...(targetLesson.microsequences[0].checks || []), ...buildChecksFromCovers(missingModuleIncludes)]);
      }
    }
  });
  return next;
}

function splitPipeList(value = "") {
  return value.split("|").map((item) => text(item)).filter(Boolean);
}

function findMicrosequenceEntries(plannedCourse) {
  return (plannedCourse?.course?.modules || []).flatMap((moduleValue) =>
    (moduleValue.lessons || []).flatMap((lesson) =>
      (lesson.microsequences || []).map((microsequence, index) => ({
        moduleValue,
        lesson,
        microsequence,
        index
      }))
    )
  );
}

function countTopDownDependencyErrors(plannedCourse = {}) {
  let dependencyErrors = 0;
  (plannedCourse?.course?.modules || []).forEach((moduleValue) => {
    (moduleValue.lessons || []).forEach((lesson) => {
      const seenTitles = [];
      (lesson.microsequences || []).forEach((microsequence) => {
        const deps = Array.isArray(microsequence?.dependsOn) ? microsequence.dependsOn.map((item) => text(item)).filter(Boolean) : [];
        deps.forEach((dependency) => {
          if (!seenTitles.includes(dependency)) {
            dependencyErrors += 1;
          }
        });
        seenTitles.push(text(microsequence?.title));
      });
    });
  });
  return dependencyErrors;
}

function validateTopDownAuditPatches(plannedCourse, parsed = {}) {
  const errors = [];
  const entries = findMicrosequenceEntries(plannedCourse);
  const titleSet = new Set(entries.map((entry) => normalizeToken(entry.microsequence.title)));
  (parsed.invalidPatches || []).forEach((item) => errors.push(item.reason));
  (parsed.invalidGlobalLines || []).forEach((item) => errors.push(item.reason));
  (parsed.patches || []).forEach((patch) => {
    if (!text(patch.target)) {
      errors.push("patch top-down sem target.");
      return;
    }
    const targetEntry = entries.find((entry) => normalizeToken(entry.microsequence.title) === normalizeToken(patch.target));
    if (!targetEntry) {
      errors.push(`target inexistente no top-down audit: ${patch.target}.`);
      return;
    }
    Object.entries(patch.fields || {}).forEach(([fieldName, fieldValue]) => {
      if (!text(fieldValue) && fieldName !== "dependsOn") {
        errors.push(`patch top-down com ${fieldName} vazio em ${patch.target}.`);
      }
      if ((fieldName === "dependsOn" || fieldName === "moveAfter") && text(fieldValue)) {
        splitPipeList(fieldValue).forEach((dependencyRef) => {
          if (!titleSet.has(normalizeToken(dependencyRef))) {
            errors.push(`referência inexistente em ${fieldName}: ${dependencyRef}.`);
          }
        });
      }
    });
  });
  return {
    ok: errors.length === 0,
    errors
  };
}

function applyAuditPatches(plannedCourse, patches = []) {
  const next = structuredClone(plannedCourse);
  const appliedPatches = [];
  const entries = findMicrosequenceEntries(next);
  (Array.isArray(patches) ? patches : []).forEach((patch) => {
    const targetEntry = entries.find((entry) => normalizeToken(entry.microsequence.title) === normalizeToken(patch.target));
    if (!targetEntry) {
      return;
    }
    const target = targetEntry.microsequence;
    Object.entries(patch.fields || {}).forEach(([fieldName, fieldValue]) => {
      if (fieldName === "dependsOn" || fieldName === "covers" || fieldName === "checks") {
        target[fieldName] = splitPipeList(fieldValue);
        return;
      }
      if (fieldName === "moveAfter" && text(fieldValue)) {
        const lessonItems = targetEntry.lesson.microsequences || [];
        const currentIndex = lessonItems.findIndex((item) => item.title === target.title);
        const moveAfterIndex = lessonItems.findIndex((item) => normalizeToken(item.title) === normalizeToken(fieldValue));
        if (currentIndex >= 0 && moveAfterIndex >= 0 && currentIndex !== moveAfterIndex) {
          const [item] = lessonItems.splice(currentIndex, 1);
          lessonItems.splice(moveAfterIndex + 1, 0, item);
        }
        return;
      }
      target[fieldName] = fieldValue;
    });
    appliedPatches.push({
      target: patch.target,
      fields: structuredClone(patch.fields || {})
    });
  });
  return {
    plannedCourse: next,
    appliedPatches
  };
}

function buildTopDownAuditCorrectionPrompt(plannedCourse, issues = [], generationContext = "") {
  return [
    "AraLearn top-down structure audit correction.",
    "Corrija somente as dependências, checks, covers ou ordem problemática.",
    "Produza apenas patches atômicos estruturados; use patches vazio se nada precisar mudar.",
    "Não altere role.",
    "Nunca produza dependsOn ou moveAfter vazios. Se não usar, omita o update.",
    "dependsOn e moveAfter só podem citar títulos de microssequências, nunca títulos de lições.",
    ...issues.map((item) => `- ${item}`),
    generationContext,
    ...buildTopDownAuditReferenceLines(plannedCourse),
    JSON.stringify(plannedCourse, null, 2)
  ].join("\n\n");
}

export async function planCourseFromScopeStructured({
  scopeContract,
  provider,
  modelId,
  project,
  logger,
  attachments = [],
  didacticPolicy = {}
} = {}) {
  if (!provider?.generateStructured) {
    throw new Error("Provider sem generateStructured para top-down estruturado.");
  }
  const generationContext = buildGenerationContext(attachments, didacticPolicy);
  const initialStructurePrompt = buildTopDownPrompt(scopeContract, generationContext);
  let plannedCourse = null;
  let validation = null;
  let structurePrompt = initialStructurePrompt;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const startedAt = Date.now();
    const structureResult = await provider.generateStructured({
      modelId,
      phase: "top_down_structure",
      system: "Planeje uma estrutura didática estritamente conforme o schema.",
      prompt: structurePrompt,
      schemaName: "aralearn_top_down_structure_v4",
      schema: TOP_DOWN_STRUCTURE_SCHEMA,
      temperature: attempt === 1 ? 0.1 : 0,
      maxTokens: 8000
    });
    logger?.log({
      phase: "top_down_structure",
      model: modelId,
      usage: structureResult.usage,
      latencyMs: Date.now() - startedAt,
      structuredOutput: structureResult.value
    });
    plannedCourse = repairCoverageGaps(normalizeTopDownShape(structureResult.value, scopeContract));
    validation = validatePlannedCourse(plannedCourse, scopeContract);
    if (validation.ok) {
      break;
    }
    if (attempt >= 3) {
      throw new Error(validation.errors.map((item) => `${item.path}: ${item.message}`).join("; "));
    }
    structurePrompt = buildTopDownCorrectionPrompt(
      scopeContract,
      validation.errors.map((item) => `${item.path}: ${item.message}`),
      generationContext
    );
  }

  let auditPrompt = buildTopDownAuditPrompt(plannedCourse, generationContext);
  let appliedTopDownPatches = [];
  const rejectedTopDownPatches = [];
  const dependencyErrorsBeforeAudit = countTopDownDependencyErrors(plannedCourse);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const auditStartedAt = Date.now();
    const auditResult = await provider.generateStructured({
      modelId,
      phase: "top_down_structure_audit",
      system: "Audite e devolva somente patches atômicos conformes ao schema.",
      prompt: auditPrompt,
      schemaName: "aralearn_top_down_audit_v4",
      schema: TOP_DOWN_AUDIT_SCHEMA,
      temperature: 0,
      maxTokens: 4000
    });
    const parsedAudit = {
      patches: (auditResult.value?.patches || []).map((patch) => ({
        target: patch.target,
        fields: Object.fromEntries((patch.updates || []).map((update) => [update.field, update.value]))
      }))
    };
    logger?.log({
      phase: "top_down_structure_audit",
      model: modelId,
      usage: auditResult.usage,
      latencyMs: Date.now() - auditStartedAt,
      structuredOutput: auditResult.value,
      parsedPatches: parsedAudit
    });
    const patchValidation = validateTopDownAuditPatches(plannedCourse, parsedAudit);
    const canTreatAsNoop =
      !parsedAudit.patches.length
      && validatePlannedCourse(plannedCourse, scopeContract).ok;
    if (canTreatAsNoop) {
      appliedTopDownPatches = [];
      validation = validatePlannedCourse(plannedCourse, scopeContract);
      break;
    }
    if (!patchValidation.ok) {
      if (attempt >= 3) {
        throw new Error(patchValidation.errors.join("; "));
      }
      auditPrompt = buildTopDownAuditCorrectionPrompt(plannedCourse, patchValidation.errors, generationContext);
      continue;
    }
    const patched = applyAuditPatches(plannedCourse, parsedAudit.patches);
    const dependencyErrorsAfterAudit = countTopDownDependencyErrors(patched.plannedCourse);
    if (
      dependencyErrorsAfterAudit > dependencyErrorsBeforeAudit
      || (dependencyErrorsBeforeAudit === 0 && dependencyErrorsAfterAudit > 0)
      || (dependencyErrorsBeforeAudit > 0 && dependencyErrorsAfterAudit >= dependencyErrorsBeforeAudit)
    ) {
      const rejectionReason = `patch top-down piorou dependências: antes=${dependencyErrorsBeforeAudit}; depois=${dependencyErrorsAfterAudit}`;
      rejectedTopDownPatches.push({
        attempt,
        reason: rejectionReason,
        patches: structuredClone(parsedAudit.patches || [])
      });
      if (attempt >= 3) {
        throw new Error(rejectionReason);
      }
      auditPrompt = buildTopDownAuditCorrectionPrompt(
        plannedCourse,
        [rejectionReason, "Corrija dependsOn e moveAfter sem introduzir dependência futura, inexistente ou redundante."],
        generationContext
      );
      continue;
    }
    const candidateCourse = repairCoverageGaps(patched.plannedCourse);
    plannedCourse = candidateCourse;
    appliedTopDownPatches = patched.appliedPatches;
    validation = validatePlannedCourse(plannedCourse, scopeContract);
    if (validation.ok) {
      break;
    }
    if (!parsedAudit.patches.length) {
      if (attempt >= 3) {
        throw new Error("Auditoria top-down não corrigiu os problemas detectados.");
      }
      auditPrompt = buildTopDownAuditCorrectionPrompt(
        plannedCourse,
        validation.errors.map((item) => `${item.path}: ${item.message}`),
        generationContext
      );
      continue;
    }
    if (attempt >= 3) {
      throw new Error(validation.errors.map((item) => `${item.path}: ${item.message}`).join("; "));
    }
    auditPrompt = buildTopDownAuditCorrectionPrompt(
      plannedCourse,
      validation.errors.map((item) => `${item.path}: ${item.message}`),
      generationContext
    );
  }
  if (!validation?.ok) {
    throw new Error(validation.errors.map((item) => `${item.path}: ${item.message}`).join("; "));
  }
  const patch = plannedCourseToProjectPatch(validation.value);
  return {
    scopeContract,
    plannedCourse: validation.value,
    patch,
    project: applyProjectPatch(project, patch),
    appliedTopDownPatches,
    rejectedTopDownPatches,
    dependencyErrorsBeforeAudit,
    dependencyErrorsAfterAudit: countTopDownDependencyErrors(validation.value)
  };
}
