import { auditCourseForgeBackstageVocabulary } from "./courseForgeBackstageAudit.js";
import { validateCourseForgePatch } from "./courseForgePatch.js";
import { validateCourseForgeCardSourceRefs } from "./courseForgeSourceRefs.js";
import { validateCourseForgeSourceLedger } from "./courseForgeSourceLedger.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedText(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const BACKSTAGE_TERMS = ["pipeline", "json", "schema", "prompt", "sourceguide", "domainmap", "llm", "auditoria"];

function hasBackstageVocabulary(value) {
  const normalized = normalizedText(value);
  return BACKSTAGE_TERMS.some((term) => normalized.includes(term));
}

function makeArchitectureIssue(target, type, evidence, requiredFix, severity = "blocking") {
  return {
    target,
    type,
    severity,
    evidence,
    requiredFix
  };
}

function readArchitectureCourse(architectureDraft = {}) {
  if (architectureDraft?.architectureFinal?.course) {
    return architectureDraft.architectureFinal.course;
  }
  if (architectureDraft?.architectureDraft?.course) {
    return architectureDraft.architectureDraft.course;
  }
  if (architectureDraft?.course) {
    return architectureDraft.course;
  }
  return null;
}

export function validateCourseForgeArchitectureDraft({ architectureDraft = {}, sourceLedger = [], scope = {} } = {}) {
  const blockingIssues = [];
  const warnings = [];
  const course = readArchitectureCourse(architectureDraft);
  const hasSources = Array.isArray(sourceLedger) && sourceLedger.length > 0;

  if (!course) {
    blockingIssues.push(
      makeArchitectureIssue(
        "course",
        "missing_progression",
        "A arquitetura não devolveu curso utilizável.",
        "Gerar curso, módulos e lições válidos para o escopo."
      )
    );
    return {
      ok: false,
      approved: false,
      blockingIssues,
      warnings
    };
  }

  if (!text(course.title)) {
    blockingIssues.push(
      makeArchitectureIssue("course.title", "missing_progression", "Curso sem título.", "Definir um título claro para o curso.")
    );
  }
  if (hasBackstageVocabulary(course.title) || hasBackstageVocabulary(course.description)) {
    blockingIssues.push(
      makeArchitectureIssue(
        "course",
        "backstage_vocabulary",
        "A estrutura do curso expõe vocabulário de bastidor.",
        "Reescrever título e descrição em linguagem didática."
      )
    );
  }

  const modules = Array.isArray(course.modules) ? course.modules : [];
  if (!modules.length && scope?.level !== "lesson" && scope?.level !== "microsequence") {
    blockingIssues.push(
      makeArchitectureIssue("course.modules", "too_broad", "Curso sem módulos.", "Gerar ao menos um módulo no escopo.")
    );
  }

  const moduleTitles = new Set();
  modules.forEach((moduleValue, moduleIndex) => {
    const moduleTarget = `module:${text(moduleValue?.key) || moduleIndex + 1}`;
    const moduleTitle = text(moduleValue?.title);
    if (!moduleTitle) {
      blockingIssues.push(
        makeArchitectureIssue(moduleTarget, "missing_progression", "Módulo sem título.", "Definir um título claro para o módulo.")
      );
    }
    const moduleTitleKey = normalizedText(moduleTitle);
    if (moduleTitleKey && moduleTitles.has(moduleTitleKey)) {
      blockingIssues.push(
        makeArchitectureIssue(moduleTarget, "duplicated", `Título de módulo duplicado: ${moduleTitle}.`, "Remover duplicação entre módulos.")
      );
    }
    moduleTitles.add(moduleTitleKey);
    if (hasBackstageVocabulary(moduleTitle) || hasBackstageVocabulary(moduleValue?.description)) {
      blockingIssues.push(
        makeArchitectureIssue(moduleTarget, "backstage_vocabulary", "Módulo com vocabulário de bastidor.", "Reescrever o módulo.")
      );
    }

    const lessons = Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : [];
    if (!lessons.length && scope?.level !== "course") {
      blockingIssues.push(
        makeArchitectureIssue(moduleTarget, "missing_progression", "Módulo sem lições.", "Gerar lições para o módulo.")
      );
    }

    const lessonTitles = new Set();
    lessons.forEach((lesson, lessonIndex) => {
      const lessonTarget = `${moduleTarget}/lesson:${text(lesson?.key) || lessonIndex + 1}`;
      const lessonTitle = text(lesson?.title);
      if (!lessonTitle) {
        blockingIssues.push(
          makeArchitectureIssue(lessonTarget, "missing_progression", "Lição sem título.", "Definir um título claro para a lição.")
        );
      }
      const lessonTitleKey = normalizedText(lessonTitle);
      if (lessonTitleKey && lessonTitles.has(lessonTitleKey)) {
        blockingIssues.push(
          makeArchitectureIssue(lessonTarget, "duplicated", `Título de lição duplicado: ${lessonTitle}.`, "Remover duplicação entre lições.")
        );
      }
      lessonTitles.add(lessonTitleKey);
      if (hasBackstageVocabulary(lessonTitle) || hasBackstageVocabulary(lesson?.description)) {
        blockingIssues.push(
          makeArchitectureIssue(lessonTarget, "backstage_vocabulary", "Lição com vocabulário de bastidor.", "Reescrever a lição.")
        );
      }
      const guide = lesson?.sourceGuideStructured;
      if (!guide || typeof guide !== "object" || !text(guide.lessonGoal)) {
        blockingIssues.push(
          makeArchitectureIssue(lessonTarget, "source_gap", "Lição sem `lessonGoal` estruturado.", "Gerar governança mínima da lição.")
        );
      }
      if (hasSources && !text(lesson?.description) && !text(guide?.notationRules) && !text(guide?.commonErrors)) {
        warnings.push(
          makeArchitectureIssue(
            lessonTarget,
            "missing_assessment_alignment",
            "Lição com pouca ancoragem explícita nas fontes disponíveis.",
            "Detalhar melhor foco, notação ou erros comuns.",
            "warning"
          )
        );
      }
    });
  });

  return {
    ok: blockingIssues.length === 0,
    approved: blockingIssues.length === 0,
    blockingIssues,
    warnings
  };
}

export function mergeCourseForgeArchitectureAudits(...audits) {
  const merged = {
    approved: true,
    blockingIssues: [],
    warnings: []
  };
  audits.forEach((audit) => {
    if (!audit || typeof audit !== "object") {
      return;
    }
    if (audit.approved === false) {
      merged.approved = false;
    }
    if (Array.isArray(audit.blockingIssues)) {
      merged.blockingIssues.push(...audit.blockingIssues);
    }
    if (Array.isArray(audit.warnings)) {
      merged.warnings.push(...audit.warnings);
    }
    if (Array.isArray(audit.issues)) {
      merged.blockingIssues.push(...audit.issues.filter((item) => item?.severity !== "warning"));
      merged.warnings.push(...audit.issues.filter((item) => item?.severity === "warning"));
    }
  });
  if (merged.blockingIssues.length) {
    merged.approved = false;
  }
  return merged;
}

export function validateCourseForgeArtifacts({ sourceLedger = [], cards = [], lessonContext = {}, patch = null, intent = {} } = {}) {
  const sourceLedgerResult = validateCourseForgeSourceLedger(sourceLedger);
  const sourceRefResults = cards.map((card) => validateCourseForgeCardSourceRefs(card?.sourceRefs || [], sourceLedger));
  const backstageResults = cards.map((card) => auditCourseForgeBackstageVocabulary({ card, lessonContext }));
  const patchResult = patch ? validateCourseForgePatch(patch, { intent }) : { ok: true, errors: [] };

  return {
    ok:
      sourceLedgerResult.ok &&
      sourceRefResults.every((item) => item.ok) &&
      backstageResults.every((item) => item.ok) &&
      patchResult.ok,
    sourceLedgerResult,
    sourceRefResults,
    backstageResults,
    patchResult
  };
}
