const DEFAULT_AUTHORING = Object.freeze({
  aiSelection: true,
  manualTextEditing: true,
  structureEditing: false
});

const INTERPRETABILITY_RULE = "Admita o package somente quando suas convenções acadêmicas tornarem a relação relevante mais direta e previsível do que em uma representação mais simples; se a pessoa precisar decifrar a interface ou consultar uma legenda distante, escolha outra forma ou decomponha o conteúdo.";
const THEORY_DENSITY_RULE = "Em teoria, represente um avanço conceitual por card e distribua fundamentos, relações e exemplos em progressão; não use o package para condensar vários assuntos numa única representação.";
const PRACTICE_CONTEXT_RULE = "Em prática, preserve no próprio card todos os dados do caso e somente a complexidade necessária ao gesto cognitivo principal, ainda que a representação seja informacionalmente rica.";

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
      decisionRule: "Escolha ou crie este package somente quando uma representação mais simples perder a estrutura declarada.",
      interpretabilityRule: INTERPRETABILITY_RULE,
      theoryDensityRule: THEORY_DENSITY_RULE,
      practiceContextRule: PRACTICE_CONTEXT_RULE
    }),
    technologies: freezeTextList(technologies),
    practiceModes: freezeTextList(practiceModes),
    authoring: DEFAULT_AUTHORING
  });
}
