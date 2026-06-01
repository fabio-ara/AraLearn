import { assertCodeFamily, isCodeKnown } from "./slotCodebook.js";
import { normalizeQuotedTextValue } from "./templateSemanticValidation.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLines(rawText = "") {
  return String(rawText || "").replace(/\r\n/g, "\n").split("\n");
}

function parseCardBlocks(rawText = "") {
  const blocks = [];
  let current = null;
  normalizeLines(rawText).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }
    const cardMatch = line.match(/^CARD\s+(\d+)$/i);
    if (cardMatch) {
      current = {
        position: Number(cardMatch[1]),
        entries: []
      };
      blocks.push(current);
      return;
    }
    if (!current) {
      return;
    }
    const slotMatch = line.match(/^(\d+)\s*:\s*([\s\S]*)$/);
    if (!slotMatch) {
      current.entries.push({
        slotIndex: null,
        raw: line,
        kind: "unparsed"
      });
      return;
    }
    current.entries.push({
      slotIndex: Number(slotMatch[1]),
      raw: text(slotMatch[2]),
      kind: "slot"
    });
  });
  return blocks;
}

function validateSlotValue(rawValue, slotSpec = {}) {
  const raw = String(rawValue ?? "");
  const normalizedRaw = slotSpec.type === "text" ? normalizeQuotedTextValue(raw) : raw;
  const trimmed = text(normalizedRaw);
  if (!trimmed && slotSpec.allowEmpty !== true) {
    return { ok: false, reason: "slot vazio" };
  }
  if (slotSpec.type === "code") {
    if (!/^\d+$/u.test(trimmed)) {
      return { ok: false, reason: "esperado código numérico" };
    }
    const numeric = Number(trimmed);
    if (!isCodeKnown(numeric)) {
      return { ok: false, reason: `código desconhecido: ${trimmed}` };
    }
    if (slotSpec.family) {
      try {
        assertCodeFamily(numeric, slotSpec.family);
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : "família inválida" };
      }
    }
    return { ok: true, value: numeric };
  }
  if (slotSpec.type === "enum") {
    const normalized = trimmed.toLowerCase();
    const normalizedAlias = ({ "1": "a", "2": "b", "3": "c" })[normalized] || normalized;
    const allowed = Array.isArray(slotSpec.allowedValues) ? slotSpec.allowedValues.map((item) => text(item).toLowerCase()) : [];
    if (!allowed.includes(normalizedAlias)) {
      return { ok: false, reason: `valor inválido: ${trimmed}` };
    }
    return { ok: true, value: normalizedAlias };
  }
  if (slotSpec.type === "integer") {
    if (!/^\d+$/u.test(trimmed)) {
      return { ok: false, reason: "esperado inteiro positivo" };
    }
    if (Number(trimmed) < 1) {
      return { ok: false, reason: "inteiro precisa começar em 1" };
    }
    if (typeof slotSpec.validate === "function") {
      const verdict = slotSpec.validate(trimmed, slotSpec);
      if (verdict !== true && verdict?.ok === false) {
        return { ok: false, reason: text(verdict.reason) || "slot inválido" };
      }
      if (typeof verdict === "string") {
        return { ok: false, reason: verdict };
      }
      return { ok: true, value: String(Number(verdict?.value ?? trimmed)) };
    }
    return { ok: true, value: String(Number(trimmed)) };
  }
  if (typeof slotSpec.validate === "function") {
    const verdict = slotSpec.validate(trimmed, slotSpec);
    if (verdict === true || verdict === undefined || verdict === null) {
      return { ok: true, value: trimmed };
    }
    if (typeof verdict === "string") {
      return { ok: false, reason: verdict };
    }
    if (typeof verdict === "object") {
      if (verdict.ok === false) {
        return { ok: false, reason: text(verdict.reason) || "slot inválido" };
      }
      return { ok: true, value: verdict.value ?? trimmed };
    }
  }
  if (slotSpec.type === "text" && text(slotSpec.label).toLowerCase() === trimmed.toLowerCase()) {
    return { ok: false, reason: "valor repete o nome do slot" };
  }
  return { ok: true, value: trimmed };
}

function parseWithSpec(rawText = "", spec = {}) {
  const cards = [];
  const blocks = parseCardBlocks(rawText);
  const expectedCards = Array.isArray(spec.cards) ? spec.cards : [];
  const blockByPosition = new Map(blocks.map((block) => [Number(block.position), block]));
  for (const cardSpec of expectedCards) {
    const slotSchema = Array.isArray(cardSpec?.slots) ? cardSpec.slots : [];
    const slotSchemaByIndex = new Map(slotSchema.map((slot) => [Number(slot.index), slot]));
    const block = blockByPosition.get(Number(cardSpec.position));
    const groupedEntries = new Map();
    const entries = Array.isArray(block?.entries) ? block.entries : [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!Number.isInteger(entry.slotIndex)) {
        continue;
      }
      const slot = slotSchemaByIndex.get(Number(entry.slotIndex));
      const continuationLines = [];
      let cursor = index + 1;
      while (cursor < entries.length && !Number.isInteger(entries[cursor]?.slotIndex)) {
        continuationLines.push(text(entries[cursor]?.raw));
        cursor += 1;
      }
      if (continuationLines.length) {
        index = cursor - 1;
      }
      const continuationText = continuationLines.filter(Boolean).join("\n");
      const value = continuationText
        ? (text(entry.raw).toLowerCase() === text(slot?.label).toLowerCase() || !text(entry.raw)
            ? continuationText
            : `${text(entry.raw)}\n${continuationText}`)
        : entry.raw;
      const items = groupedEntries.get(entry.slotIndex) || [];
      items.push(value);
      groupedEntries.set(entry.slotIndex, items);
    }
    const cardResult = {
      position: Number(cardSpec.position),
      accepted: {},
      missing: [],
      invalid: [],
      duplicate: [],
      extra: []
    };

    slotSchema.forEach((slot) => {
      const slotIndex = Number(slot.index);
      const values = groupedEntries.get(slotIndex) || [];
      if (values.length > 1) {
        cardResult.duplicate.push({ index: slotIndex, values: [...values] });
        return;
      }
      if (!values.length) {
        if (slot.required !== false) {
          cardResult.missing.push({ index: slotIndex, reason: "slot ausente" });
        }
        return;
      }
      const raw = values[0];
      const validation = validateSlotValue(raw, slot);
      if (!validation.ok) {
        cardResult.invalid.push({
          index: slotIndex,
          raw,
          reason: validation.reason
        });
        return;
      }
      cardResult.accepted[String(slotIndex)] = {
        raw,
        value: validation.value
      };
    });

    groupedEntries.forEach((values, slotIndex) => {
      if (slotSchemaByIndex.has(Number(slotIndex))) {
        return;
      }
      values.forEach((raw) => {
        cardResult.extra.push({ index: Number(slotIndex), raw });
      });
    });
    cards.push(cardResult);
  }

  blocks.forEach((block) => {
    if (expectedCards.some((item) => Number(item.position) === Number(block.position))) {
      return;
    }
    cards.push({
      position: Number(block.position),
      accepted: {},
      missing: [],
      invalid: [],
      duplicate: [],
      extra: (block.entries || []).map((entry) => ({
        index: Number.isInteger(entry.slotIndex) ? Number(entry.slotIndex) : -1,
        raw: entry.raw
      }))
    });
  });

  return {
    ok: cards.every((card) => !card.missing.length && !card.invalid.length && !card.duplicate.length && !card.extra.length),
    cards
  };
}

export function parseCardSlotText(rawText = "", spec = null) {
  if (spec && typeof spec === "object") {
    return parseWithSpec(rawText, spec);
  }
  return parseCardBlocks(rawText).map((block) => ({
    cardIndex: block.position,
    slots: Object.fromEntries(
      block.entries
        .filter((entry) => Number.isInteger(entry.slotIndex))
        .map((entry) => [entry.slotIndex, entry.raw])
    )
  }));
}

export function parseAuditText(rawText = "") {
  const lines = normalizeLines(rawText).map((line) => line.trim()).filter(Boolean);
  const result = {
    status: null,
    cards: [],
    invalidGlobalLines: []
  };
  let current = null;
  lines.forEach((line) => {
    if (/^AUDIT$/i.test(line)) {
      return;
    }
    const statusMatch = line.match(/^status\s*:\s*(\d+)$/i);
    if (statusMatch && !current) {
      result.status = Number(statusMatch[1]);
      return;
    }
    const cardMatch = line.match(/^CARD\s+(\d+)$/i);
    if (cardMatch) {
      current = {
        cardIndex: Number(cardMatch[1]),
        patches: {},
        action: null,
        reason: "",
        invalidPatches: []
      };
      result.cards.push(current);
      return;
    }
    if (!current) {
      result.invalidGlobalLines.push({
        raw: line,
        reason: "linha fora do bloco AUDIT/CARD"
      });
      return;
    }
    const actionMatch = line.match(/^action\s*:\s*(\d+)$/i);
    if (actionMatch) {
      current.action = Number(actionMatch[1]);
      return;
    }
    const reasonMatch = line.match(/^reason\s*:\s*([\s\S]+)$/i);
    if (reasonMatch) {
      current.reason = text(reasonMatch[1]);
      return;
    }
    const patchMatch = line.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*([\s\S]*)$/);
    if (patchMatch) {
      current.invalidPatches.push({
        key: text(patchMatch[1]),
        raw: text(patchMatch[2]),
        reason: "auditoria só pode alterar slots numéricos"
      });
      return;
    }
    const slotPatchMatch = line.match(/^(\d+)\s*:\s*([\s\S]*)$/);
    if (slotPatchMatch) {
      const slotIndex = String(Number(slotPatchMatch[1]));
      if (slotIndex in current.patches) {
        current.invalidPatches.push({
          key: slotIndex,
          raw: text(slotPatchMatch[2]),
          reason: "slot de auditoria duplicado"
        });
        return;
      }
      current.patches[slotIndex] = text(slotPatchMatch[2]);
      return;
    }
    current.invalidPatches.push({
      key: "",
      raw: line,
      reason: "linha de auditoria inválida"
    });
  });
  return result;
}

export function parseTopDownAuditText(rawText = "") {
  const lines = normalizeLines(rawText)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/u, ""));
  const result = {
    patches: [],
    invalidPatches: [],
    invalidGlobalLines: [],
    status: null
  };
  let current = null;
  lines.forEach((line) => {
    if (/^(STATUS\s+OK|status\s*:\s*1201)$/i.test(line)) {
      result.status = 1201;
      return;
    }
    if (/^PATCH\s+MICROSEQUENCE$/i.test(line)) {
      current = {
        target: "",
        fields: {}
      };
      result.patches.push(current);
      return;
    }
    const inlineMatch = line.match(/^PATCH\s+MICROSEQUENCE\s+(.+)$/i);
    if (inlineMatch) {
      result.invalidPatches.push({
        raw: line,
        reason: "patch top-down precisa usar target: em linha própria"
      });
      return;
    }
    if (!current) {
      result.invalidGlobalLines.push({
        raw: line,
        reason: "linha fora de PATCH MICROSEQUENCE"
      });
      return;
    }
    const fieldMatch = line.match(/^([a-zA-Z]+)\s*:\s*([\s\S]*)$/);
    if (fieldMatch) {
      const fieldName = text(fieldMatch[1]);
      const fieldValue = text(fieldMatch[2]).replace(/^\[\s*([\s\S]*?)\s*\]$/u, "$1");
      if (fieldName === "target") {
        if (current.target) {
          current = {
            target: fieldValue,
            fields: {}
          };
          result.patches.push(current);
          return;
        }
        current.target = fieldValue;
        return;
      }
      if (!["dependsOn", "goal", "covers", "checks", "moveAfter"].includes(fieldName)) {
        result.invalidPatches.push({
          raw: line,
          reason: `campo top-down inválido: ${fieldName}`
        });
        return;
      }
      if (!fieldValue && (fieldName === "dependsOn" || fieldName === "moveAfter")) {
        return;
      }
      current.fields[fieldName] = fieldValue;
      return;
    }
    result.invalidPatches.push({
      raw: line,
      reason: "linha de patch top-down inválida"
    });
  });
  if (result.status === 1201 && result.patches.length) {
    result.invalidGlobalLines.push({
      raw: "STATUS OK",
      reason: "auditoria top-down não pode misturar PATCH MICROSEQUENCE com STATUS OK"
    });
  }
  return result;
}

export function parsePipeList(value = "") {
  return text(value)
    .split("|")
    .map((item) => text(item))
    .filter(Boolean);
}

export function parseCsvPair(value = "") {
  const match = text(value).match(/^\(?\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*\)?$/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2])];
}
