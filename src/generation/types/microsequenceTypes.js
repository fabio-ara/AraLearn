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
    shortDescription: "A etapa de planejamento escolhe o tipo didático mais adequado.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["orient_topic", "situar o tema", ["paragraph"]],
        ["develop_main_idea", "desenvolver a ideia principal", ["paragraph"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]]
      ]),
      medium: plans([
        ["orient_topic", "situar o tema", ["paragraph"]],
        ["explain_main_idea", "explicar a ideia principal", ["paragraph"]],
        ["show_short_example", "mostrar exemplo curto", ["paragraph", "table", "code_editor", "matrix", "plane"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["orient_topic", "situar o tema", ["paragraph"]],
        ["explain_first_idea", "explicar a primeira ideia", ["paragraph"]],
        ["explain_second_idea", "explicar a segunda ideia", ["paragraph", "table"]],
        ["show_short_example", "mostrar exemplo curto", ["paragraph", "table", "code_editor", "matrix", "plane"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["apply_short_case", "aplicar em situação curta", ["block_gap_fill", "multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "simple",
    label: "Simples",
    shortDescription: "Microssequência curta, segura e genérica.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["present_core_point", "apresentar o ponto central", ["paragraph"]],
        ["show_short_example", "dar exemplo curto", ["paragraph", "table", "code_editor", "matrix", "plane"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]]
      ]),
      medium: plans([
        ["present_core_point", "apresentar o ponto central", ["paragraph"]],
        ["explain_key_detail", "explicar detalhe essencial", ["paragraph"]],
        ["show_short_example", "dar exemplo curto", ["paragraph", "table", "code_editor", "matrix", "plane"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["present_core_point", "apresentar o ponto central", ["paragraph"]],
        ["explain_key_detail", "explicar detalhe essencial", ["paragraph"]],
        ["show_short_example", "dar exemplo curto", ["paragraph", "table", "code_editor", "matrix", "plane"]],
        ["show_variation", "mostrar variação", ["paragraph", "table"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["apply_short_case", "aplicar em situação curta", ["block_gap_fill", "multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "concept",
    label: "Explicar uma ideia",
    shortDescription: "Introduz uma ideia nova com explicação curta, exemplo simples e checagem.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["introduce_idea", "introduzir a ideia", ["paragraph"]],
        ["show_simple_example", "mostrar exemplo simples", ["paragraph", "table", "plane", "matrix"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]]
      ]),
      medium: plans([
        ["introduce_idea", "introduzir a ideia", ["paragraph"]],
        ["explain_component", "explicar componente essencial", ["paragraph", "table"]],
        ["show_simple_example", "mostrar exemplo simples", ["paragraph", "table", "plane", "matrix"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate_idea", "consolidar a ideia", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["introduce_idea", "introduzir a ideia", ["paragraph"]],
        ["explain_first_component", "explicar primeiro componente", ["paragraph"]],
        ["explain_second_component", "explicar segundo componente", ["paragraph", "table"]],
        ["show_simple_example", "mostrar exemplo simples", ["paragraph", "table", "plane", "matrix"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["apply_short_case", "aplicar em situação curta", ["block_gap_fill", "multiple_choice"]],
        ["consolidate_idea", "consolidar a ideia", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "procedure",
    label: "Passo a passo",
    shortDescription: "Ensina uma sequência de ações ou etapas.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["situate_task", "situar a tarefa", ["paragraph"]],
        ["present_main_action", "apresentar a ação principal", ["paragraph", "table", "code_editor", "flowchart"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]]
      ]),
      medium: plans([
        ["situate_task", "situar a tarefa", ["paragraph"]],
        ["present_first_step", "apresentar a primeira etapa", ["paragraph", "table", "code_editor", "flowchart"]],
        ["present_next_decision", "apresentar a próxima decisão ou ação", ["paragraph", "table", "flowchart", "block_gap_fill"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["consolidate_procedure", "consolidar o procedimento", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["situate_task", "situar a tarefa", ["paragraph"]],
        ["present_first_step", "apresentar a primeira etapa", ["paragraph", "table", "code_editor", "flowchart"]],
        ["present_second_step", "apresentar a segunda etapa", ["paragraph", "table", "code_editor", "flowchart"]],
        ["present_decision_or_variation", "apresentar decisão ou variação relevante", ["paragraph", "table", "flowchart"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["apply_short_case", "aplicar em situação curta", ["block_gap_fill", "multiple_choice"]],
        ["consolidate_procedure", "consolidar o procedimento", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "guided_practice",
    label: "Prática guiada",
    shortDescription: "Conduz o aluno por exercícios curtos com feedback.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "block_gap_fill"],
    cardPlansBySize: {
      short: plans([
        ["situate_practice", "situar a prática", ["paragraph"]],
        ["guided_gap", "propor uma lacuna com blocos", ["block_gap_fill"]],
        ["feedback_and_consolidate", "dar feedback e consolidar", ["multiple_choice", "paragraph"]]
      ]),
      medium: plans([
        ["situate_practice", "situar a prática", ["paragraph"]],
        ["first_guided_gap", "propor uma primeira lacuna com blocos", ["block_gap_fill"]],
        ["second_short_application", "propor uma segunda aplicação curta", ["block_gap_fill", "multiple_choice"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["feedback_and_consolidate", "dar feedback e consolidar", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["situate_practice", "situar a prática", ["paragraph"]],
        ["first_guided_gap", "propor uma primeira lacuna com blocos", ["block_gap_fill"]],
        ["intermediate_feedback", "dar feedback intermediário", ["paragraph"]],
        ["second_guided_gap", "propor uma segunda lacuna com blocos", ["block_gap_fill"]],
        ["check_understanding", "checar entendimento", ["multiple_choice"]],
        ["apply_short_case", "aplicar em situação curta", ["block_gap_fill", "multiple_choice"]],
        ["consolidate_learning", "consolidar a aprendizagem", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "comparison",
    label: "Comparar",
    shortDescription: "Contrasta ideias, opções, comandos, regras, conceitos ou procedimentos.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "table", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["present_items", "apresentar os itens", ["paragraph"]],
        ["compare_main_criteria", "comparar critérios principais", ["table"]],
        ["check_distinction", "checar distinção", ["multiple_choice"]]
      ]),
      medium: plans([
        ["present_items", "apresentar os itens", ["paragraph"]],
        ["compare_first_criterion", "comparar primeiro critério", ["table", "paragraph"]],
        ["compare_second_criterion", "comparar segundo critério", ["table", "paragraph"]],
        ["check_distinction", "checar distinção", ["multiple_choice"]],
        ["consolidate_comparison", "consolidar a comparação", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["present_items", "apresentar os itens", ["paragraph"]],
        ["compare_first_criterion", "comparar primeiro critério", ["table", "paragraph"]],
        ["compare_second_criterion", "comparar segundo critério", ["table", "paragraph"]],
        ["show_contrastive_example", "mostrar exemplo contrastivo", ["paragraph", "table"]],
        ["check_distinction", "checar distinção", ["multiple_choice"]],
        ["apply_short_case", "aplicar em situação curta", ["block_gap_fill", "multiple_choice"]],
        ["consolidate_comparison", "consolidar a comparação", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "review",
    label: "Revisão rápida",
    shortDescription: "Revisa conteúdo já estudado com checagens curtas.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["recall_key_idea", "retomar ideia-chave", ["paragraph"]],
        ["check_recall", "checar lembrança", ["multiple_choice", "block_gap_fill"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ]),
      medium: plans([
        ["recall_key_idea", "retomar ideia-chave", ["paragraph"]],
        ["recover_key_detail", "recuperar detalhe importante", ["block_gap_fill", "paragraph"]],
        ["check_recall", "checar lembrança", ["multiple_choice"]],
        ["fix_common_confusion", "corrigir confusão comum", ["paragraph", "multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["recall_key_idea", "retomar ideia-chave", ["paragraph"]],
        ["recover_first_detail", "recuperar primeiro detalhe", ["block_gap_fill", "paragraph"]],
        ["recover_second_detail", "recuperar segundo detalhe", ["block_gap_fill", "paragraph"]],
        ["check_recall", "checar lembrança", ["multiple_choice"]],
        ["fix_common_confusion", "corrigir confusão comum", ["paragraph", "multiple_choice"]],
        ["apply_short_case", "aplicar em situação curta", ["block_gap_fill", "multiple_choice"]],
        ["consolidate", "consolidar", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "common_mistake",
    label: "Erro comum",
    shortDescription: "Apresenta erro frequente e conduz o aluno a reconhecê-lo ou corrigi-lo.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["present_mistake", "apresentar o erro", ["paragraph"]],
        ["correct_interpretation", "corrigir a interpretação", ["paragraph", "table"]],
        ["check_recognition", "checar reconhecimento", ["multiple_choice"]]
      ]),
      medium: plans([
        ["present_mistake", "apresentar o erro", ["paragraph"]],
        ["explain_why_it_happens", "mostrar por que ele ocorre", ["paragraph", "table"]],
        ["correct_interpretation", "corrigir a interpretação", ["paragraph", "table"]],
        ["check_recognition", "checar reconhecimento", ["multiple_choice"]],
        ["consolidate_correction", "consolidar a correção", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["present_mistake", "apresentar o erro", ["paragraph"]],
        ["explain_why_it_happens", "mostrar por que ele ocorre", ["paragraph", "table"]],
        ["differentiate_correct_case", "diferenciar do caso correto", ["table", "paragraph"]],
        ["correct_interpretation", "corrigir a interpretação", ["paragraph"]],
        ["check_recognition", "checar reconhecimento", ["multiple_choice"]],
        ["apply_short_case", "aplicar em situação curta", ["block_gap_fill", "multiple_choice"]],
        ["consolidate_correction", "consolidar a correção", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "rule_or_policy",
    label: "Regra/procedimento",
    shortDescription: "Trabalha norma, regra, fluxo administrativo, procedimento institucional ou regra de negócio.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "flowchart", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["situate_rule", "situar a regra", ["paragraph"]],
        ["apply_main_rule", "aplicar regra principal", ["flowchart", "paragraph", "table"]],
        ["check_interpretation", "checar interpretação", ["multiple_choice"]]
      ]),
      medium: plans([
        ["situate_rule", "situar a regra", ["paragraph"]],
        ["explain_main_condition", "explicar condição principal", ["paragraph", "flowchart", "table"]],
        ["show_flow_or_exception", "mostrar fluxo ou exceção", ["flowchart", "table", "paragraph"]],
        ["check_interpretation", "checar interpretação", ["multiple_choice"]],
        ["consolidate_rule", "consolidar regra", ["paragraph", "multiple_choice"]]
      ]),
      long: plans([
        ["situate_rule", "situar a regra", ["paragraph"]],
        ["explain_main_condition", "explicar condição principal", ["paragraph", "flowchart", "table"]],
        ["explain_exception", "explicar exceção", ["paragraph", "table"]],
        ["show_flow_or_variation", "mostrar fluxo ou variação", ["flowchart", "table"]],
        ["check_interpretation", "checar interpretação", ["multiple_choice"]],
        ["apply_short_case", "aplicar em situação curta", ["block_gap_fill", "multiple_choice"]],
        ["consolidate_rule", "consolidar regra", ["paragraph", "multiple_choice"]]
      ])
    }
  },
  {
    id: "code_or_command",
    label: "Código/comando",
    shortDescription: "Trabalha programação, shell, comandos, scripts ou pequenos trechos de código.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "code_editor", "multiple_choice"],
    cardPlansBySize: {
      short: plans([
        ["situate_code_or_command", "situar o comando ou código", ["paragraph"]],
        ["show_minimal_use", "mostrar uso mínimo", ["code_editor"]],
        ["check_function", "checar função", ["multiple_choice"]]
      ]),
      medium: plans([
        ["situate_code_or_command", "situar o comando ou código", ["paragraph"]],
        ["show_minimal_use", "mostrar uso mínimo", ["code_editor"]],
        ["explain_important_part", "explicar parte importante", ["code_editor", "paragraph"]],
        ["check_function", "checar função", ["paragraph", "multiple_choice"]],
        ["consolidate_use", "consolidar uso", ["multiple_choice", "paragraph"]]
      ]),
      long: plans([
        ["situate_code_or_command", "situar o comando ou código", ["paragraph"]],
        ["show_minimal_use", "mostrar uso mínimo", ["code_editor"]],
        ["explain_first_part", "explicar primeira parte", ["code_editor", "paragraph"]],
        ["explain_second_part", "explicar segunda parte", ["code_editor", "paragraph"]],
        ["check_function", "checar função", ["multiple_choice"]],
        ["apply_short_case", "aplicar em situação curta", ["code_editor", "block_gap_fill"]],
        ["consolidate_use", "consolidar uso", ["multiple_choice", "paragraph"]]
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
  return listMicrosequenceTypes().map(({ id, label, shortDescription }) => ({ id, label, shortDescription }));
}
