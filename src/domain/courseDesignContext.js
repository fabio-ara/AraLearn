import { normalizeCourseDesignRead } from "./courseDesignParameters.js";

// Uma projeção focal da resolução autoritativa; não implementa herança.
export function projectCourseDesignContext(value) {
  const design = normalizeCourseDesignRead(value);
  const definitions = new Map(design.definitions.map((definition) => [definition.id, definition]));
  return {
    contract: "aralearn.course-design-context.v1",
    courseId: design.courseId,
    courseRevision: design.courseRevision,
    scope: { kind: design.scopeContext.current.kind, ref: design.scopeContext.current.ref },
    parameters: design.parameters.map((parameter) => {
      const definition = definitions.get(parameter.parameterId);
      return {
        parameterId: parameter.parameterId,
        label: definition.label,
        unit: definition.unitLabel,
        operationalization: definition.operationalization,
        limitations: definition.limitations,
        ...structuredClone(parameter.effectiveAssignment),
        conflicts: structuredClone(parameter.conflicts)
      };
    }),
    guidance: structuredClone(design.guidance.effectiveAssignments),
    componentPolicy: structuredClone(design.componentPolicy.effectiveAssignment)
  };
}
