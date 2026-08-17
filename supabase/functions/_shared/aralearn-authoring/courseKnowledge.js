const INVARIANTS_URI = "aralearn://authoring/invariants";

export const COURSE_AUTHORING_SERVER_INSTRUCTIONS = [
  "O AraLearn mantém um Curso vivo e mutável como única autoridade da autoria.",
  "Leia o Curso antes de alterá-lo e envie sempre a versão de estado recebida.",
  "Planejamento, parâmetros, fontes, observações e configuração de pesquisa pertencem ao estado persistido do Curso; não os fixe no prompt.",
  "Use as ferramentas para observar ou modificar fatos. Não invente conteúdo, fontes, resultados, permissões ou estado de materialização.",
  "Uma Parte de autoria é um agrupamento operacional configurável; não é nível da hierarquia didática.",
  "Use consultarComponentesDidaticos progressivamente: explore ou pesquise, inspecione candidatos e carregue apenas o contrato necessário.",
  "Ao concluir uma operação, informe brevemente o que mudou, qual conteúdo foi afetado e que incerteza ainda exige decisão humana."
].join("\n");

const INVARIANTS = Object.freeze({
  uri: INVARIANTS_URI,
  name: "Invariantes da autoria",
  title: "Invariantes da autoria do AraLearn",
  description: "Regras estáveis para operar sobre o Curso vivo e suas ferramentas.",
  mimeType: "text/markdown",
  text: `# Invariantes da autoria\n\n${COURSE_AUTHORING_SERVER_INSTRUCTIONS}\n`
});

export function listCourseAuthoringKnowledgeResources() {
  return [structuredClone({
    uri: INVARIANTS.uri,
    name: INVARIANTS.name,
    title: INVARIANTS.title,
    description: INVARIANTS.description,
    mimeType: INVARIANTS.mimeType
  })];
}

export function readCourseAuthoringKnowledgeResource(uri) {
  return String(uri || "") === INVARIANTS_URI
    ? structuredClone(INVARIANTS)
    : null;
}
