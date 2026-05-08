export function buildMicrosequenceGenerationPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const compact = modelCapabilities.profile === "compact-json";
  const body = compact ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  const includesBlockGapFill = (contract?.resources?.allowedResourceTypes || []).includes("block_gap_fill");
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
  return [
    "Gere cards para a microssequência indicada.",
    "Responda somente JSON válido no formato: {\"cards\":[...]}",
    "A quantidade de cards deve ser exatamente output.expectedCardCount.",
    "Cada card deve ter position, resourceType e os campos do schema do recurso.",
    "Use apenas resourceType presente em resources.allowedResourceTypes.",
    "Use selectedLessonTopicRefs como assuntos selecionados no escopo da lição para orientar escopo e terminologia; não transforme essas referências em tags persistentes da microssequência.",
    "Para block_gap_fill, use feedbackAfter como comentário posterior preservado em say.after; não use feedbackPopup.",
    "Use uma ideia principal por card, textos curtos e progressão interna.",
    "Campos fora dos schemas são inválidos.",
    ...blockGapFillInstructions,
    "Contrato:",
    body
  ].join("\n");
}
