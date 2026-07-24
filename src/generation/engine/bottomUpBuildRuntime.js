import { getTemplateDefinition } from "./templateCatalog.js";
import { parseCardSlotText } from "./slotParser.js";
import { buildRetryPrompt, collectPendingSlots, mergeAcceptedSlots } from "./slotRetry.js";
import { compileCardFromTemplate } from "./cardCompilers/index.js";
import { buildStablePromptPrefix } from "./enginePrompting.js";
import { parseMatrixRowSlot } from "./cardCompilers/matrixCompiler.js";
import { parseGraphVerticesSlot, parseGraphEdgesSlot } from "./cardCompilers/graphCompiler.js";
import { parseRelationItemsSlot, parseRelationPairsSlot } from "./cardCompilers/relationMapCompiler.js";
import { parseFlowStepsSlot } from "./cardCompilers/flowCompiler.js";
import { validateTextSlotContent } from "./templateSemanticValidation.js";
import { isFormulaNotation, validateFormulaExpression } from "../../domain/formulaExpression.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateForbiddenContent(value = "") {
  return validateTextSlotContent(value);
}

export function buildSlotSpecForTemplate(template = {}) {
  return (Array.isArray(template?.slots) ? template.slots : []).map((slot) => {
    const label = text(slot.label);
    const isAnswerId = /answerId/i.test(label);
    const isFormulaNotationSlot = template.resource === "formula" && label === "notation";
    const spec = {
      index: Number(slot.index),
      label,
      type: /^target(Row|Col)$/i.test(label) ? "integer" : (isAnswerId || isFormulaNotationSlot) ? "enum" : "text",
      required: !/^after$/i.test(label),
      ...(isAnswerId ? { allowedValues: ["a", "b", "c"] } : {}),
      ...(isFormulaNotationSlot ? { allowedValues: ["mathematics", "chemistry"] } : {})
    };
    if (!isAnswerId && !isFormulaNotationSlot) {
      spec.validate = (value) => {
        if (template.resource === "formula" && label === "expressionJson") {
          try {
            const expression = JSON.parse(text(value));
            const validation = validateFormulaExpression(expression);
            if (!validation.ok) {
              return validation.errors[0]?.message || "AST de fórmula inválida";
            }
            return { ok: true, value: JSON.stringify(expression) };
          } catch {
            return "expressionJson precisa conter uma AST de fórmula em JSON válido";
          }
        }
        const forbidden = validateForbiddenContent(value);
        if (forbidden !== true) {
          return forbidden;
        }
        if (template.resource === "matrix" && /^row\d+$/i.test(label)) {
          try {
            const row = parseMatrixRowSlot(value, { strict: true });
            return { ok: true, value: row.join(" | ") };
          } catch (error) {
            return error instanceof Error ? error.message : "linha de matriz inválida";
          }
        }
        if (/^target(Row|Col)$/i.test(label)) {
          if (!/^\d+$/u.test(text(value))) {
            return `${label} precisa ser inteiro positivo`;
          }
          if (Number(text(value)) < 1) {
            return `${label} precisa começar em 1`;
          }
          return { ok: true, value: String(Number(text(value))) };
        }
        if (template.resource === "graph" && label === "vertices") {
          try {
            return { ok: true, value: parseGraphVerticesSlot(value).join(" | ") };
          } catch (error) {
            return error instanceof Error ? error.message : "vértices de grafo inválidos";
          }
        }
        if (template.resource === "graph" && label === "edges") {
          try {
            const edges = text(value).includes("|")
              ? value.split("|").map((item) => text(item)).filter(Boolean)
              : value.split(",").map((item) => text(item)).filter(Boolean);
            if (!edges.length) {
              return "arestas do grafo precisam usar from>to";
            }
            const normalized = edges.map((item) => item.includes(">") ? item : item.replace("-", ">"));
            if (normalized.some((item) => !/^[^>]+>[^>]+$/u.test(item))) {
              return "arestas do grafo precisam usar from>to";
            }
            return { ok: true, value: normalized.join(" | ") };
          } catch (error) {
            return error instanceof Error ? error.message : "arestas de grafo inválidas";
          }
        }
        if (template.resource === "relation_map" && (label === "leftSet" || label === "rightSet")) {
          try {
            return { ok: true, value: parseRelationItemsSlot(value).join(" | ") };
          } catch (error) {
            return error instanceof Error ? error.message : "itens da relação inválidos";
          }
        }
        if (template.resource === "flow" && label === "steps") {
          try {
            return { ok: true, value: parseFlowStepsSlot(value).join(" | ") };
          } catch (error) {
            return error instanceof Error ? error.message : "passos do fluxo inválidos";
          }
        }
        if (template.kind === "theory" && /\[\[[\s\S]*?\]\]/u.test(String(value || ""))) {
          return "card teórico não pode conter lacuna";
        }
        return true;
      };
    }
    return spec;
  });
}

function buildPromptBase({ generationContract, cardSpec, template }) {
  const slotSchemaLines = template.slots.map((slot) => {
    const label = text(slot.label);
    if (template.resource === "matrix" && /^row\d+$/i.test(label)) {
      return `${slot.index}: ${label} (ex.: 2 | 5 | 8)`;
    }
    if (template.resource === "graph" && label === "vertices") {
      return `${slot.index}: ${label} (ex.: A | B | C | D)`;
    }
    if (template.resource === "graph" && label === "edges") {
      return `${slot.index}: ${label} (ex.: A>B | B>C | C>D)`;
    }
    if (template.resource === "flow" && label === "steps") {
      return `${slot.index}: ${label} (ex.: início | conferir dado | concluir, ou 1. início. 2. conferir dado. 3. concluir.)`;
    }
    if (template.resource === "tree" && label === "pathNodes") {
      return `${slot.index}: ${label} (ex.: raiz | pasta | arquivo)`;
    }
    if (template.resource === "relation_map" && label === "leftSet") {
      return `${slot.index}: ${label} (ex.: maçã | banana | uva)`;
    }
    if (template.resource === "relation_map" && label === "rightSet") {
      return `${slot.index}: ${label} (ex.: vermelho | amarelo | roxo)`;
    }
    if (template.resource === "relation_map" && label === "relations") {
      return `${slot.index}: ${label} (ex.: maçã-vermelho | banana-amarelo | uva-roxo)`;
    }
    if (/answerId/i.test(label)) {
      return `${slot.index}: ${label} (use apenas a, b ou c)`;
    }
    if (/^targetRow$/i.test(label)) {
      return `${slot.index}: ${label} (número da linha, começando em 1)`;
    }
    if (/^targetCol$/i.test(label)) {
      return `${slot.index}: ${label} (número da coluna, começando em 1)`;
    }
    return `${slot.index}: ${label}`;
  });
  const matrixInstructions = cardSpec.templateId === "matrix_locate_cell_choice"
    ? [
        "Use targetRow e targetCol para indicar a célula alvo.",
        "Uma das opções precisa ser exatamente o valor da célula alvo.",
        "Não informe answerId; o AraLearn calculará a resposta correta."
      ]
    : [];
  const relationInstructions = cardSpec.templateId === "relation_map_simple"
    ? [
        "Use leftSet e rightSet separados por |.",
        "Use relations no formato item-esquerdo-item-direito, separados por |.",
        "Não escreva leftSet, rightSet, relations, answerId ou JSON como conteúdo literal.",
        "Se houver pergunta fechada, apenas uma alternativa pode estar correta."
      ]
    : [];
  const flowInstructions = cardSpec.templateId === "flow_linear"
    ? [
        "Liste os passos em ordem usando | ou lista numerada.",
        "A pergunta precisa usar a ordem real dos passos.",
        "Quando isso deixar a resposta mais verificável, prefira perguntar qual passo vem imediatamente depois de um passo específico.",
        "Os distratores devem inverter ordem, pular passo ou apontar para passo incorreto."
      ]
    : [];
  const codeGapInstructions = cardSpec.templateId === "code_gap"
    ? [
        "No slot code, escreva o código completo com uma ou mais lacunas usando exatamente [[resposta::resposta|erro1|erro2]].",
        "Não use ___ e não mova a lacuna para question, options ou answer."
      ]
    : [];
  const formulaInstructions = cardSpec.templateId === "formula_theory" || cardSpec.templateId === "formula_choice"
    ? [
        "Use notation mathematics ou chemistry.",
        "Escreva expressionJson em uma única linha, como JSON da AST de fórmula; não envie MathML, HTML, LaTeX ou código executável.",
        "Escreva accessibleText como leitura completa da expressão para quem usa tecnologia assistiva."
      ]
    : [];
  const choiceOptionInstructions = template.exercise === "choice"
    ? [
        "Se uma alternativa precisar ser código, escreva o slot inteiro como bloco cercado por crases triplas com linguagem, por exemplo ```c ... ```."
      ]
    : [];
  return [
    buildStablePromptPrefix(),
    "Fase: bottom_up_card_build",
    `Microssequência: ${text(generationContract?.microsequence?.title)}`,
    `Card ${cardSpec.position}`,
    `Template: ${cardSpec.templateId}`,
    `Objetivo: ${text(cardSpec.goal)}`,
    "Preencha valores reais. Não repita rótulos como title, prompt, question, optionA ou after.",
    "Todos os slots listados abaixo são obrigatórios nesta rodada.",
    "Quando houver answerId, use apenas a, b ou c.",
    ...matrixInstructions,
    ...relationInstructions,
    ...flowInstructions,
    ...codeGapInstructions,
    ...formulaInstructions,
    ...choiceOptionInstructions,
    "Responda somente com:",
    `CARD ${cardSpec.position}`,
    ...slotSchemaLines
  ].join("\n");
}

function mapAcceptedSlots(accepted = {}) {
  return Object.fromEntries(
    Object.entries(accepted || {}).map(([slotIndex, item]) => [slotIndex, text(item?.value ?? item?.raw)])
  );
}

function validateAcceptedSlotsForTemplate(template = {}, accepted = {}) {
  const normalized = mapAcceptedSlots(accepted);
  if (template.resource === "formula") {
    if (normalized["3"] && !isFormulaNotation(normalized["3"].toLowerCase())) {
      return {
        index: 3,
        raw: normalized["3"],
        reason: "notation precisa ser mathematics ou chemistry"
      };
    }
    if (normalized["5"]) {
      try {
        const expression = JSON.parse(normalized["5"]);
        const validation = validateFormulaExpression(expression);
        if (!validation.ok) {
          return {
            index: 5,
            raw: normalized["5"],
            reason: validation.errors[0]?.message || "AST de fórmula inválida"
          };
        }
        accepted["5"] = { raw: normalized["5"], value: JSON.stringify(expression) };
      } catch {
        return {
          index: 5,
          raw: normalized["5"],
          reason: "expressionJson precisa conter uma AST de fórmula em JSON válido"
        };
      }
    }
  }
  if (template.resource === "graph" && normalized["3"] && normalized["4"]) {
    try {
      const vertices = parseGraphVerticesSlot(normalized["3"]);
      parseGraphEdgesSlot(normalized["4"], vertices);
    } catch (error) {
      return {
        index: 4,
        raw: normalized["4"],
        reason: error instanceof Error ? error.message : "arestas do grafo inválidas"
      };
    }
  }
  if (template.resource === "relation_map" && normalized["3"] && normalized["4"] && normalized["5"]) {
    try {
      const leftItems = parseRelationItemsSlot(normalized["3"]);
      const rightItems = parseRelationItemsSlot(normalized["4"]);
      const normalizedPairs = parseRelationPairsSlot(normalized["5"], { leftItems, rightItems }).map((pair) => `${pair.fromLabel}-${pair.toLabel}`);
      accepted["5"] = {
        raw: normalized["5"],
        value: normalizedPairs.join(" | ")
      };
    } catch (error) {
      return {
        index: 5,
        raw: normalized["5"],
        reason: error instanceof Error ? error.message : "pares da relação inválidos"
      };
    }
  }
  if (template.resource === "flow" && normalized["3"]) {
    try {
      const normalizedSteps = parseFlowStepsSlot(normalized["3"]).join(" | ");
      accepted["3"] = {
        raw: normalized["3"],
        value: normalizedSteps
      };
    } catch (error) {
      return {
        index: 3,
        raw: normalized["3"],
        reason: error instanceof Error ? error.message : "passos do fluxo inválidos"
      };
    }
  }
  return null;
}

function buildSemanticRetryInvalids(template = {}, templateId = "", message = "") {
  const source = text(message).toLowerCase();
  if (template.resource === "formula") {
    if (source.includes("notation")) {
      return [{ index: 3, raw: "", reason: text(message) }];
    }
    if (source.includes("accessibletext")) {
      return [{ index: 4, raw: "", reason: text(message) }];
    }
    if (source.includes("expression") || source.includes("ast de fórmula") || source.includes("nó de fórmula")) {
      return [{ index: 5, raw: "", reason: text(message) }];
    }
    if (templateId === "formula_choice" && source.includes("answer")) {
      return [{ index: 10, raw: "", reason: text(message) }];
    }
  }
  if (templateId === "matrix_locate_cell_choice") {
    if (source.includes("nenhuma opção corresponde") || source.includes("mais de uma opção corresponde") || source.includes("opções repetidas")) {
      return [9, 10, 11].map((index) => ({ index, raw: "", reason: text(message) }));
    }
    if (source.includes("targetrow")) {
      return [{ index: 6, raw: "", reason: text(message) }];
    }
    if (source.includes("targetcol")) {
      return [{ index: 7, raw: "", reason: text(message) }];
    }
    if (source.includes("question não pode revelar literalmente a resposta")) {
      return [{ index: 8, raw: "", reason: text(message) }];
    }
  }
  if (template.resource === "graph" && source.includes("answerid inválido")) {
    return [{ index: 9, raw: "", reason: text(message) }];
  }
  if (template.resource === "graph" && source.includes("question não pode revelar literalmente a resposta")) {
    return [{ index: 5, raw: "", reason: text(message) }];
  }
  if (template.resource === "graph" && source.includes("múltiplas alternativas válidas")) {
    return [6, 7, 8].map((index) => ({ index, raw: "", reason: text(message) }));
  }
  if (template.resource === "graph" && source.includes("nenhuma alternativa forma caminho simples válido")) {
    return [6, 7, 8].map((index) => ({ index, raw: "", reason: text(message) }));
  }
  if (template.resource === "graph" && source.includes("feedback contraditório")) {
    return [{ index: 10, raw: "", reason: text(message) }];
  }
  if (templateId === "code_gap" && (source.includes("code gap") || source.includes("lacuna") || source.includes("question, options ou answer"))) {
    return [{ index: 4, raw: "", reason: text(message) }];
  }
  return [];
}

async function fillOneCard({ provider, modelId, cardSpec, generationContract, logger }) {
  const template = getTemplateDefinition(cardSpec.templateId);
  if (!template) {
    throw new Error(`Template ausente no catálogo: ${cardSpec.templateId}.`);
  }
  const promptBase = buildPromptBase({ generationContract, cardSpec, template });
  let accepted = {};
  let lastTrace = null;
  for (let retries = 0; retries <= 2; retries += 1) {
    const pendingSlotIndexes = retries === 0
      ? null
      : collectPendingSlots({ cardResult: lastTrace }).map((item) => Number(item.slotIndex));
    const activeSchema = buildSlotSpecForTemplate(template).filter((slot) => !pendingSlotIndexes || pendingSlotIndexes.includes(Number(slot.index)));
    const prompt = retries === 0
      ? promptBase
      : `${promptBase}\n\n${buildRetryPrompt({
          phase: "bottom_up_card_build",
          cardIndex: cardSpec.position,
          pendingSlots: collectPendingSlots({ cardResult: lastTrace }),
          slotSchema: buildSlotSpecForTemplate(template),
          duplicate: lastTrace?.duplicate,
          extra: lastTrace?.extra
        })}`;
    const startedAt = Date.now();
    const result = await provider.generateText({
      modelId,
      phase: "bottom_up_card_build",
      system: "Responda somente com slots.",
      prompt,
      temperature: retries === 0 ? 0.1 : 0,
      maxTokens: 2200,
      engineContext: {
        generationContract,
        cardSpec,
        acceptedSlots: mapAcceptedSlots(accepted),
        retries
      }
    });
    const parsed = parseCardSlotText(result.text, {
      cards: [{ position: cardSpec.position, slots: activeSchema }]
    });
    const parsedCard = parsed.cards[0] || { position: cardSpec.position, accepted: {}, missing: [], invalid: [], duplicate: [], extra: [] };
    accepted = mergeAcceptedSlots(accepted, parsedCard);
    const templateValidationError = validateAcceptedSlotsForTemplate(template, accepted);
    const completeSchema = buildSlotSpecForTemplate(template);
    lastTrace = {
      position: Number(cardSpec.position),
      accepted,
      missing: completeSchema
        .filter((slot) => slot.required !== false && !(String(slot.index) in accepted))
        .map((slot) => ({ index: Number(slot.index), reason: "slot ausente" })),
      invalid: templateValidationError ? [...parsedCard.invalid, templateValidationError] : parsedCard.invalid,
      duplicate: parsedCard.duplicate,
      extra: parsedCard.extra
    };
    logger?.log({
      phase: "bottom_up_card_build",
      model: modelId,
      usage: result.usage,
      latencyMs: Date.now() - startedAt,
      slotRetries: retries,
      slotErrors: [structuredClone(lastTrace)],
      rawText: result.text,
      parsedSlots: structuredClone(lastTrace)
    });
    if (!collectPendingSlots({ cardResult: lastTrace }).length && !lastTrace.extra.length) {
      try {
        compileCardFromTemplate({
          templateId: cardSpec.templateId,
          slots: mapAcceptedSlots(accepted),
          position: Number(cardSpec.position),
          planItem: cardSpec,
          context: generationContract
        });
      } catch (error) {
        const semanticInvalids = buildSemanticRetryInvalids(template, cardSpec.templateId, error instanceof Error ? error.message : String(error));
        if (semanticInvalids.length && retries < 2) {
          lastTrace = {
            ...lastTrace,
            invalid: semanticInvalids
          };
          continue;
        }
        throw error;
      }
      return {
        position: Number(cardSpec.position),
        templateId: cardSpec.templateId,
        slots: mapAcceptedSlots(accepted),
        trace: structuredClone(lastTrace),
        rawText: result.text
      };
    }
  }
  throw new Error(`fail_closed no card ${cardSpec.position}: ${JSON.stringify(lastTrace)}`);
}

export function compileCardsFromSlotPackets(planItems = [], slotPackets = [], generationContract = {}) {
  const packetByPosition = new Map((Array.isArray(slotPackets) ? slotPackets : []).map((item) => [Number(item.position), item]));
  return (Array.isArray(planItems) ? planItems : []).map((item) => {
    const packet = packetByPosition.get(Number(item.position));
    if (!packet) {
      throw new Error(`Slots ausentes para o card ${item.position}.`);
    }
    return compileCardFromTemplate({
      templateId: item.templateId,
      slots: packet.slots,
      position: Number(item.position),
      planItem: item,
      context: generationContract
    });
  });
}

export async function runBottomUpCardBuild({
  provider,
  modelId,
  generationContract,
  planItems,
  logger
} = {}) {
  if (!provider?.generateText) {
    throw new Error("Provider sem canal textual para build de cards.");
  }
  const slotPackets = [];
  for (const item of Array.isArray(planItems) ? planItems : []) {
    slotPackets.push(await fillOneCard({ provider, modelId, cardSpec: item, generationContract, logger }));
  }
  return {
    slotPackets,
    cards: compileCardsFromSlotPackets(planItems, slotPackets, generationContract)
  };
}
