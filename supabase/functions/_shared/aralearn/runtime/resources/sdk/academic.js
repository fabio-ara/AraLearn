import { inferAcademicTaxonomy } from "../catalog/vocabularies.js";

const DEFAULT_AUTHORING = Object.freeze({
  aiSelection: true,
  manualTextEditing: true,
  structureEditing: false
});

function freezeTextList(value) {
  return Object.freeze((Array.isArray(value) ? value : []).map((item) => String(item).trim()));
}

export function academicProfile({
  domains,
  knowledgeObjects,
  conventions,
  appropriateWhen,
  avoidWhen,
  technologies,
  practiceModes,
  cognitiveOperations = [],
  taxonomy = {}
}) {
  const preservedStructure = freezeTextList(conventions);
  const onlyWhen = freezeTextList(appropriateWhen);
  const useSimplerRepresentationWhen = freezeTextList(avoidWhen);
  return Object.freeze({
    domains: freezeTextList(domains),
    knowledgeObjects: freezeTextList(knowledgeObjects),
    conventions: preservedStructure,
    appropriateWhen: onlyWhen,
    avoidWhen: useSimplerRepresentationWhen,
    technologies: freezeTextList(technologies),
    practiceModes: freezeTextList(practiceModes),
    taxonomy: inferAcademicTaxonomy({
      domains,
      knowledgeObjects,
      conventions,
      cognitiveOperations,
      practiceModes,
      taxonomy
    }),
    authoring: DEFAULT_AUTHORING
  });
}
