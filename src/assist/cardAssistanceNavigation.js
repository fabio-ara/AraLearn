import { listCardAssistanceLedgerVersions } from "./cardAssistanceLedger.js";
import { RESOURCE_CATALOG } from "../resources/catalog/resourceCatalog.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function activeVersions(ledger) {
  if (!ledger) return [];
  return listCardAssistanceLedgerVersions(ledger)
    .filter(({ active }) => active)
    .sort((left, right) => left.sequence - right.sequence);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const GENERIC_STRUCTURAL_TERMS = [
  "representacao", "representacoes", "resource", "resources", "recurso", "recursos",
  "diagrama", "diagramas", "estrutura", "estruturas", "layout", "layouts", "resposta",
  "respostas", "alternativa", "alternativas", "gabarito", "gabaritos", "lacuna", "lacunas",
  "choice", "choices", "gap", "gaps", "pratica", "praticas", "atividade", "atividades",
  "exercicio", "exercicios", "bloco", "blocos", "package", "packages", "pacote", "pacotes"
];
const STRUCTURAL_OBJECT_PATTERN = new RegExp(
  `\\b(?:${[...new Set([
    ...GENERIC_STRUCTURAL_TERMS,
    ...(RESOURCE_CATALOG.representationTerms || [])
  ])].sort((left, right) => right.length - left.length).map(escapeRegExp).join("|")})\\b`,
  "gu"
);
const STRUCTURAL_ACTION_PATTERN = /\b(?:trocar|troque|troca|trocando|substituir|substitua|substitui|transformar|transforme|transforma|recompor|recomponha|recompoe|reconstruir|reconstrua|reconstroi|adicionar|adicione|adiciona|acrescentar|acrescente|acrescenta|remover|remova|remove|retirar|retire|retira|eliminar|elimine|elimina|incluir|inclua|inclui|converter|converta|converte|mudar|mude|muda|alterar|altere|altera|usar|use|usa|adotar|adote|adota|criar|crie|cria|combinar|combine|combina|fazer|faca|faz)\b/gu;
const STRUCTURAL_DESIRE_PATTERN = /\b(?:(?:quero|gostaria)\s+(?:(?:de|usar|ver|ter|adicionar|incluir)\s+)?(?:um|uma|uns|umas)|preciso\s+(?:de\s+)?(?:um|uma|uns|umas))\s+/gu;
const DIRECT_STRUCTURAL_DESIRE_PATTERN = /\b(?:quero|gostaria(?:\s+de)?|prefiro)\b/gu;
const PROSE_ONLY_DESIRE_PATTERN = /^(?:texto|paragrafo|prosa|explicacao|narrativa|redacao|versao)$/u;
const PROSE_TERM_PATTERN = /\b(?:texto|paragrafo|prosa|explicacao|narrativa|redacao|versao)\b/gu;
const OWNED_TEXT_FIELD_PATTERN = /\b(?:rotulo|titulo|legenda|descricao|nome|texto)(?:\s+[a-z0-9]+){0,3}\s+(?:do|da|de|dos|das|no|na|nos|nas)\s*$/u;
const AMBIGUOUS_PROSE_ACTION_PATTERN = /^(?:mudar|mude|muda|alterar|altere|altera)$/u;

function actionIsNegated(clause, action, object) {
  const prefix = clause.slice(Math.max(0, action.index - 120), action.index);
  const negation = prefix.match(
    /\b(?:nao|nunca|jamais|nem|sem|evite|evitar)(?:\s+[a-z0-9]+){0,8}\s*$/u
  );
  if (negation && !/\bnao\s+(?:so|apenas)\b/u.test(negation[0]) &&
      !/\bnao\s+deixe\s+de\b/u.test(negation[0])) {
    return true;
  }
  const actionEnd = action.index + action[0].length;
  if (object.index >= actionEnd) {
    const between = clause.slice(actionEnd, object.index);
    if (/\b(?:nao|nem)\b/u.test(between)) return true;
  }
  return false;
}

function asksForStructuralComposition(normalized) {
  const clauses = normalized.split(
    /\s*(?:[.!?;,:]+|\b(?:mas|porem|contudo|entretanto|todavia)\b)\s*/u
  ).filter(Boolean);
  return clauses.some((clause) => {
    const objects = [...clause.matchAll(STRUCTURAL_OBJECT_PATTERN)];
    const mutations = [...clause.matchAll(STRUCTURAL_ACTION_PATTERN)];
    const desires = [...clause.matchAll(STRUCTURAL_DESIRE_PATTERN)];
    const directDesires = [...clause.matchAll(DIRECT_STRUCTURAL_DESIRE_PATTERN)];
    const proseTerms = [...clause.matchAll(PROSE_TERM_PATTERN)];
    const hasNonProseObject = objects.some(({ 0: object }) => (
      !PROSE_ONLY_DESIRE_PATTERN.test(object)
    ));
    const mutationRequested = mutations.some((action, actionIndex) => {
      const nextActionIndex = mutations[actionIndex + 1]?.index ?? Number.POSITIVE_INFINITY;
      return objects.some((object) => {
        if (object.index <= action.index || object.index >= nextActionIndex ||
            object.index - action.index > 180) {
          return false;
        }
        const between = clause.slice(action.index + action[0].length, object.index);
        if (OWNED_TEXT_FIELD_PATTERN.test(between)) return false;
        if (PROSE_ONLY_DESIRE_PATTERN.test(object[0]) &&
            AMBIGUOUS_PROSE_ACTION_PATTERN.test(action[0])) {
          if (!/\b(?:para|por|em)\s+(?:um|uma|uns|umas)?\s*$/u.test(between)) return false;
        }
        if (PROSE_ONLY_DESIRE_PATTERN.test(object[0]) &&
            proseTerms.length >= 2 && !hasNonProseObject) {
          return false;
        }
        return !actionIsNegated(clause, action, object);
      });
    });
    if (mutationRequested) return true;
    if (desires.some((action) => objects.some((object) => (
      !PROSE_ONLY_DESIRE_PATTERN.test(object[0]) &&
      Math.abs(action.index - object.index) <= 180 &&
      !actionIsNegated(clause, action, object)
    )))) return true;
    return directDesires.some((action) => {
      const nextMutationIndex = mutations.find(({ index }) => index > action.index)?.index ??
        Number.POSITIVE_INFINITY;
      return objects.some((object) => {
        if (object.index <= action.index || object.index >= nextMutationIndex ||
            object.index - action.index > 100 ||
            PROSE_ONLY_DESIRE_PATTERN.test(object[0])) {
          return false;
        }
        const between = clause.slice(action.index + action[0].length, object.index);
        if (/\b(?:manter|preservar|conservar|continuar|sem)\b/u.test(between)) return false;
        return !actionIsNegated(clause, action, object);
      });
    });
  });
}

export function cardAssistanceLedgerNavigation(ledger) {
  const versions = activeVersions(ledger);
  const index = versions.findIndex(({ current }) => current);
  return {
    canUndo: index > 0,
    canRedo: index >= 0 && index < versions.length - 1,
    previousVersionId: index > 0 ? versions[index - 1].id : "",
    nextVersionId: index >= 0 && index < versions.length - 1
      ? versions[index + 1].id
      : ""
  };
}

export function resolveCardAssistanceNavigationPrompt(promptText, ledger) {
  const prompt = text(promptText);
  const normalized = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const versions = activeVersions(ledger);
  const currentIndex = versions.findIndex(({ current }) => current);
  const clauses = normalized.split(
    /\s*(?:[.!?;,:]+|\b(?:mas|porem|contudo|entretanto|todavia)\b)\s*/u
  ).filter(Boolean);
  const navigationRequest = (actionPattern, targetPattern) => clauses.find((clause) => {
    const actions = [...clause.matchAll(actionPattern)];
    const targets = [...clause.matchAll(targetPattern)];
    return actions.some((action) => targets.some((target) => (
      Math.abs(action.index - target.index) <= 120 &&
      !actionIsNegated(clause, action, target)
    )));
  }) || "";
  const explicitClause = navigationRequest(
    /\b(?:voltar|volte|restaurar|restaure|retornar|retorne|recuperar|recupere|repor|reponha|ir|va)\b/gu,
    /\b(?:versao|resultado|v)\s*#?\s*\d+\b/gu
  );
  const explicit = explicitClause.match(/\b(?:versao|resultado|v)\s*#?\s*(\d+)\b/);
  const explicitRestoreRequested = Boolean(explicit);
  const undoRequested = Boolean(navigationRequest(
    /\b(?:voltar|volte|desfazer|desfaca|restaurar|restaure|retornar|retorne)\b/gu,
    /\b(?:anterior|antes|ultimo|ultima|versao|resultado|v\s*\d+)\b/gu
  ));
  const redoRequested = Boolean(navigationRequest(
    /\b(?:refazer|refaca|avancar|avance|restaurar|restaure|retornar|retorne)\b/gu,
    /\b(?:seguinte|posterior|proximo|depois)\b/gu
  ));
  if (!explicitRestoreRequested && !undoRequested && !redoRequested) return null;

  let target = null;
  if (explicitRestoreRequested) {
    target = versions.find(({ sequence }) => sequence === Number(explicit[1])) || null;
  } else if (undoRequested && currentIndex > 0) {
    target = versions[currentIndex - 1];
  } else if (redoRequested && currentIndex >= 0 && currentIndex < versions.length - 1) {
    target = versions[currentIndex + 1];
  }
  return {
    matched: true,
    versionId: target?.id || "",
    errorMessage: target
      ? ""
      : "Essa versão não está disponível no histórico desta conversa."
  };
}

export function resolveCardAssistanceChatOperation(promptText, { wholeCardSelected } = {}) {
  if (!wholeCardSelected) return "edit_text";
  const normalized = text(promptText)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return asksForStructuralComposition(normalized) ? "recompose_card" : "edit_text";
}
