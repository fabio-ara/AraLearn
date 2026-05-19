import { normalizeLessonDomainMap } from "../domain/lessonDomainModel.js";
import { sortLessonMicrosequencesDeterministically } from "../domain/resolveLessonMicrosequenceOrder.js";
import { repairMicrosequenceMetadataAgainstDomainMap } from "./microsequenceDidacticMetadata.js";

export function repairMicrosequenceMetadataDeterministically({ microsequencePlans = [], lessonPlans = [] } = {}) {
  return repairMicrosequenceMetadataAgainstDomainMap({
    microsequencePlans,
    lessonPlans,
    normalizeLessonDomainMap,
    sortLessonMicrosequencesDeterministically
  });
}
