import { buildDidacticGenerationPromptLines } from "../didactics/didacticGovernance.js";

export function buildMicrosequenceGenerationPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const compact = modelCapabilities.profile === "compact-json";
  const body = compact ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  const includesBlockGapFill = (contract?.resources?.allowedResourceTypes || []).includes("block_gap_fill");
  const includesMatrix = (contract?.resources?.allowedResourceTypes || []).includes("matrix");
  const blockGapFillInstructions = includesBlockGapFill
    ? [
        "Estrutura obrigatória de block_gap_fill:",
        JSON.stringify({
          resourceType: "block_gap_fill",
          title: "",
          prompt: "",
          segments: [
            { kind: "text", value: "" },
            { kind: "blank", blankId: "blank_1", acceptedBlockIds: ["block_1"] },
            { kind: "text", value: "" }
          ],
          blocks: [{ blockId: "block_1", label: "" }],
          feedbackAfter: ""
        }),
        "Em block_gap_fill, não use content, segments[].text nem blocks[].text."
      ]
    : [];
  const matrixInstructions = includesMatrix
    ? [
        "Se usar matrix para resolução em etapas, prefira sequence para manter operandos, passo intermediário e resultado no mesmo card.",
        "Em matrix.sequence, use connector a partir do segundo item, mantenha no máximo 5 itens e células curtas."
      ]
    : [];
  return [
    "Gere cards para a microssequência indicada.",
    "Responda somente JSON válido no formato: {\"cards\":[...]}",
    "Papel do AraLearn: fixar didacticPlan.cardPlan, recursos permitidos, schemas aceitos, validação e adaptação para o contrato público.",
    "Seu papel aqui é apenas preencher o conteúdo dos cards já planejados.",
    "A quantidade de cards deve ser exatamente output.expectedCardCount.",
    "Cada card deve seguir exatamente position e resourceType do didacticPlan.cardPlan.",
    "Não altere a ordem, o recurso nem a quantidade planejada pelo AraLearn.",
    "Não mude tags persistentes, destino estrutural, status da microssequência nem decisão editorial final; o usuário revisa o resultado.",
    "Cada card deve ter position, resourceType e os campos do schema do recurso planejado.",
    "Use apenas resourceType presente em resources.allowedResourceTypes.",
    "Trate requestGovernance.precedence como ordem obrigatória de leitura do contrato.",
    "Trate requestGovernance.lessonAnchors como âncoras fortes da lição.",
    "Use request.userPrompt apenas para especializar o recorte imediato e a ênfase dentro da lição atual.",
    "Se request.userPrompt conflitar com a meta, a notação, as confusões prováveis ou o critério final da lição, preserve a governança da lição e reduza o pedido ao escopo governado.",
    "Use context.path como a linha hierárquica completa até a microssequência.",
    "Use context.sourceGuideLineage como governança acumulada de curso, módulo e lição.",
    "Respeite context.lesson.resourceTags como envelope fechado de recursos da lição.",
    "Respeite context.lesson.contentTypeTags como envelope fechado de tipos de conteúdo da lição.",
    "Respeite context.lesson.learningActionTags como envelope fechado de ações de estudo da lição.",
    "Respeite context.lesson.supportLevel como nível de apoio obrigatório da lição.",
    "Use selectedLessonTopicRefs como assuntos selecionados no escopo da lição para orientar escopo e terminologia; não transforme essas referências em tags persistentes da microssequência.",
    "Use context.lesson.microsequenceLine para manter continuidade didática com as microssequências anteriores da lição sem depender de contexto oculto.",
    "Para block_gap_fill, use feedbackAfter como comentário posterior preservado em say.after; não use feedbackPopup.",
    "Use uma ideia principal por card, textos curtos e progressão interna.",
    "Pense como iniciante absoluto: mostre antes de nomear, concretize antes de generalizar e não esconda a ponte do raciocínio.",
    "Não coloque prática antes da microteoria: qualquer lacuna, pergunta ou cálculo deve vir depois de explicação ou exemplo simples na mesma microssequência.",
    "Todo card de prática deve ser autossuficiente: repita no próprio card os dados, regras, fórmulas e notações necessários para resolver.",
    "Quando a regra for abstrata ou pouco intuitiva, concretize antes com casos pequenos, tabela curta ou lista comparativa.",
    "Quando o card definir um conceito, acrescente exemplo mínimo, contraste ou demonstração curta.",
    "Quando aparecer notação pouco familiar, traduza para linguagem comum antes de cobrar uso ou interpretação.",
    "Se o card usar `plane`, `table`, `matrix`, `tree` ou outro recurso visual, o contexto crítico precisa morar no próprio card.",
    "Em recurso visual, destaque apenas o que o texto nomear explicitamente e guie o olhar com texto curto.",
    "Quando usar `table`, prefira poucas linhas e poucas colunas; use `table.focus` se houver linha ou coluna decisiva.",
    "Não use linguagem de bastidor nem referência externa ou volátil; o card deve se sustentar sozinho.",
    "Não crie exercício cuja resposta já esteja explicitamente revelada no mesmo card.",
    "Não use feedback que interprete o resultado final antes de o card ensinar a montar ou ler a etapa operacional.",
    "Em prática de iniciante, exija o menor salto possível.",
    "Se a explicação ficar larga ou densa demais, divida em mais cards em vez de comprimir contexto.",
    "Se um recurso visual justificar um resultado, escreva esse resultado explicitamente no próprio card.",
    "Se a melhor explicação exigir um card mais alto, prefira clareza didática; a interface pode usar rolagem vertical.",
    ...buildDidacticGenerationPromptLines(),
    "Use destaque inline com acentos graves em símbolos, conectivos, comandos, fórmulas e nomes curtos.",
    "Não repita o title do card como primeira frase, título interno, linha avulsa ou cabeçalho de tabela; o title já aparece na interface.",
    "Campos fora dos schemas são inválidos.",
    ...blockGapFillInstructions,
    ...matrixInstructions,
    "Contrato:",
    body
  ].join("\n");
}
