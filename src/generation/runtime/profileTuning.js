import { DEFAULT_ENGINE_PROFILE_ID, resolveEngineProfile } from "../config/engineProfileRegistry.js";
import {
  buildCourseSemanticsForPolicy,
  createDefaultCourseModel
} from "./courseModelSemantics.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function resolveTextOverride(input = {}, key, fallback = "") {
  return hasOwn(input, key) ? text(input?.[key]) : fallback;
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
    description: text(normalizedInput.description)
      ? normalizedInput.description
      : hasOwn(input, "courseModelDescription")
        ? text(input.courseModelDescription)
        : defaultCourseModel.description,
    learningTrail: text(normalizedInput.learningTrail)
      ? normalizedInput.learningTrail
      : defaultCourseModel.learningTrail,
    microsequenceProgression: text(normalizedInput.microsequenceProgression)
      ? normalizedInput.microsequenceProgression
      : defaultCourseModel.microsequenceProgression
  });
}

export function createProfileTuning(profileId = DEFAULT_ENGINE_PROFILE_ID, input = {}) {
  const resolvedProfile = resolveEngineProfile(profileId || DEFAULT_ENGINE_PROFILE_ID);
  const didacticPolicy = resolvedProfile?.didacticPolicy || {};
  const defaultCourseModel = createDefaultCourseModel(didacticPolicy?.courseSemantics || {});
  const courseModelEdited = input?.courseModelEdited === true;

  return {
    targetStudentProfile: resolveTextOverride(input, "targetStudentProfile", text(didacticPolicy?.targetStudentProfile)),
    courseModelEdited,
    courseModel: courseModelEdited
      ? createDefaultCourseModel(
          input?.courseModel && typeof input.courseModel === "object"
            ? input.courseModel
            : hasOwn(input, "courseModelDescription")
              ? { description: input.courseModelDescription }
              : {}
        )
      : resolveCourseModelWithProfileDefaults(defaultCourseModel, input)
  };
}

export function buildCardAssistanceProfileOverrides({ profileTuning = {} } = {}) {
  const courseSemantics = buildCourseSemanticsForPolicy(profileTuning?.courseModel || {});
  return {
    didacticPolicy: {
      targetStudentProfile: text(profileTuning?.targetStudentProfile),
      courseSemantics
    }
  };
}
