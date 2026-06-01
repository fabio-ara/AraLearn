import { finalizeValidation, isPlainObject, pushError } from "../../core/validation.js";
import { normalizeLabelToken } from "../../core/text.js";
import { buildScopedKey } from "../../core/ids.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => text(item)).filter(Boolean))];
}

function canonicalLabelMap(values = []) {
  const map = new Map();
  unique(values).forEach((item) => {
    map.set(normalizeLabelToken(item), item);
  });
  return map;
}

function canonicalizeToScope(values = [], scopeMap = new Map()) {
  return unique(values).map((item) => scopeMap.get(normalizeLabelToken(item)) || text(item)).filter(Boolean);
}

function containsForbiddenTerm(sourceText, forbiddenTerms = []) {
  const source = normalizeLabelToken(sourceText);
  return (Array.isArray(forbiddenTerms) ? forbiddenTerms : []).some((term) => {
    const normalized = normalizeLabelToken(term);
    return normalized && source.includes(normalized);
  });
}

function contentTokens(value) {
  return unique(
    normalizeLabelToken(value)
      .split(/[^a-z0-9]+/u)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4)
  );
}

function overlapRatio(leftText, rightText) {
  const left = contentTokens(leftText);
  const right = new Set(contentTokens(rightText));
  if (!left.length || !right.size) {
    return 0;
  }
  let matches = 0;
  left.forEach((token) => {
    if (right.has(token)) {
      matches += 1;
    }
  });
  return matches / left.length;
}

function looksLikeUserRequest(value) {
  const source = normalizeLabelToken(value);
  if (!source) {
    return false;
  }

  return (
    /\b(estou|quero|preciso|precisar|meu|minha|tenho dificuldade|estudar para|resolver exercicios|resolver exercicios de prova)\b/u.test(source)
    || /\b(seed|nao gerar cards|nao gerar card|fonte guia|operador|prova|lista de exercicios|apostila)\b/u.test(source)
  );
}

function isPromptLeakage(localGoal, referenceTexts = []) {
  const source = normalizeLabelToken(localGoal);
  if (!source) {
    return false;
  }

  return (Array.isArray(referenceTexts) ? referenceTexts : []).some((item) => {
    const reference = normalizeLabelToken(item);
    if (!reference || reference.length < 24) {
      return false;
    }
    const requestLikePair = looksLikeUserRequest(source) || looksLikeUserRequest(reference);
    return (
      source === reference
      || source.includes(reference)
      || reference.includes(source)
      || (requestLikePair && overlapRatio(source, reference) >= 0.6)
      || (requestLikePair && overlapRatio(source, reference) >= 0.35)
    );
  });
}

function hasCardsDeep(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasCardsDeep(item));
  }
  if ("cards" in value) {
    return true;
  }
  return Object.values(value).some((item) => hasCardsDeep(item));
}

function normalizeGuide(guide, fallback = {}) {
  return {
    goal: text(guide?.goal) || text(fallback?.goal),
    include: unique(Array.isArray(guide?.include) ? guide.include : fallback?.include),
    exclude: unique(Array.isArray(guide?.exclude) ? guide.exclude : fallback?.exclude),
    notation: unique(Array.isArray(guide?.notation) ? guide.notation : fallback?.notation),
    avoid: unique(Array.isArray(guide?.avoid) ? guide.avoid : fallback?.avoid)
  };
}

function uniqueIdFromTitle(title, seenIds = new Set()) {
  const baseId = buildScopedKey("microsequence", title || "microsequence");
  if (!seenIds.has(baseId)) {
    return baseId;
  }
  let suffix = 2;
  while (seenIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function validateGuideAgainstExclude(guide = {}, exclude = [], guidePath = "", errors = []) {
  if (containsForbiddenTerm(guide.goal, exclude)) {
    pushError(errors, `${guidePath}.goal`, "guide.goal cita item proibido em exclude.");
  }
  (Array.isArray(guide.notation) ? guide.notation : []).forEach((item, index) => {
    if (containsForbiddenTerm(item, exclude)) {
      pushError(errors, `${guidePath}.notation[${index}]`, "guide.notation cita item proibido em exclude.");
    }
  });
  (Array.isArray(guide.avoid) ? guide.avoid : []).forEach((item, index) => {
    if (containsForbiddenTerm(item, exclude)) {
      pushError(errors, `${guidePath}.avoid[${index}]`, "guide.avoid cita item proibido em exclude.");
    }
  });
}

function validateLessonDependencyGraph(microsequences = [], lessonPath, errors) {
  const ids = microsequences.map((item) => item.id);
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const titleById = new Map(microsequences.map((item) => [item.id, item.title || item.id]));
  const adjacency = new Map(ids.map((id) => [id, []]));

  microsequences.forEach((microsequence, microIndex) => {
    const microPath = `${lessonPath}.microsequences[${microIndex}]`;
    const currentIndex = indexById.get(microsequence.id);
    (Array.isArray(microsequence.dependsOn) ? microsequence.dependsOn : []).forEach((dependencyId) => {
      const dependencyIndex = indexById.get(dependencyId);
      if (dependencyIndex === undefined) {
        pushError(errors, `${microPath}.dependsOn`, `dependsOn aponta para microssequência inexistente na lição: ${dependencyId}.`);
        return;
      }
      if (dependencyId === microsequence.id) {
        pushError(errors, `${microPath}.dependsOn`, "dependsOn não pode apontar para a própria microssequência.");
      } else {
        adjacency.get(microsequence.id)?.push(dependencyId);
      }
      if (dependencyIndex >= currentIndex) {
        pushError(errors, `${microPath}.dependsOn`, `dependsOn não pode apontar para microssequência futura: ${titleById.get(dependencyId) || dependencyId}.`);
      }
    });
  });

  const visiting = new Set();
  const visited = new Set();
  const hasCycleFrom = (id) => {
    if (visiting.has(id)) {
      return true;
    }
    if (visited.has(id)) {
      return false;
    }
    visiting.add(id);
    const cycleFound = (adjacency.get(id) || []).some((dependencyId) => hasCycleFrom(dependencyId));
    visiting.delete(id);
    visited.add(id);
    return cycleFound;
  };

  ids.forEach((id) => {
    if (hasCycleFrom(id)) {
      pushError(errors, `${lessonPath}.microsequences`, "dependsOn forma ciclo dentro da lição.");
    }
  });
}

export function validatePlannedCourse(plannedCourse, scopeContract) {
  const errors = [];
  if (!isPlainObject(plannedCourse) || !isPlainObject(plannedCourse.course)) {
    return { ok: false, errors: [{ path: "$", message: "Saída top-down inválida." }] };
  }
  if (hasCardsDeep(plannedCourse.course)) {
    pushError(errors, "$.course", "Top-down não pode gerar cards.");
  }

  const normalizedCourse = {
    title: text(scopeContract?.course?.title) || text(plannedCourse.course.title),
    goal: text(scopeContract?.course?.goal) || text(plannedCourse.course.goal),
    modules: []
  };

  const plannedModules = Array.isArray(plannedCourse.course.modules) ? plannedCourse.course.modules : [];
  const scopeModules = Array.isArray(scopeContract?.modules) ? scopeContract.modules : [];
  if (plannedModules.length !== scopeModules.length) {
    pushError(errors, "$.course.modules", "A quantidade de módulos deve coincidir com o contrato de escopo.");
  }

  scopeModules.forEach((scopeModule, moduleIndex) => {
    const plannedModule = plannedModules[moduleIndex] || {};
    const include = unique(scopeModule.include);
    const exclude = unique(scopeModule.exclude);
    const includeMap = canonicalLabelMap(include);
    const excludeMap = canonicalLabelMap(exclude);
    const moduleGuide = normalizeGuide(plannedModule.guide, {
      goal: text(plannedModule?.goal) || text(scopeModule?.notes) || include.join(", "),
      include: canonicalizeToScope(include, includeMap),
      exclude: canonicalizeToScope(exclude, excludeMap),
      notation: [],
      avoid: []
    });
    moduleGuide.include = canonicalizeToScope(moduleGuide.include, includeMap);
    moduleGuide.exclude = canonicalizeToScope(moduleGuide.exclude, excludeMap);
    const modulePath = `$.course.modules[${moduleIndex}]`;

    validateGuideAgainstExclude(moduleGuide, exclude, `${modulePath}.guide`, errors);
    if (isPromptLeakage(moduleGuide.goal, [scopeContract?.course?.goal, scopeModule?.notes])) {
      pushError(errors, `${modulePath}.guide.goal`, "guide.goal do módulo não pode repetir o pedido bruto do usuário.");
    }
    include.forEach((item) => {
      if (!moduleGuide.include.includes(item)) {
        pushError(errors, `${modulePath}.guide.include`, `guide do módulo omite item obrigatório de include: ${item}.`);
      }
    });

    const lessons = Array.isArray(plannedModule.lessons) ? plannedModule.lessons : [];
    if (!lessons.length) {
      pushError(errors, `${modulePath}.lessons`, "Cada módulo precisa ter lições.");
    }

    const coveredByLessons = new Set();
    const normalizedLessons = lessons.map((lesson, lessonIndex) => {
      const lessonPath = `${modulePath}.lessons[${lessonIndex}]`;
      const lessonGuide = normalizeGuide(lesson.guide, {
        goal: text(lesson?.goal),
        include: canonicalizeToScope(include, includeMap),
        exclude: canonicalizeToScope(exclude, excludeMap),
        notation: [],
        avoid: []
      });
      lessonGuide.include = canonicalizeToScope(lessonGuide.include, includeMap);
      lessonGuide.exclude = canonicalizeToScope(lessonGuide.exclude, excludeMap);
      if (!lessonGuide.goal) {
        pushError(errors, `${lessonPath}.guide.goal`, "Toda lição precisa de guide.goal.");
      }
      validateGuideAgainstExclude(lessonGuide, exclude, `${lessonPath}.guide`, errors);
      lessonGuide.include.forEach((item) => {
        if (!include.includes(item)) {
          pushError(errors, `${lessonPath}.guide.include`, `guide da lição usa include fora do módulo: ${item}.`);
          return;
        }
        coveredByLessons.add(item);
      });
      const microsequences = Array.isArray(lesson.microsequences) ? lesson.microsequences : [];
      if (!microsequences.length) {
        pushError(errors, `${lessonPath}.microsequences`, "Toda lição precisa de microssequências.");
      }
      const seenIds = new Set();
      const seenTitles = new Set();
      const coveredByMicrosequences = new Set();
      const titleToId = new Map();
      const normalizedMicrosequences = microsequences.map((microsequence, microIndex) => {
        const microPath = `${lessonPath}.microsequences[${microIndex}]`;
        const title = text(microsequence?.title);
        if (!title) {
          pushError(errors, `${microPath}.title`, "Toda microssequência precisa de title.");
        }
        const normalizedTitle = normalizeLabelToken(title);
        if (normalizedTitle && seenTitles.has(normalizedTitle)) {
          pushError(errors, `${microPath}.title`, `Microssequência duplicada na lição: ${title}.`);
        }
        seenTitles.add(normalizedTitle);
        const id = uniqueIdFromTitle(title || `microsequence-${lessonIndex + 1}-${microIndex + 1}`, seenIds);
        seenIds.add(id);
        if (normalizedTitle) {
          titleToId.set(normalizedTitle, id);
        }
        const role = text(microsequence?.role);
        if (!["explain", "practice", "review", "support"].includes(role)) {
          pushError(errors, `${microPath}.role`, "role inválido na microssequência.");
        }
        const covers = canonicalizeToScope(microsequence?.covers, includeMap);
        if (!covers.length) {
          pushError(errors, `${microPath}.covers`, "Toda microssequência precisa cobrir itens do módulo.");
        }
        covers.forEach((item) => {
          if (!include.includes(item)) {
            pushError(errors, `${microPath}.covers`, `covers fora de include: ${item}.`);
          }
          if (exclude.includes(item)) {
            pushError(errors, `${microPath}.covers`, `covers usa item proibido: ${item}.`);
          }
          if (lessonGuide.include.includes(item)) {
            coveredByMicrosequences.add(item);
          }
        });
        if (containsForbiddenTerm([text(microsequence?.title), text(microsequence?.goal)].join(" "), exclude)) {
          pushError(errors, microPath, "Microssequência cita item proibido em exclude.");
        }
        return {
          id,
          title,
          goal: text(microsequence?.goal),
          role,
          dependsOn: unique(microsequence?.dependsOn),
          covers,
          checks: unique(microsequence?.checks)
        };
      });
      normalizedMicrosequences.forEach((microsequence, microIndex) => {
        const microPath = `${lessonPath}.microsequences[${microIndex}]`;
        microsequence.dependsOn = microsequence.dependsOn
          .map((dependencyRef) => {
            const normalizedDependencyRef = normalizeLabelToken(dependencyRef);
            const resolvedByTitle = titleToId.get(normalizedDependencyRef);
            if (resolvedByTitle) {
              return resolvedByTitle;
            }
            const resolvedById = normalizedMicrosequences.find((item) => item.id === dependencyRef)?.id || "";
            if (resolvedById) {
              return resolvedById;
            }
            pushError(errors, `${microPath}.dependsOn`, `dependsOn aponta para microssequência inexistente na lição: ${dependencyRef}.`);
            return "";
          })
          .filter(Boolean);
      });
      lessonGuide.include.forEach((item) => {
        if (!coveredByMicrosequences.has(item)) {
          pushError(errors, `${lessonPath}.microsequences`, `As microssequências da lição omitem item de guide.include: ${item}.`);
        }
      });
      validateLessonDependencyGraph(normalizedMicrosequences, lessonPath, errors);

      return {
        title: text(lesson.title),
        guide: lessonGuide,
        microsequences: normalizedMicrosequences
      };
    });
    include.forEach((item) => {
      if (!coveredByLessons.has(item)) {
        pushError(errors, `${modulePath}.lessons`, `As lições do módulo omitem item obrigatório de include: ${item}.`);
      }
    });

    normalizedCourse.modules.push({
      title: text(scopeModule.title) || text(plannedModule.title),
      guide: moduleGuide,
      lessons: normalizedLessons
    });
  });

  return finalizeValidation(errors, { course: normalizedCourse });
}
