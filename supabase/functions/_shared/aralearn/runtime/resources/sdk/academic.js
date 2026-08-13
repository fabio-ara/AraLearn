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
  practiceModes
}) {
  return Object.freeze({
    domains: freezeTextList(domains),
    knowledgeObjects: freezeTextList(knowledgeObjects),
    conventions: freezeTextList(conventions),
    appropriateWhen: freezeTextList(appropriateWhen),
    avoidWhen: freezeTextList(avoidWhen),
    technologies: freezeTextList(technologies),
    practiceModes: freezeTextList(practiceModes),
    authoring: DEFAULT_AUTHORING
  });
}
