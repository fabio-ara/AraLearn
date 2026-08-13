const DEFAULT_AUTHORING = Object.freeze({
  aiSelection: true,
  manualTextEditing: true,
  structureEditing: false
});

const UNIVERSAL_CONTENT_PRACTICE_MODES = Object.freeze([
  "exposition",
  "gap",
  "typing",
  "matching"
]);

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
  content = true
}) {
  const effectivePracticeModes = content
    ? [...new Set([...UNIVERSAL_CONTENT_PRACTICE_MODES, ...(practiceModes || [])])]
    : practiceModes;
  return Object.freeze({
    domains: freezeTextList(domains),
    knowledgeObjects: freezeTextList(knowledgeObjects),
    conventions: freezeTextList(conventions),
    appropriateWhen: freezeTextList(appropriateWhen),
    avoidWhen: freezeTextList(avoidWhen),
    technologies: freezeTextList(technologies),
    practiceModes: freezeTextList(effectivePracticeModes),
    authoring: DEFAULT_AUTHORING
  });
}
