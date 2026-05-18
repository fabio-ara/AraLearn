import { DEFAULT_ENGINE_PROFILE_ID, resolveEngineProfile } from "../config/engineProfileRegistry.js";
import {
  buildCourseSemanticsForPolicy,
  buildResourcePreferencesFromCourseModel,
  createDefaultCourseModel
} from "./courseModelSemantics.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function resolveTextOverride(input = {}, key, fallback = "") {
  return hasOwn(input, key) ? text(input?.[key]) : fallback;
}

function resolveNumberOverride(input = {}, key, fallback) {
  return hasOwn(input, key) ? toPositiveInteger(input?.[key], fallback) : fallback;
}

function resolveBooleanOverride(input = {}, key, fallback) {
  return hasOwn(input, key) ? normalizeBoolean(input?.[key], fallback) : fallback;
}

function resolveCourseModelWithProfileDefaults(defaultCourseModel = {}, input = {}) {
  const inputCourseModel =
    input?.courseModel && typeof input.courseModel === "object"
      ? input.courseModel
      : hasOwn(input, "courseModelDescription")
        ? { description: input.courseModelDescription }
        : {};
  const normalizedInput = createDefaultCourseModel(inputCourseModel);

  return createDefaultCourseModel({
    description: hasOwn(inputCourseModel, "description")
      ? normalizedInput.description
      : hasOwn(input, "courseModelDescription")
        ? text(input.courseModelDescription)
        : defaultCourseModel.description,
    materialNature: hasOwn(inputCourseModel, "materialNature")
      ? normalizedInput.materialNature
      : defaultCourseModel.materialNature,
    progressionMode: hasOwn(inputCourseModel, "progressionMode")
      ? normalizedInput.progressionMode
      : defaultCourseModel.progressionMode,
    centralRepresentations: hasOwn(inputCourseModel, "centralRepresentations")
      ? normalizedInput.centralRepresentations
      : defaultCourseModel.centralRepresentations,
    cognitiveOperations: hasOwn(inputCourseModel, "cognitiveOperations")
      ? normalizedInput.cognitiveOperations
      : defaultCourseModel.cognitiveOperations,
    expectedDifficulties: hasOwn(inputCourseModel, "expectedDifficulties")
      ? normalizedInput.expectedDifficulties
      : defaultCourseModel.expectedDifficulties,
    practiceModes: hasOwn(inputCourseModel, "practiceModes")
      ? normalizedInput.practiceModes
      : defaultCourseModel.practiceModes
  });
}

export function createCourseForgeProfileTuning(profileId = DEFAULT_ENGINE_PROFILE_ID, input = {}) {
  const resolvedProfile = resolveEngineProfile(profileId || DEFAULT_ENGINE_PROFILE_ID);
  const didacticPolicy = resolvedProfile?.didacticPolicy || {};
  const budget = didacticPolicy?.topDownCourseStrategy?.defaultBudgetByLesson || {};
  const defaultCourseModel = createDefaultCourseModel(didacticPolicy?.courseSemantics || {});

  return {
    targetStudentProfile: resolveTextOverride(input, "targetStudentProfile", text(didacticPolicy?.targetStudentProfile)),
    conceptualReappearances: resolveNumberOverride(
      input,
      "conceptualReappearances",
      toPositiveInteger(didacticPolicy?.defaultMinimumReappearances?.conceptual, 3)
    ),
    operationalReappearances: resolveNumberOverride(
      input,
      "operationalReappearances",
      toPositiveInteger(didacticPolicy?.defaultMinimumReappearances?.operational, 4)
    ),
    minMicrosequences: resolveNumberOverride(
      input,
      "minMicrosequences",
      toPositiveInteger(budget?.minMicrosequences, 3)
    ),
    targetMicrosequences: resolveNumberOverride(
      input,
      "targetMicrosequences",
      toPositiveInteger(budget?.targetMicrosequences, 5)
    ),
    maxMicrosequences: resolveNumberOverride(
      input,
      "maxMicrosequences",
      toPositiveInteger(budget?.maxMicrosequences, 8)
    ),
    requireCoreCoverageBeforeExtensions: resolveBooleanOverride(
      input,
      "requireCoreCoverageBeforeExtensions",
      didacticPolicy?.topDownCourseStrategy?.requireCoreCoverageBeforeExtensions !== false
    ),
    requireVocabularyMap: resolveBooleanOverride(
      input,
      "requireVocabularyMap",
      didacticPolicy?.topDownCourseStrategy?.requireVocabularyMap !== false
    ),
    courseModel: resolveCourseModelWithProfileDefaults(defaultCourseModel, input)
  };
}

export function buildCourseForgeEngineProfileOverrides({ profileTuning = {} } = {}) {
  const courseSemantics = buildCourseSemanticsForPolicy(profileTuning?.courseModel || {});
  const resourcePreferences = buildResourcePreferencesFromCourseModel(profileTuning?.courseModel || {});
  return {
    didacticPolicy: {
      targetStudentProfile: text(profileTuning?.targetStudentProfile),
      defaultMinimumReappearances: {
        conceptual: toPositiveInteger(profileTuning?.conceptualReappearances, 3),
        operational: toPositiveInteger(profileTuning?.operationalReappearances, 4)
      },
      topDownCourseStrategy: {
        defaultBudgetByLesson: {
          minMicrosequences: toPositiveInteger(profileTuning?.minMicrosequences, 3),
          targetMicrosequences: toPositiveInteger(profileTuning?.targetMicrosequences, 5),
          maxMicrosequences: toPositiveInteger(profileTuning?.maxMicrosequences, 8)
        },
        requireCoreCoverageBeforeExtensions: profileTuning?.requireCoreCoverageBeforeExtensions !== false,
        requireVocabularyMap: profileTuning?.requireVocabularyMap !== false
      },
      courseSemantics,
      resourcePreferences
    }
  };
}
