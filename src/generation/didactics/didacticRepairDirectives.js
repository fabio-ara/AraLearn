import { text } from "./didacticText.js";

export function describeMicrosequenceRepairDirective(directive = {}) {
  const directiveType = text(directive?.directiveType);
  const didacticInterventionType = text(directive?.didacticInterventionType);
  const targetDomainRef = text(directive?.domainRef);
  const relatedConceptRefs = (Array.isArray(directive?.relatedConceptRefs) ? directive.relatedConceptRefs : [])
    .map(text)
    .filter(Boolean);
  const bridgeTargetRef = text(directive?.bridgeTargetRef);
  const prerequisiteRefs = (Array.isArray(directive?.prerequisiteRefs) ? directive.prerequisiteRefs : [])
    .map(text)
    .filter(Boolean);
  const details = [];

  if (directiveType === "repair_domain_coverage" && didacticInterventionType === "prerequisite_tightening") {
    if (targetDomainRef) {
      details.push(`conceito-alvo: ${targetDomainRef}.`);
    }
    if (prerequisiteRefs.length) {
      details.push(`pré-requisitos que devem aparecer antes da prática: ${prerequisiteRefs.join(", ")}.`);
    }
    details.push("Feche explicitamente a lacuna preparatória antes da prática ou aplicação.");
  }
  if (directiveType === "rewrite_for_didactic_intervention_type" && didacticInterventionType === "prerequisite_tightening") {
    if (targetDomainRef) {
      details.push(`conceito-alvo: ${targetDomainRef}.`);
    }
    if (prerequisiteRefs.length) {
      details.push(`pré-requisitos que devem aparecer antes da prática: ${prerequisiteRefs.join(", ")}.`);
    }
    details.push("Reescreva a microssequência para fechar explicitamente a lacuna preparatória antes da prática ou aplicação.");
  }
  if (directiveType === "rewrite_for_didactic_intervention_type" && didacticInterventionType === "explanatory_bridge") {
    if (targetDomainRef) {
      details.push(`conceito ou domínio que precisa da ponte explicativa: ${targetDomainRef}.`);
    }
    details.push("Reescreva a microssequência para criar uma ponte explicativa local antes da aplicação, não prática prematura.");
  }
  if (directiveType === "rewrite_for_didactic_intervention_type" && didacticInterventionType === "contrast_reinforcement") {
    if (relatedConceptRefs.length >= 2) {
      details.push(`conceitos que devem ser contrastados explicitamente: ${relatedConceptRefs.join(", ")}.`);
    }
    details.push("Materialize contraste real, discriminação local, contraexemplo ou erro frequente explicitamente visível na microssequência.");
  }
  if (directiveType === "rewrite_for_didactic_intervention_type" && didacticInterventionType === "guided_practice_bridge") {
    if (bridgeTargetRef) {
      details.push(`conceito ou alvo que precisa da ponte guiada: ${bridgeTargetRef}.`);
    }
    details.push("Insira um degrau de prática guiada antes da prática principal, com apoio explícito, passo intermediário ou treino assistido.");
  }
  if (directiveType === "generate_missing_intervention_microsequence" && didacticInterventionType === "contrast_reinforcement") {
    if (relatedConceptRefs.length >= 2) {
      details.push(`conceitos que devem aparecer no contraste: ${relatedConceptRefs.join(", ")}.`);
    }
    details.push("A nova microssequência deve nascer com contraste real entre alternativas, não só explicação neutra.");
  }
  if (directiveType === "generate_missing_intervention_microsequence" && didacticInterventionType === "prerequisite_tightening") {
    if (targetDomainRef) {
      details.push(`conceito-alvo: ${targetDomainRef}.`);
    }
    if (prerequisiteRefs.length) {
      details.push(`pré-requisitos que devem aparecer antes da prática: ${prerequisiteRefs.join(", ")}.`);
    }
    details.push("A nova microssequência deve nascer como ponte preparatória explícita antes da prática ou aplicação.");
  }
  if (directiveType === "generate_missing_intervention_microsequence" && didacticInterventionType === "explanatory_bridge") {
    if (targetDomainRef) {
      details.push(`conceito ou domínio que precisa da ponte explicativa: ${targetDomainRef}.`);
    }
    details.push("A nova microssequência deve nascer como ponte explicativa local antes da aplicação, não como prática prematura.");
  }
  if (directiveType === "generate_missing_intervention_microsequence" && didacticInterventionType === "guided_practice_bridge") {
    if (bridgeTargetRef) {
      details.push(`conceito ou alvo que precisa da ponte guiada: ${bridgeTargetRef}.`);
    }
    details.push("A nova microssequência deve nascer como ponte de prática guiada, não como explicação solta nem prática já autônoma.");
  }

  return [
    text(directive?.instruction),
    details.join(" ").trim(),
    `Evidência: ${text(directive?.evidence)}`
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function scoreDirectiveSeverity(directive = {}) {
  const providerSeverity = text(directive?.severity);
  if (providerSeverity === "blocking" || providerSeverity === "error") {
    return 300;
  }
  if (providerSeverity === "warning") {
    return 100;
  }
  const directiveType = text(directive?.directiveType);
  if (directiveType === "repair_domain_coverage") {
    return 250;
  }
  if (directiveType === "preserve_target_microsequence") {
    return 240;
  }
  if (directiveType === "generate_missing_intervention_microsequence") {
    return 230;
  }
  if (directiveType === "rewrite_for_didactic_intervention_type") {
    return text(directive?.providerIssueType) ? 120 : 200;
  }
  return 150;
}

function scoreDirectiveTargetProximity(directive = {}) {
  const microsequenceKey = text(directive?.target?.microsequenceKey);
  const lessonKey = text(directive?.target?.lessonKey);
  const requestedChangeId = text(directive?.requestedChangeId);
  let score = 0;
  if (requestedChangeId) {
    score += 80;
  }
  if (microsequenceKey) {
    score += 40;
  } else if (lessonKey) {
    score += 20;
  }
  return score;
}

function sortRepairDirectives(directives = []) {
  return [...directives].sort((left, right) => {
    const severityDelta = scoreDirectiveSeverity(right) - scoreDirectiveSeverity(left);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    const proximityDelta = scoreDirectiveTargetProximity(right) - scoreDirectiveTargetProximity(left);
    if (proximityDelta !== 0) {
      return proximityDelta;
    }
    return describeMicrosequenceRepairDirective(left).localeCompare(describeMicrosequenceRepairDirective(right));
  });
}

function isCriticalRepairDirective(directive = {}) {
  const providerSeverity = text(directive?.severity);
  if (providerSeverity === "blocking" || providerSeverity === "error") {
    return true;
  }
  const directiveType = text(directive?.directiveType);
  return ["repair_domain_coverage", "preserve_target_microsequence", "generate_missing_intervention_microsequence"].includes(directiveType);
}

export function selectRepairDirectivesForTask(directives = [], { maxDirectives = 6 } = {}) {
  const sorted = sortRepairDirectives(directives);
  const critical = sorted.filter((directive) => isCriticalRepairDirective(directive));
  const selected = [...critical];
  const selectedSet = new Set(selected);
  const softLimit = Math.max(maxDirectives, critical.length);

  for (const directive of sorted) {
    if (selected.length >= softLimit) {
      break;
    }
    if (selectedSet.has(directive)) {
      continue;
    }
    selected.push(directive);
    selectedSet.add(directive);
  }

  return {
    selected,
    omittedCount: Math.max(0, sorted.length - selected.length),
    selectionSummary: {
      promptType: "microsequence_repair_task",
      selectedDirectiveIndexes: sorted
        .map((directive, index) => ({ directive, index }))
        .filter(({ directive }) => selectedSet.has(directive))
        .map(({ index }) => index),
      omittedDirectiveIndexes: sorted
        .map((directive, index) => ({ directive, index }))
        .filter(({ directive }) => !selectedSet.has(directive))
        .map(({ index }) => index),
      selectedCount: selected.length,
      omittedCount: Math.max(0, sorted.length - selected.length),
      budgetPolicy: "flexible_preserve_critical_directives",
      rankedDirectives: sorted.map((directive, index) => ({
        index,
        directiveType: text(directive?.directiveType),
        didacticInterventionType: text(directive?.didacticInterventionType),
        providerIssueType: text(directive?.providerIssueType),
        severity: text(directive?.severity),
        requestedChangeId: text(directive?.requestedChangeId),
        target: structuredClone(directive?.target || {}),
        severityScore: scoreDirectiveSeverity(directive),
        targetProximityScore: scoreDirectiveTargetProximity(directive),
        includedInPrompt: selectedSet.has(directive),
        omissionReason: selectedSet.has(directive) ? "" : "lower_priority_than_prompt_budget"
      }))
    }
  };
}

export function buildMicrosequenceRepairTask(directivesArtifact = null) {
  const directives = Array.isArray(directivesArtifact?.directives) ? directivesArtifact.directives : [];
  if (!directives.length) {
    return "Corrija apenas lacunas de cobertura didática, domainRefs, practiceVariantRefs e progressão das microssequências, sem gerar cards.";
  }
  const { selected, omittedCount } = selectRepairDirectivesForTask(directives);
  const structuralLines = selected
    .filter((directive) => text(directive?.directiveType) === "repair_domain_coverage" && !text(directive?.providerIssueType))
    .map((directive) => `- ${describeMicrosequenceRepairDirective(directive)}`.trim());
  const interventionLines = selected
    .filter((directive) => text(directive?.directiveType) !== "repair_domain_coverage" && !text(directive?.providerIssueType))
    .map((directive) => `- ${describeMicrosequenceRepairDirective(directive)}`.trim());
  const providerAnchoredLines = selected
    .filter((directive) => text(directive?.providerIssueType))
    .map((directive) => `- ${describeMicrosequenceRepairDirective(directive)}`.trim());

  const sections = [
    "Corrija apenas as falhas didáticas apontadas, sem gerar cards nem ampliar o escopo."
  ];
  if (structuralLines.length) {
    sections.push("Lacunas estruturais determinísticas que precisam ser corrigidas obrigatoriamente:");
    sections.push(...structuralLines);
  }
  if (interventionLines.length) {
    sections.push("Diretivas de intervenção didática local:");
    sections.push(...interventionLines);
  }
  if (providerAnchoredLines.length) {
    sections.push("Ajustes finos locais sugeridos pela auditoria ancorada do provider:");
    sections.push(...providerAnchoredLines);
  }
  if (omittedCount > 0) {
    sections.push(`Outros ${omittedCount} ajustes de menor prioridade foram omitidos deste prompt para preservar foco no reparo crítico.`);
  }
  return sections.join("\n");
}
