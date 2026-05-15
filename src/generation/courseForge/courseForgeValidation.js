import { auditCourseForgeBackstageVocabulary } from "./courseForgeBackstageAudit.js";
import { validateCourseForgePatch } from "./courseForgePatch.js";
import { validateCourseForgeCardSourceRefs } from "./courseForgeSourceRefs.js";
import { validateCourseForgeSourceLedger } from "./courseForgeSourceLedger.js";

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
