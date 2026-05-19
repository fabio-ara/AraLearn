import { finalizeValidation, isPlainObject, pushError } from "../../core/validation.js";
import { normalizeLabelToken, normalizeWhitespace } from "../../core/text.js";

function containsForbiddenTerm(text, forbiddenTerms) {
  const source = normalizeLabelToken(text);
  return forbiddenTerms.some((term) => term && source.includes(term));
}

function resolveScopeLabel(scopeLabel, includeEntries = []) {
  const normalizedScopeLabel = normalizeLabelToken(scopeLabel);
  if (!normalizedScopeLabel) {
    return "";
  }
  const exact = includeEntries.find((entry) => entry.normalized === normalizedScopeLabel);
  if (exact) {
    return exact.label;
  }
  const containing = includeEntries.find((entry) =>
    entry.normalized.includes(normalizedScopeLabel) || normalizedScopeLabel.includes(entry.normalized)
  );
  return containing?.label || "";
}

function hasIncludeOverlap(text, includeEntries = []) {
  const source = normalizeLabelToken(text);
  if (!source) {
    return false;
  }
  return includeEntries.some((entry) => {
    const normalized = entry?.normalized || "";
    return normalized && (source.includes(normalized) || normalized.includes(source));
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

export function validatePlannedCourse(plannedCourse, scopeContract) {
  const errors = [];
  if (!isPlainObject(plannedCourse) || !isPlainObject(plannedCourse.course)) {
    return { ok: false, errors: [{ path: "$", message: "Saída top-down inválida." }] };
  }
  if (hasCardsDeep(plannedCourse.course)) {
    pushError(errors, "$.course", "Top-down não pode gerar cards.");
  }

  if (scopeContract?.course?.title) {
    plannedCourse.course.title = scopeContract.course.title;
  }
  const plannedTitle = normalizeWhitespace(plannedCourse.course.title);
  if (!plannedTitle) {
    pushError(errors, "$.course.title", "Curso planejado sem título.");
  }
  const plannedModules = Array.isArray(plannedCourse.course.modules) ? plannedCourse.course.modules : [];
  if (plannedModules.length !== scopeContract.modules.length) {
    pushError(errors, "$.course.modules", "A quantidade de módulos deve coincidir com o contrato de escopo.");
  }

  plannedModules.forEach((moduleValue, moduleIndex) => {
    const scopeModule = scopeContract.modules[moduleIndex];
    const path = `$.course.modules[${moduleIndex}]`;
    if (scopeModule?.title) {
      moduleValue.title = scopeModule.title;
    }
    if (scopeModule?.include?.length) {
      moduleValue.include = [...scopeModule.include];
    }
    if (Array.isArray(scopeModule?.exclude)) {
      moduleValue.exclude = [...scopeModule.exclude];
    }
    if (scopeModule?.notes) {
      moduleValue.notes = scopeModule.notes;
    }
    if (scopeModule?.assessmentStyle) {
      moduleValue.assessmentStyle = scopeModule.assessmentStyle;
    }
    const title = normalizeWhitespace(moduleValue?.title);
    if (!title) {
      pushError(errors, `${path}.title`, "Módulo planejado sem título.");
    }

    const lessons = Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : [];
    if (!lessons.length) {
      pushError(errors, `${path}.lessons`, "Cada módulo precisa ter lições.");
    }

    const includeEntries = (scopeModule?.include || []).map((item) => ({
      label: item,
      normalized: normalizeLabelToken(item)
    }));
    const includeLabels = new Set(includeEntries.map((entry) => entry.normalized).filter(Boolean));
    const excludeLabels = (scopeModule?.exclude || []).map((item) => normalizeLabelToken(item));

    lessons.forEach((lesson, lessonIndex) => {
      const lessonPath = `${path}.lessons[${lessonIndex}]`;
      const lessonTitle = normalizeWhitespace(lesson?.title);
      const lessonGoal = normalizeWhitespace(lesson?.goal);
      const lessonGuide = lesson?.sourceGuideStructured && typeof lesson.sourceGuideStructured === "object"
        ? lesson.sourceGuideStructured
        : {};
      const lessonGuideOutOfScope = normalizeWhitespace(scopeModule?.exclude?.join(", "));
      const lessonGuideGoal = normalizeWhitespace(lessonGuide?.lessonGoal);
      const lessonGuideInclude = normalizeWhitespace(lessonGuide?.notationRules);
      const lessonGuidePitfall = normalizeWhitespace(lessonGuide?.commonErrors);
      if (lesson?.sourceGuideStructured && typeof lesson.sourceGuideStructured === "object" && lessonGuideOutOfScope) {
        lesson.sourceGuideStructured.outOfScopeRules = lessonGuideOutOfScope;
      }
      if (!lessonTitle) {
        pushError(errors, `${lessonPath}.title`, "Lição planejada sem título.");
      }
      if (!lessonGoal) {
        pushError(errors, `${lessonPath}.goal`, "Lição planejada sem objetivo.");
      }
      if (!lessonGuideGoal) {
        pushError(errors, `${lessonPath}.sourceGuideStructured.lessonGoal`, "Lição planejada sem meta da lição.");
      }
      if (!lessonGuideInclude) {
        pushError(errors, `${lessonPath}.sourceGuideStructured.notationRules`, 'Lição planejada sem campo "Incluir".');
      }
      if (lessonGuideInclude && !hasIncludeOverlap(lessonGuideInclude, includeEntries)) {
        pushError(errors, `${lessonPath}.sourceGuideStructured.notationRules`, 'Campo "Incluir" deve reaproveitar literalmente ao menos um item do include do módulo.');
      }
      if (!lessonGuidePitfall) {
        pushError(errors, `${lessonPath}.sourceGuideStructured.commonErrors`, 'Lição planejada sem campo "Não confundir com".');
      }
      if (
        containsForbiddenTerm(
          [lessonGuideGoal, lessonGuideInclude].filter(Boolean).join(" "),
          excludeLabels
        )
      ) {
        pushError(errors, `${lessonPath}.sourceGuideStructured`, "Fonte-guia mínima cita tópico proibido pelo módulo.");
      }

      const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
      if (!microsequences.length) {
        pushError(errors, `${lessonPath}.microsequences`, "Cada lição precisa ter microssequências.");
      }

      const seenTitles = new Set();
      microsequences.forEach((microsequence, microIndex) => {
        const microPath = `${lessonPath}.microsequences[${microIndex}]`;
        const microTitle = normalizeWhitespace(microsequence?.title);
        const microGoal = normalizeWhitespace(microsequence?.goal);
        if (!microTitle) {
          pushError(errors, `${microPath}.title`, "Microssequência sem título.");
        }
        if (!microGoal) {
          pushError(errors, `${microPath}.goal`, "Microssequência sem objetivo.");
        }
        const normalizedTitle = normalizeLabelToken(microTitle);
        if (normalizedTitle && seenTitles.has(normalizedTitle)) {
          pushError(errors, `${microPath}.title`, `Microssequência duplicada: "${microTitle}".`);
        }
        seenTitles.add(normalizedTitle);

        const dependsOnTitles = Array.isArray(microsequence?.dependsOnTitles) ? microsequence.dependsOnTitles : [];
        dependsOnTitles.forEach((dependencyTitle) => {
          if (!seenTitles.has(normalizeLabelToken(dependencyTitle))) {
            pushError(errors, `${microPath}.dependsOnTitles`, `Dependência inválida ou futura: "${dependencyTitle}".`);
          }
        });

        if (Array.isArray(microsequence?.scopeLabels)) {
          microsequence.scopeLabels = microsequence.scopeLabels
            .map((scopeLabel) => resolveScopeLabel(scopeLabel, includeEntries) || scopeLabel)
            .filter(Boolean);
        }
        const scopeLabels = Array.isArray(microsequence?.scopeLabels) ? microsequence.scopeLabels : [];
        if (!scopeLabels.length) {
          pushError(errors, `${microPath}.scopeLabels`, "Toda microssequência precisa referenciar o escopo do módulo.");
        }
        scopeLabels.forEach((scopeLabel) => {
          const normalizedScopeLabel = normalizeLabelToken(scopeLabel);
          if (excludeLabels.includes(normalizedScopeLabel)) {
            pushError(errors, `${microPath}.scopeLabels`, `Tópico proibido apareceu no planejamento: "${scopeLabel}".`);
          }
          if (!includeLabels.has(normalizedScopeLabel)) {
            pushError(errors, `${microPath}.scopeLabels`, `scopeLabel fora de include: "${scopeLabel}".`);
          }
        });

        if (containsForbiddenTerm(microTitle, excludeLabels) || containsForbiddenTerm(microGoal, excludeLabels)) {
          pushError(errors, microPath, "Microssequência cita tópico proibido pelo módulo.");
        }
      });
    });
  });

  return finalizeValidation(errors, {
    course: {
      title: plannedTitle,
      ...(normalizeWhitespace(plannedCourse.course.goal) ? { goal: normalizeWhitespace(plannedCourse.course.goal) } : {}),
      modules: plannedModules
    }
  });
}
