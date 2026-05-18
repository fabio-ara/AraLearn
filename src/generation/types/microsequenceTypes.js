function plan(roleId, label, preferredResources) {
  return Object.freeze({ roleId, label, preferredResources: Object.freeze([...preferredResources]) });
}

function plans(items) {
  return Object.freeze(items.map((item) => plan(item[0], item[1], item[2])));
}

const TYPES = [
  {
    id: "assisted",
    label: "Assistido",
    shortDescription: "A política e o planejamento escolhem o tipo mais adequado.",
    availableSizes: ["short", "medium"],
    baseResourceTypes: ["paragraph", "block_gap_fill", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["anchor_context", "ancorar o contexto", ["paragraph"]],
        ["guided_practice", "guiar a primeira prática", ["block_gap_fill", "multiple_choice"]],
        ["consolidate", "consolidar", ["multiple_choice", "paragraph"]]
      ]),
      medium: plans([
        ["anchor_context", "ancorar o contexto", ["paragraph"]],
        ["show_micro_example", "mostrar microexemplo", ["paragraph", "table", "code_editor"]],
        ["guided_practice", "guiar a primeira prática", ["block_gap_fill", "multiple_choice"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["anchor_context", "ancorar o contexto", ["paragraph"]],
        ["show_micro_example", "mostrar microexemplo", ["paragraph", "table", "code_editor"]],
        ["guided_practice", "guiar a primeira prática", ["block_gap_fill", "multiple_choice"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "simple",
    label: "Simples",
    shortDescription: "Sequência estável com explicação breve e checagem.",
    availableSizes: ["short", "medium"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["present_core_point", "apresentar o ponto central", ["paragraph"]],
        ["show_minimal_case", "mostrar caso mínimo", ["paragraph", "table"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]]
      ]),
      medium: plans([
        ["present_core_point", "apresentar o ponto central", ["paragraph"]],
        ["explain_critical_detail", "explicar detalhe crítico", ["paragraph"]],
        ["show_minimal_case", "mostrar caso mínimo", ["paragraph", "table", "code_editor"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["present_core_point", "apresentar o ponto central", ["paragraph"]],
        ["explain_critical_detail", "explicar detalhe crítico", ["paragraph"]],
        ["show_minimal_case", "mostrar caso mínimo", ["paragraph", "table", "code_editor"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "concept",
    label: "Explicar uma ideia",
    shortDescription: "Introduz conceito, traduz notação e fecha com checagem.",
    availableSizes: ["short", "medium"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["introduce_idea", "introduzir a ideia", ["paragraph"]],
        ["translate_notation", "traduzir a notação", ["paragraph", "table", "graph", "matrix", "plane"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]]
      ]),
      medium: plans([
        ["introduce_idea", "introduzir a ideia", ["paragraph"]],
        ["translate_notation", "traduzir a notação", ["paragraph", "table", "graph", "matrix", "plane"]],
        ["show_minimal_example", "mostrar exemplo mínimo", ["paragraph", "table", "graph", "matrix", "plane"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["introduce_idea", "introduzir a ideia", ["paragraph"]],
        ["translate_notation", "traduzir a notação", ["paragraph", "table", "graph", "matrix", "plane"]],
        ["show_minimal_example", "mostrar exemplo mínimo", ["paragraph", "table", "graph", "matrix", "plane"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "procedure",
    label: "Passo a passo",
    shortDescription: "Ensina procedimento curto em ordem operacional.",
    availableSizes: ["short", "medium"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["situate_task", "situar a tarefa", ["paragraph"]],
        ["show_main_step", "mostrar a etapa principal", ["paragraph", "table", "code_editor", "flowchart", "tree"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]]
      ]),
      medium: plans([
        ["situate_task", "situar a tarefa", ["paragraph"]],
        ["show_first_step", "mostrar a primeira etapa", ["paragraph", "table", "code_editor", "flowchart", "tree"]],
        ["show_next_step", "mostrar a próxima etapa", ["paragraph", "table", "code_editor", "flowchart", "tree"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["situate_task", "situar a tarefa", ["paragraph"]],
        ["show_first_step", "mostrar a primeira etapa", ["paragraph", "table", "code_editor", "flowchart", "tree"]],
        ["show_next_step", "mostrar a próxima etapa", ["paragraph", "table", "code_editor", "flowchart", "tree"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "guided_practice",
    label: "Prática guiada",
    shortDescription: "Conduz prática breve depois de um contexto mínimo.",
    availableSizes: ["short", "medium"],
    baseResourceTypes: ["paragraph", "block_gap_fill", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["situate_practice", "situar a prática", ["paragraph"]],
        ["guided_gap", "propor a primeira prática", ["block_gap_fill"]],
        ["check_and_consolidate", "checar e consolidar", ["multiple_choice", "paragraph"]]
      ]),
      medium: plans([
        ["situate_practice", "situar a prática", ["paragraph"]],
        ["show_minimal_reference", "mostrar referência mínima", ["paragraph", "table", "code_editor"]],
        ["guided_gap", "propor a primeira prática", ["block_gap_fill"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["situate_practice", "situar a prática", ["paragraph"]],
        ["show_minimal_reference", "mostrar referência mínima", ["paragraph", "table", "code_editor"]],
        ["guided_gap", "propor a primeira prática", ["block_gap_fill"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "comparison",
    label: "Comparar",
    shortDescription: "Contrasta critérios de forma pequena e auditável.",
    availableSizes: ["short", "medium"],
    baseResourceTypes: ["paragraph", "table", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["present_items", "apresentar os itens", ["paragraph"]],
        ["compare_main_criteria", "comparar critérios principais", ["table", "graph", "matrix"]],
        ["check_distinction", "checar distinção", ["multiple_choice"]]
      ]),
      medium: plans([
        ["present_items", "apresentar os itens", ["paragraph"]],
        ["compare_first_criterion", "comparar o primeiro critério", ["table", "graph", "matrix"]],
        ["compare_second_criterion", "comparar o segundo critério", ["table", "graph", "matrix"]],
        ["check_distinction", "checar distinção", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["present_items", "apresentar os itens", ["paragraph"]],
        ["compare_first_criterion", "comparar o primeiro critério", ["table", "graph", "matrix"]],
        ["compare_second_criterion", "comparar o segundo critério", ["table", "graph", "matrix"]],
        ["check_distinction", "checar distinção", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "review",
    label: "Revisão rápida",
    shortDescription: "Retoma algo já visto com recuperação ativa pequena.",
    availableSizes: ["short", "medium"],
    baseResourceTypes: ["paragraph", "block_gap_fill", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["recall_key_idea", "retomar a ideia-chave", ["paragraph"]],
        ["recover_detail", "recuperar um detalhe", ["block_gap_fill", "multiple_choice"]],
        ["consolidate", "consolidar", ["multiple_choice", "paragraph"]]
      ]),
      medium: plans([
        ["recall_key_idea", "retomar a ideia-chave", ["paragraph"]],
        ["recover_first_detail", "recuperar um primeiro detalhe", ["block_gap_fill"]],
        ["recover_second_detail", "recuperar um segundo detalhe", ["block_gap_fill", "multiple_choice"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph"]]
      ]),
      long: plans([
        ["recall_key_idea", "retomar a ideia-chave", ["paragraph"]],
        ["recover_first_detail", "recuperar um primeiro detalhe", ["block_gap_fill"]],
        ["recover_second_detail", "recuperar um segundo detalhe", ["block_gap_fill", "multiple_choice"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph"]]
      ])
    }
  },
  {
    id: "common_mistake",
    label: "Erro comum",
    shortDescription: "Expõe uma confusão frequente e corrige o ponto crítico.",
    availableSizes: ["short", "medium"],
    baseResourceTypes: ["paragraph", "multiple_choice", "table"],
    cardPlansBySize: {
      short: plans([
        ["present_mistake", "apresentar o erro", ["paragraph"]],
        ["contrast_correct_case", "contrastar com o caso correto", ["paragraph", "table"]],
        ["check_recognition", "checar reconhecimento", ["multiple_choice"]]
      ]),
      medium: plans([
        ["present_mistake", "apresentar o erro", ["paragraph"]],
        ["explain_why", "mostrar por que ele ocorre", ["paragraph", "table"]],
        ["contrast_correct_case", "contrastar com o caso correto", ["paragraph", "table"]],
        ["check_recognition", "checar reconhecimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph"]]
      ]),
      long: plans([
        ["present_mistake", "apresentar o erro", ["paragraph"]],
        ["explain_why", "mostrar por que ele ocorre", ["paragraph", "table"]],
        ["contrast_correct_case", "contrastar com o caso correto", ["paragraph", "table"]],
        ["check_recognition", "checar reconhecimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph"]]
      ])
    }
  },
  {
    id: "rule_or_policy",
    label: "Regra/procedimento",
    shortDescription: "Explica regra curta com sequência operacional controlada.",
    availableSizes: ["short", "medium"],
    baseResourceTypes: ["paragraph", "multiple_choice", "table"],
    cardPlansBySize: {
      short: plans([
        ["situate_rule", "situar a regra", ["paragraph"]],
        ["show_rule_flow", "mostrar o fluxo principal", ["table", "flowchart", "paragraph"]],
        ["check_interpretation", "checar interpretação", ["multiple_choice"]]
      ]),
      medium: plans([
        ["situate_rule", "situar a regra", ["paragraph"]],
        ["show_main_condition", "mostrar a condição principal", ["paragraph", "table", "flowchart"]],
        ["show_exception_or_variation", "mostrar exceção ou variação", ["paragraph", "table", "flowchart"]],
        ["check_interpretation", "checar interpretação", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph"]]
      ]),
      long: plans([
        ["situate_rule", "situar a regra", ["paragraph"]],
        ["show_main_condition", "mostrar a condição principal", ["paragraph", "table", "flowchart"]],
        ["show_exception_or_variation", "mostrar exceção ou variação", ["paragraph", "table", "flowchart"]],
        ["check_interpretation", "checar interpretação", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph"]]
      ])
    }
  },
  {
    id: "code_or_command",
    label: "Código/comando",
    shortDescription: "Trabalha comando ou trecho pequeno com uso imediato.",
    availableSizes: ["short", "medium"],
    baseResourceTypes: ["paragraph", "code_editor", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["situate_command", "situar o comando", ["paragraph"]],
        ["show_minimal_use", "mostrar uso mínimo", ["code_editor", "tree"]],
        ["check_function", "checar a função", ["multiple_choice"]]
      ]),
      medium: plans([
        ["situate_command", "situar o comando", ["paragraph"]],
        ["show_minimal_use", "mostrar uso mínimo", ["code_editor", "tree"]],
        ["explain_critical_piece", "explicar a parte crítica", ["code_editor", "paragraph", "tree"]],
        ["check_function", "checar a função", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "block_gap_fill"]]
      ]),
      long: plans([
        ["situate_command", "situar o comando", ["paragraph"]],
        ["show_minimal_use", "mostrar uso mínimo", ["code_editor", "tree"]],
        ["explain_critical_piece", "explicar a parte crítica", ["code_editor", "paragraph", "tree"]],
        ["check_function", "checar a função", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "block_gap_fill"]]
      ])
    }
  }
];

export const MICROSEQUENCE_TYPES = Object.freeze(TYPES.map((item) => Object.freeze(structuredClone(item))));

export function listMicrosequenceTypes() {
  return MICROSEQUENCE_TYPES.map((item) => structuredClone(item));
}

export function getMicrosequenceType(typeId) {
  return listMicrosequenceTypes().find((item) => item.id === typeId) || null;
}

export function listMicrosequenceTypeSummaries() {
  return listMicrosequenceTypes().map(({ id, label, shortDescription, availableSizes }) => ({
    id,
    label,
    shortDescription,
    availableSizes
  }));
}
