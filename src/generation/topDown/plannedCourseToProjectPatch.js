import { buildScopedKey } from "../../core/ids.js";
import { normalizeLabelToken } from "../../core/text.js";
import { createScopeTerm } from "../../domain/scopeTerms.js";
import { buildSourceGuideText, SOURCE_GUIDE_LEVELS } from "../../sourceGuides/sourceGuideStructured.js";

function mapScopeLabelsToRefs(scopeLabels, includeTerms) {
  const refs = [];
  for (const label of Array.isArray(scopeLabels) ? scopeLabels : []) {
    const normalizedLabel = normalizeLabelToken(label);
    const match = includeTerms.find((term) => term.normalizedLabel === normalizedLabel);
    if (match) {
      refs.push(match.id);
    }
  }
  return refs;
}

export function plannedCourseToProjectPatch(plannedCourse, scopeContract) {
  const courseKey = buildScopedKey("course", plannedCourse.course.title);
  const course = {
    key: courseKey,
    title: plannedCourse.course.title,
    ...(plannedCourse.course.goal ? { goal: plannedCourse.course.goal } : {}),
    evidencePriority: scopeContract.course.evidencePriority,
    modules: plannedCourse.course.modules.map((plannedModule, moduleIndex) => {
      const scopeModule = scopeContract.modules[moduleIndex];
      const include = scopeModule.include.map((label) => createScopeTerm(label));
      const exclude = scopeModule.exclude.map((label) => createScopeTerm(label));
      return {
        key: buildScopedKey("module", plannedModule.title),
        title: plannedModule.title,
        include,
        exclude,
        ...(scopeModule.notes ? { notes: scopeModule.notes } : {}),
        assessmentStyle: scopeModule.assessmentStyle,
        lessons: plannedModule.lessons.map((plannedLesson) => {
          const lessonKey = buildScopedKey("lesson", plannedLesson.title);
          const titleMap = [];
          const lesson = {
            key: lessonKey,
            title: plannedLesson.title,
            goal: plannedLesson.goal,
            ...(plannedLesson?.sourceGuideStructured
              ? {
                  sourceGuideStructured: structuredClone(plannedLesson.sourceGuideStructured),
                  sourceGuide: buildSourceGuideText(plannedLesson.sourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON })
                }
              : {}),
            microsequences: plannedLesson.microsequences.map((plannedMicrosequence) => {
              const key = buildScopedKey("microsequence", plannedMicrosequence.title);
              titleMap.push([normalizeLabelToken(plannedMicrosequence.title), key]);
              return {
                key,
                title: plannedMicrosequence.title,
                goal: plannedMicrosequence.goal,
                type: "main",
                status: "planned",
                dependsOn: [],
                scopeRefs: mapScopeLabelsToRefs(plannedMicrosequence.scopeLabels, include),
                versions: []
              };
            })
          };

          lesson.microsequences = lesson.microsequences.map((microsequence, index) => {
            const source = plannedLesson.microsequences[index];
            return {
              ...microsequence,
              dependsOn: (Array.isArray(source.dependsOnTitles) ? source.dependsOnTitles : [])
                .map((title) => titleMap.find(([normalizedTitle]) => normalizedTitle === normalizeLabelToken(title))?.[1] || "")
                .filter(Boolean)
            };
          });
          return lesson;
        })
      };
    })
  };

  return {
    kind: "upsert-course",
    course
  };
}
