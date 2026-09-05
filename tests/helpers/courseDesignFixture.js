import { COURSE_DESIGN_CONTRACT, COURSE_DESIGN_PARAMETER_CATALOG_VERSION,
  COURSE_DESIGN_PARAMETER_DEFINITIONS, COURSE_COMPONENT_CATALOG_VERSION } from "../../src/domain/courseDesignParameters.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/catalog/resourceCatalog.js";

export function courseDesignFixture(selection, { scope = "study_unit", revision = 1 } = {}) {
  const path = [
    ["course", selection.courseId], ["module", selection.moduleId], ["lesson", selection.lessonId],
    ["didactic_microsequence", selection.microsequenceId], ["study_unit", selection.studyUnitId]
  ].map(([kind, ref]) => ({ kind, ref, label: `${kind} sintético` }));
  const index = path.findIndex(({ kind }) => kind === scope);
  return {
    contract: COURSE_DESIGN_CONTRACT, courseId: selection.courseId, courseRevision: revision,
    parameterCatalogVersion: COURSE_DESIGN_PARAMETER_CATALOG_VERSION,
    scopeContext: { current: path[index], ancestors: path.slice(0, index), children: [],
      childCount: 0, hasMoreChildren: false, nextChildCursor: null },
    targetPlanItems: ["didactic_microsequence", "study_unit"].includes(scope)
      ? { instructionalAnalysisUnitIds: [], evidenceRequirementIds: [] } : null,
    definitions: structuredClone(COURSE_DESIGN_PARAMETER_DEFINITIONS),
    parameters: COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id }) => ({
      parameterId: id, localAssignment: null, conflicts: [], effectiveAssignment: {
        mode: "automatic", value: null, origin: "system_default", reason: "Escolha contextual pendente nesta fixture.",
        sourceScope: null, inherited: false
      }
    })),
    guidance: { localAssignment: null, effectiveAssignments: [] },
    componentCatalog: { version: COURSE_COMPONENT_CATALOG_VERSION,
      options: RESOURCE_PACKAGE_REGISTRY.listCatalog().map((item) => ({ ref: `${item.id}@${item.version}`,
        label: item.label || item.id, purpose: item.purpose || "Componente sintético de teste." })) },
    componentPolicy: { localAssignment: null, effectiveAssignment: {
      policy: { catalogVersion: COURSE_COMPONENT_CATALOG_VERSION, availability: "all", allowedRefs: [], excludedRefs: [], preferredRefs: [] },
      origin: "system_default", reason: "Política sintética de teste.", sourceScope: null, inherited: false
    } }
  };
}

// Valores deliberadamente escolhidos somente em fixtures de produção simulada.
export function fixtureAppliedParameters(overrides, { origin = "automatic", scope = "didactic_microsequence" } = {}) {
  const byId = new Map(overrides);
  return COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
    parameterId: definition.id, conflicts: [], effectiveAssignment: {
      mode: origin === "automatic" ? "automatic" : "fixed",
      value: structuredClone(byId.has(definition.id) ? byId.get(definition.id) : definition.defaultValue),
      origin, reason: "Condição sintética explicitamente escolhida pelo teste.", inherited: true,
      sourceScope: { kind: definition.supportedScopes.includes(scope) ? scope : "course",
        ref: scope === "course" || !definition.supportedScopes.includes(scope)
          ? "10000000-0000-4000-8000-000000000001" : "micro-dns" }
    }
  }));
}
