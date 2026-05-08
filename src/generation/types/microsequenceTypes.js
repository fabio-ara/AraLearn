const TYPES = [
  {
    id: "assisted",
    label: "Assistido",
    shortDescription: "A etapa de planejamento escolhe o tipo didático mais adequado.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardRolesBySize: {
      short: ["situar o tema", "desenvolver a ideia principal", "checar entendimento"],
      medium: ["situar o tema", "explicar a ideia principal", "mostrar exemplo curto", "checar entendimento", "consolidar"],
      long: ["situar o tema", "explicar a primeira ideia", "explicar a segunda ideia", "mostrar exemplo curto", "checar entendimento", "aplicar em situação curta", "consolidar"]
    }
  },
  {
    id: "simple",
    label: "Simples",
    shortDescription: "Microssequência curta, segura e genérica.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardRolesBySize: {
      short: ["apresentar o ponto central", "dar exemplo curto", "checar entendimento"],
      medium: ["apresentar o ponto central", "explicar detalhe essencial", "dar exemplo curto", "checar entendimento", "consolidar"],
      long: ["apresentar o ponto central", "explicar detalhe essencial", "dar exemplo curto", "mostrar variação", "checar entendimento", "aplicar em situação curta", "consolidar"]
    }
  },
  {
    id: "concept",
    label: "Explicar uma ideia",
    shortDescription: "Introduz uma ideia nova com explicação curta, exemplo simples e checagem.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardRolesBySize: {
      short: ["introduzir a ideia", "mostrar exemplo simples", "checar entendimento"],
      medium: ["introduzir a ideia", "explicar componente essencial", "mostrar exemplo simples", "checar entendimento", "consolidar a ideia"],
      long: ["introduzir a ideia", "explicar primeiro componente", "explicar segundo componente", "mostrar exemplo simples", "checar entendimento", "aplicar em situação curta", "consolidar a ideia"]
    }
  },
  {
    id: "procedure",
    label: "Passo a passo",
    shortDescription: "Ensina uma sequência de ações ou etapas.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardRolesBySize: {
      short: ["situar a tarefa", "apresentar a ação principal", "checar entendimento"],
      medium: ["situar a tarefa", "apresentar a primeira etapa", "apresentar a próxima decisão ou ação", "checar entendimento", "consolidar o procedimento"],
      long: ["situar a tarefa", "apresentar a primeira etapa", "apresentar a segunda etapa", "apresentar decisão ou variação relevante", "checar entendimento", "aplicar em situação curta", "consolidar o procedimento"]
    }
  },
  {
    id: "guided_practice",
    label: "Prática guiada",
    shortDescription: "Conduz o aluno por exercícios curtos com feedback.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "block_gap_fill"],
    cardRolesBySize: {
      short: ["situar a prática", "propor uma lacuna com blocos", "dar feedback e consolidar"],
      medium: ["situar a prática", "propor uma primeira lacuna com blocos", "propor uma segunda aplicação curta", "checar entendimento", "dar feedback e consolidar"],
      long: ["situar a prática", "propor uma primeira lacuna com blocos", "dar feedback intermediário", "propor uma segunda lacuna com blocos", "checar entendimento", "aplicar em situação curta", "consolidar a aprendizagem"]
    }
  },
  {
    id: "comparison",
    label: "Comparar",
    shortDescription: "Contrasta ideias, opções, comandos, regras, conceitos ou procedimentos.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "table", "multiple_choice"],
    cardRolesBySize: {
      short: ["apresentar os itens", "comparar critérios principais", "checar distinção"],
      medium: ["apresentar os itens", "comparar primeiro critério", "comparar segundo critério", "checar distinção", "consolidar a comparação"],
      long: ["apresentar os itens", "comparar primeiro critério", "comparar segundo critério", "mostrar exemplo contrastivo", "checar distinção", "aplicar em situação curta", "consolidar a comparação"]
    }
  },
  {
    id: "review",
    label: "Revisão rápida",
    shortDescription: "Revisa conteúdo já estudado com checagens curtas.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardRolesBySize: {
      short: ["retomar ideia-chave", "checar lembrança", "consolidar"],
      medium: ["retomar ideia-chave", "recuperar detalhe importante", "checar lembrança", "corrigir confusão comum", "consolidar"],
      long: ["retomar ideia-chave", "recuperar primeiro detalhe", "recuperar segundo detalhe", "checar lembrança", "corrigir confusão comum", "aplicar em situação curta", "consolidar"]
    }
  },
  {
    id: "common_mistake",
    label: "Erro comum",
    shortDescription: "Apresenta erro frequente e conduz o aluno a reconhecê-lo ou corrigi-lo.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "multiple_choice"],
    cardRolesBySize: {
      short: ["apresentar o erro", "corrigir a interpretação", "checar reconhecimento"],
      medium: ["apresentar o erro", "mostrar por que ele ocorre", "corrigir a interpretação", "checar reconhecimento", "consolidar a correção"],
      long: ["apresentar o erro", "mostrar por que ele ocorre", "diferenciar do caso correto", "corrigir a interpretação", "checar reconhecimento", "aplicar em situação curta", "consolidar a correção"]
    }
  },
  {
    id: "rule_or_policy",
    label: "Regra/procedimento",
    shortDescription: "Trabalha norma, regra, fluxo administrativo, procedimento institucional ou regra de negócio.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "flowchart", "multiple_choice"],
    cardRolesBySize: {
      short: ["situar a regra", "aplicar regra principal", "checar interpretação"],
      medium: ["situar a regra", "explicar condição principal", "mostrar fluxo ou exceção", "checar interpretação", "consolidar regra"],
      long: ["situar a regra", "explicar condição principal", "explicar exceção", "mostrar fluxo ou variação", "checar interpretação", "aplicar em situação curta", "consolidar regra"]
    }
  },
  {
    id: "code_or_command",
    label: "Código/comando",
    shortDescription: "Trabalha programação, shell, comandos, scripts ou pequenos trechos de código.",
    availableSizes: ["short", "medium", "long"],
    baseResourceTypes: ["paragraph", "code_editor", "multiple_choice"],
    cardRolesBySize: {
      short: ["situar o comando ou código", "mostrar uso mínimo", "checar função"],
      medium: ["situar o comando ou código", "mostrar uso mínimo", "explicar parte importante", "checar função", "consolidar uso"],
      long: ["situar o comando ou código", "mostrar uso mínimo", "explicar primeira parte", "explicar segunda parte", "checar função", "aplicar em situação curta", "consolidar uso"]
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
