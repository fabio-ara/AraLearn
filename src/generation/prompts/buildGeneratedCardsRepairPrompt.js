import { buildDidacticRepairPromptLines } from "../didactics/didacticGovernance.js";
import { buildDidacticProductionPromptLines } from "../policies/didacticProductionPolicy.js";
import { pickAllowedResourceSchemas } from "../didactics/microsequenceGenerationRepresentation.js";

function compactJson(value, modelCapabilities = {}) {
  return modelCapabilities?.preferShortSchemas === true ? JSON.stringify(value || {}) : JSON.stringify(value || {}, null, 2);
}

export function buildGeneratedCardsRepairPrompt({
  invalidResponse,
  validationErrors = [],
  generationContract,
  modelCapabilities = {}
}) {
  const expectedCardCount = generationContract?.output?.expectedCardCount || 0;
  const cardPlan = generationContract?.didacticPlan?.cardPlan || [];
  const allowedResourceTypes = generationContract?.resources?.allowedResourceTypes || [];
  const resourceSchemas = pickAllowedResourceSchemas(generationContract?.resources || {});
  const studyTrackPolicy = generationContract?.studyTrackPolicy || null;
  const productionLines = buildDidacticProductionPromptLines({
    weakModelMode: true,
    lessonGuidance: generationContract?.context?.lesson || {},
    lessonSourceGuideStructured: generationContract?.context?.lesson?.sourceGuideStructured || {},
    lessonDomainMap: generationContract?.context?.lesson?.domainMap || {},
    studyTrackPolicy
  }).map((line) => `- ${line}`);
  const studyTrackLines =
    studyTrackPolicy?.mode === "clarify_local_doubt"
      ? [
          "- se a validação indicar dúvida local não respondida, reescreva os primeiros cards para responder requiredAnchors;",
          "- não preserve abertura deslocada do tema, mesmo que estruturalmente válida;",
          "- após esclarecer a dúvida, reconecte ao objetivo da lição ou à microssequência atual."
        ]
      : [];

  return [
    "Corrija apenas o JSON abaixo para obedecer ao contrato.",
    "Preserve o conteúdo pedagógico sempre que possível.",
    "Papel do AraLearn: manter plano, cardPlan, recursos permitidos, validação e adaptação final.",
    "Seu papel no reparo é apenas corrigir a estrutura do JSON existente dentro dessas restrições.",
    "Altere somente o necessário para satisfazer os campos obrigatórios, tipos permitidos, quantidade de cards e schemas dos recursos.",
    "Não regenere livremente a microssequência.",
    "Não altere o tipo didático nem o plano.",
    "Não decida destino estrutural, aplicação no projeto nem revisão editorial final; isso pertence ao AraLearn e ao usuário.",
    "Não adicione recursos fora do contrato.",
    "Remova campos inesperados e corrija nomes de campos incorretos.",
    "Princípio didático: mostre antes de nomear, concretize antes de generalizar e não esconda a ponte do raciocínio.",
    "",
    "Critérios obrigatórios:",
    `- devolva exatamente ${expectedCardCount} cards;`,
    "- cada card deve manter position e resourceType exatamente iguais ao item correspondente do cardPlan;",
    "- prática deve continuar precedida por microteoria ou exemplo já presente na mesma microssequência;",
    "- cards de prática devem manter dados, regras e fórmulas necessários no próprio card;",
    "- explicações abstratas demais para iniciante devem ser concretizadas com caso pequeno, exemplo mínimo, quadro curto ou contraste simples;",
    "- quando houver notação pouco familiar, explique em linguagem comum antes de cobrar uso ou interpretação;",
    "- se houver recurso visual como `plane`, `graph`, `table`, `matrix` ou `tree`, traga no próprio card os valores, passos e conclusão que o aluno deve ler;",
    "- mantenha destaque visual só quando o texto o nomear explicitamente;",
    "- quando houver `table`, prefira poucas linhas e poucas colunas; se houver linha ou coluna decisiva, use `table.focus` para guiar o olhar;",
    "- remova linguagem de bastidor ou referência externa/volátil como caderno, aula, prova, material, trecho acima ou equivalentes;",
    "- remova exercícios cuja resposta já esteja explicitamente revelada no mesmo card por texto, legenda, nota ou fórmula pronta;",
    "- não mantenha feedback que já interprete o resultado final quando o card ainda não ensinou a montar ou ler a conta; confirme antes a etapa operacional;",
    "- em prática de iniciante, reduza o salto de raciocínio ao mínimo e prefira reconhecimento de padrão já mostrado;",
    "- se a explicação estiver larga ou densa demais, quebre em mais cards em vez de comprimir toda a teoria num único quadro;",
    "- se a figura justificar um resultado, escreva esse resultado explicitamente no próprio card;",
    "- remova prática que apenas peça para repetir uma resposta já visível por destaque ou posição óbvia;",
    "- preserve ou acrescente acentos graves em símbolos, conectivos, comandos, fórmulas e nomes curtos;",
    "- remova repetições do title do card usadas como primeira frase, título interno ou cabeçalho avulso;",
    ...productionLines,
    ...studyTrackLines,
    ...buildDidacticRepairPromptLines(),
    "- resourceType deve estar em allowedResourceTypes;",
    "- block_gap_fill deve usar segments[].kind/value ou kind/blankId/acceptedBlockIds, blocks[].blockId/label e feedbackAfter;",
    "- multiple_choice deve ter correctOptionId apontando para options[].optionId;",
    "- graph deve ter vertices com id único, edges ligando vértices existentes, sem laços nem arestas duplicadas na primeira versão;",
    "- tree deve ter nodes com id único, label curto e parentId existente quando informado;",
    "- responda somente JSON válido no formato {\"cards\":[...]}.",
    "",
    "Erros de validação:",
    compactJson(validationErrors, modelCapabilities),
    "",
    "Resposta inválida original:",
    compactJson(invalidResponse, modelCapabilities),
    "",
    "Target da microssequência:",
    compactJson(generationContract?.target || {}, modelCapabilities),
    "",
    "expectedCardCount:",
    String(expectedCardCount),
    "",
    "cardPlan validado:",
    compactJson(cardPlan, modelCapabilities),
    "",
    "allowedResourceTypes:",
    compactJson(allowedResourceTypes, modelCapabilities),
    "",
    "resourceSchemas permitidos:",
    compactJson(resourceSchemas, modelCapabilities),
    "",
    "studyTrackPolicy:",
    compactJson(studyTrackPolicy || {}, modelCapabilities),
    "",
    "Formato esperado:",
    "{\"cards\":[{\"position\":1,\"resourceType\":\"paragraph\",\"title\":\"\",\"text\":\"\"}]}"
  ].join("\n");
}
