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
  const preservedStructure = freezeTextList(conventions);
  const onlyWhen = freezeTextList(appropriateWhen);
  const useSimplerRepresentationWhen = freezeTextList(avoidWhen);
  return Object.freeze({
    domains: freezeTextList(domains),
    knowledgeObjects: freezeTextList(knowledgeObjects),
    conventions: preservedStructure,
    appropriateWhen: onlyWhen,
    avoidWhen: useSimplerRepresentationWhen,
    admission: Object.freeze({
      preservedStructure,
      onlyWhen,
      useSimplerRepresentationWhen,
      decisionRule: "Escolha ou crie este package somente quando uma representação mais simples perder a estrutura declarada."
    }),
    technologies: freezeTextList(technologies),
    practiceModes: freezeTextList(practiceModes),
    authoring: DEFAULT_AUTHORING
  });
}
