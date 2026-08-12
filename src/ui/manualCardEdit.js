import { validateCard } from "../domain/cards.js";
import { buildResourceGapModel } from "../core/resourceGaps.js";
import { validateCardEnvelope } from "../resources/kernel/cardEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import {
  listCardMainResourceFieldNames,
  listCardResponseFieldNames
} from "../assist/cardAssistanceScope.js";

const PROTECTED_FIELD_NAMES = new Set([
  "id",
  "position",
  "resource",
  "kind",
  "exercise",
  "gaps",
  "sources",
  "topics",
  "languageTag",
  "textDirection",
  "selectionMode",
  "selectionCriterion",
  "answerIds",
  "layout",
  "variant",
  "language",
  "notation",
  "chartType",
  "writingMode",
  "alignment",
  "reactionType",
  "entryType",
  "parentId",
  "practice",
  "groupId",
  "from",
  "to",
  "targetIds",
  "directed",
  "type",
  "role",
  "shape",
  "tone",
  "state",
  "charge",
  "open",
  "close"
]);

const EDITABLE_FIELDS_BY_RESOURCE = Object.freeze({
  heading: ["value"],
  paragraph: ["text", "value"],
  choice: ["question", "options"],
  code: ["prompt", "code"],
  table: ["columns", "rows"],
  flow: ["prompt", "structure"],
  tree: ["prompt", "nodes"],
  graph: ["prompt", "vertices", "edges"],
  relation_map: ["prompt", "leftSet", "rightSet", "relations", "pairList", "relationTable"],
  matrix: ["prompt", "name", "values", "sequence"],
  plane: ["prompt", "result"],
  formula: ["prompt", "accessibleText", "expression"],
  chart: ["prompt", "xAxis", "yAxis", "series"],
  sequence: ["prompt", "items"],
  annotated_text: ["prompt", "segments", "annotations"],
  linguistic_example: ["prompt", "units"],
  system_map: ["prompt", "groups", "nodes", "links"],
  reaction: ["prompt", "reactants", "products", "conditions"]
});

const EDITABLE_PRIMITIVE_ARRAY_FIELDS = new Set([
  "columns",
  "rows",
  "values",
  "conditions",
  "pairList"
]);

const EDITABLE_LEAF_FIELD_NAMES = new Set([
  "accessibleText",
  "title",
  "text",
  "value",
  "prompt",
  "question",
  "feedback",
  "code",
  "after",
  "label",
  "name",
  "detail",
  "note",
  "form",
  "traditional",
  "simplified",
  "reading",
  "ipa",
  "gloss",
  "translation",
  "formula",
  "coefficient",
  "unit",
  "weight",
  "condition",
  "expression",
  "init",
  "update",
  "match",
  "result",
  "connector"
]);

const FLOW_BINARY_BRANCH_KINDS = new Set([
  "if_then",
  "if_then_else",
  "while",
  "do_while",
  "for"
]);

function text(value) {
  return typeof value === "string" ? value : "";
}

function packageResourceKind(packageId = "") {
  return String(packageId)
    .replace(/^aralearn\.(?:resource|response)\./u, "")
    .replace(/-/gu, "_");
}

function resolvePackageTarget(card, requested) {
  const slots = {
    content: Array.isArray(card.content) ? card.content : [],
    feedback: Array.isArray(card.feedback) ? card.feedback : [],
    response: card.response ? [card.response] : []
  };
  const [slot, ...idParts] = requested.split(":");
  const instanceId = idParts.join(":");
  if (!Object.hasOwn(slots, slot) || !instanceId) return null;
  const instance = slots[slot].find((candidate) => text(candidate?.id) === instanceId);
  if (!instance) return null;
  const kind = packageResourceKind(instance.package);
  return {
    value: instance.data,
    collection: `package:${slot}`,
    package: instance.package,
    editableFields: new Set(EDITABLE_FIELDS_BY_RESOURCE[kind] || [])
  };
}

function resolveTarget(card, targetId) {
  const requested = text(targetId).trim();
  if (Array.isArray(card?.content)) {
    if (requested === "card") {
      return {
        value: card,
        collection: "card",
        editableFields: new Set(["title"])
      };
    }
    return resolvePackageTarget(card, requested);
  }
  if (requested.startsWith("body:")) {
    const id = requested.slice(5);
    const index = (card.blocks || []).findIndex((block) => text(block?.id) === id);
    return index < 0 ? null : {
      value: card.blocks[index],
      collection: "blocks",
      editableFields: new Set(EDITABLE_FIELDS_BY_RESOURCE[card.blocks[index]?.kind] || [])
    };
  }
  if (requested.startsWith("after:") && requested !== "after:text") {
    const id = requested.slice(6);
    const index = (card.afterBlocks || []).findIndex((block) => text(block?.id) === id);
    return index < 0 ? null : {
      value: card.afterBlocks[index],
      collection: "afterBlocks",
      editableFields: new Set(EDITABLE_FIELDS_BY_RESOURCE[card.afterBlocks[index]?.kind] || [])
    };
  }
  if (requested === "main") {
    return {
      value: card,
      collection: "main",
      editableFields: new Set(
        listCardMainResourceFieldNames(card).filter((field) =>
          (EDITABLE_FIELDS_BY_RESOURCE[card.resource] || []).includes(field)
        )
      )
    };
  }
  if (requested === "response") {
    return {
      value: card,
      collection: "response",
      editableFields: new Set(listCardResponseFieldNames(card))
    };
  }
  if (requested === "after:text") {
    return {
      value: card,
      collection: "afterText",
      editableFields: new Set(["after"])
    };
  }
  return {
    value: card,
    collection: "card",
    editableFields: new Set(["title"])
  };
}

function appendPath(base, key) {
  if (typeof key === "number") return `${base}[${key}]`;
  return base ? `${base}.${key}` : key;
}

function topLevelField(path) {
  return String(path || "").split(/[.[]/u, 1)[0];
}

function listEditableLeaves(value, editableFields, basePath = "", leaves = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const path = appendPath(basePath, index);
      const arrayField = basePath.split(".").at(-1)?.replace(/\[\d+\]$/u, "") || "";
      const chartSeriesValue = /^series\[\d+\]\.values(?:\[|$)/u.test(path);
      if (
        (typeof item === "string" || typeof item === "number") &&
        EDITABLE_PRIMITIVE_ARRAY_FIELDS.has(arrayField) &&
        !chartSeriesValue
      ) {
        leaves.push({ path, value: item, valueType: typeof item });
        return;
      }
      listEditableLeaves(item, editableFields, path, leaves);
    });
    return leaves;
  }
  if (!value || typeof value !== "object") return leaves;

  Object.entries(value).forEach(([key, child]) => {
    const path = appendPath(basePath, key);
    if (!basePath && editableFields && !editableFields.has(key)) return;
    if (PROTECTED_FIELD_NAMES.has(key)) return;
    if (
      (typeof child === "string" || typeof child === "number") &&
      EDITABLE_LEAF_FIELD_NAMES.has(key)
    ) {
      leaves.push({ path, value: child, valueType: typeof child });
      return;
    }
    if (Array.isArray(child) || (child && typeof child === "object")) {
      listEditableLeaves(child, editableFields, path, leaves);
    }
  });
  return leaves;
}

function listFlowBranchLabelLeaves(structure, basePath = "structure") {
  const leaves = [];
  const add = (path, value) => leaves.push({
    path,
    value,
    valueType: "string",
    synthetic: true
  });
  const visitList = (items, path) => {
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      visitNode(item, `${path}[${index}]`);
    });
  };
  const addBinary = (node, path, { ifChainCase = false } = {}) => {
    if (!ifChainCase && !FLOW_BINARY_BRANCH_KINDS.has(node?.kind)) return;
    add(`${path}.branchLabels.yes`, text(node?.branchLabels?.yes) || "Sim");
    add(`${path}.branchLabels.no`, text(node?.branchLabels?.no) || "Não");
  };
  const visitNode = (node, path) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    addBinary(node, path);
    if (node.kind === "switch_case") {
      add(
        `${path}.branchLabels.default`,
        text(node?.branchLabels?.default) || "Outro caso"
      );
    }
    if (node.kind === "if_chain") {
      (Array.isArray(node.cases) ? node.cases : []).forEach((item, index) => {
        const casePath = `${path}.cases[${index}]`;
        addBinary(item, casePath, { ifChainCase: true });
        visitList(item?.thenBranch, `${casePath}.thenBranch`);
      });
    }
    if (node.kind === "switch_case") {
      (Array.isArray(node.cases) ? node.cases : []).forEach((item, index) => {
        visitList(item?.body, `${path}.cases[${index}].body`);
      });
    }
    ["items", "thenBranch", "elseBranch", "body", "defaultBranch"].forEach((field) => {
      visitList(node[field], `${path}.${field}`);
    });
  };
  visitNode(structure, basePath);
  return leaves;
}

function listResolvedEditableLeaves(resolved) {
  const leaves = listEditableLeaves(resolved.value, resolved.editableFields);
  const byPath = new Map(leaves.map((leaf) => [leaf.path, leaf]));
  if (resolved.editableFields?.has("options") && Array.isArray(resolved.value?.options)) {
    resolved.value.options.forEach((option, index) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) return;
      const path = `options[${index}].feedback`;
      const existing = byPath.get(path);
      if (existing) {
        byPath.set(path, { ...existing, optional: true });
        return;
      }
      byPath.set(path, {
        path,
        value: "",
        valueType: "string",
        synthetic: true,
        optional: true
      });
    });
  }
  const isFlow = (
    resolved.value?.resource === "flow" || resolved.value?.kind === "flow"
  ) && resolved.editableFields?.has("structure");
  if (isFlow && resolved.value?.structure) {
    listFlowBranchLabelLeaves(resolved.value.structure).forEach((leaf) => {
      if (!byPath.has(leaf.path)) byPath.set(leaf.path, leaf);
    });
  }
  return [...byPath.values()];
}

function parsePath(path) {
  const segments = [];
  String(path || "").replace(/([^.[]+)|\[(\d+)\]/gu, (_match, key, index) => {
    segments.push(index === undefined ? key : Number(index));
    return "";
  });
  return segments;
}

function readPath(target, path) {
  return parsePath(path).reduce((value, segment) => value?.[segment], target);
}

function writePath(target, path, rawValue, { createMissing = false } = {}) {
  const segments = parsePath(path);
  if (!segments.length) return;
  const last = segments.pop();
  let parent = target;
  for (const segment of segments) {
    if (!parent || typeof parent !== "object") return;
    if (parent[segment] === undefined && createMissing) {
      parent[segment] = {};
    }
    parent = parent[segment];
  }
  if (!parent || typeof parent !== "object") return;
  if (!Object.hasOwn(parent, last) && !createMissing) return;
  const current = parent[last];
  if (typeof current === "number") {
    const numeric = Number(String(rawValue).trim());
    parent[last] = Number.isFinite(numeric) ? numeric : rawValue;
    return;
  }
  parent[last] = String(rawValue ?? "");
}

function deletePath(target, path) {
  const segments = parsePath(path);
  if (!segments.length) return;
  const last = segments.pop();
  const parent = segments.reduce((value, segment) => value?.[segment], target);
  if (!parent || typeof parent !== "object") return;
  delete parent[last];
}

function gapTextSegments(value) {
  return String(value ?? "")
    .split(/(\{gap:[^}]+\}|\[\[[\s\S]*?\]\])/gu)
    .filter((_part, index) => index % 2 === 0);
}

function preservesGapTokenStructure(left, right) {
  const leftTokens = sourceGapTokens(left);
  const rightTokens = sourceGapTokens(right);
  if (
    leftTokens.length !== rightTokens.length ||
    !leftTokens.every((token, index) => token === rightTokens[index])
  ) return false;
  if (!leftTokens.length) return true;

  const leftSegments = gapTextSegments(left);
  const rightSegments = gapTextSegments(right);
  return leftSegments.length === rightSegments.length &&
    leftSegments.every((segment, index) => !segment.trim() || rightSegments[index]?.trim());
}

export function listManualCardEditablePaths(card = {}, targetId = "card") {
  const resolved = resolveTarget(card, targetId);
  if (!resolved) return [];
  return listResolvedEditableLeaves(resolved);
}

export function buildManualCardEditModel(card = {}, targetId = "card") {
  const resolved = resolveTarget(card, targetId);
  if (!resolved) return null;
  const pathFields = listResolvedEditableLeaves(resolved);
  return {
    targetId,
    targetKind: text(resolved.package || resolved.value?.kind || resolved.value?.resource),
    pathFields,
    fields: pathFields
      .filter((field) => !field.path.includes(".") && !field.path.includes("["))
      .map((field) => ({
        key: field.path,
        label: field.path === "title" ? "Título" : field.path,
        type: "textarea",
        value: field.value
      }))
  };
}

export function applyManualCardEdit(card = {}, targetId = "card", values = {}) {
  const nextCard = structuredClone(card);
  const resolved = resolveTarget(nextCard, targetId);
  if (!resolved) throw new Error("O recurso selecionado deixou de existir.");

  const editableLeaves = listResolvedEditableLeaves(resolved);
  const allowedPaths = new Map(editableLeaves.map((field) => [field.path, field]));
  const resourceGapPaths = new Set(
    buildResourceGapModel(resolved.value).fields.map((field) => field.path)
  );
  const pathValues = values?.pathValues && typeof values.pathValues === "object"
    ? values.pathValues
    : resolved.collection === "card" && Object.hasOwn(values || {}, "title")
      ? { title: values.title }
      : {};
  Object.entries(pathValues).forEach(([path, value]) => {
    const editableLeaf = allowedPaths.get(path);
    if (!editableLeaf || PROTECTED_FIELD_NAMES.has(topLevelField(path))) return;
    const currentValue = readPath(resolved.value, path);
    if (currentValue === undefined && !editableLeaf.synthetic) return;
    const preservesGapStructure = resourceGapPaths.has(path) || (
      path === "accessibleText" &&
      (resolved.value?.resource === "formula" || resolved.value?.kind === "formula")
    );
    if (
      text(nextCard.exercise) === "gap" &&
      preservesGapStructure &&
      !preservesGapTokenStructure(currentValue, value) &&
      (sourceGapTokens(currentValue).length || sourceGapTokens(value).length)
    ) {
      throw new Error("A edição visual não pode alterar a estrutura das lacunas de prática.");
    }
    if (
      currentValue === undefined &&
      editableLeaf.synthetic &&
      String(value ?? "") === String(editableLeaf.value ?? "")
    ) return;
    if (editableLeaf.optional && !String(value ?? "").trim()) {
      deletePath(resolved.value, path);
      return;
    }
    writePath(resolved.value, path, value, {
      createMissing: editableLeaf.synthetic === true
    });
  });

  const packageValidation = Array.isArray(nextCard?.content)
    ? validateCardEnvelope(nextCard, RESOURCE_PACKAGE_REGISTRY, "$.manualEdit.card")
    : null;
  const validation = packageValidation
    ? {
        ok: packageValidation.valid,
        value: nextCard,
        errors: packageValidation.errors.map((message) => ({
          path: "$.manualEdit.card",
          message
        }))
      }
    : validateCard(nextCard, "$.manualEdit.card");
  if (!validation.ok) {
    const issue = validation.errors?.[0];
    throw new Error(
      `A edição deixou o card inválido${issue?.path ? ` em ${issue.path}` : ""}.`
    );
  }
  return validation.value;
}

function safeMarkdownLinkHref(value) {
  const href = String(value ?? "").trim();
  const hasControlCharacter = [...href].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
  if (!href || href.length > 2048 || hasControlCharacter) return "";
  const explicitScheme = href.match(/^([a-z][a-z\d+.-]*):/iu)?.[1]?.toLowerCase() || "";
  if (explicitScheme && !["http", "https", "mailto", "tel"].includes(explicitScheme)) {
    return "";
  }
  try {
    const parsed = new URL(href, "https://aralearn.invalid/");
    if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) return "";
  } catch {
    return "";
  }
  return href;
}

function markdownLinkLabel(value) {
  return String(value || "").replace(/([\\[\]])/gu, "\\$1");
}

function markdownLinkHref(value) {
  return String(value || "")
    .replace(/\\/gu, "\\\\")
    .replace(/\(/gu, "\\(")
    .replace(/\)/gu, "\\)")
    .replace(/ /gu, "%20");
}

export function serializeEditableNode(node) {
  if (node?.nodeType === 3) return String(node.data ?? "");
  if (node?.nodeType !== 1) return "";
  if (node.dataset?.manualGapToken) return node.dataset.manualGapToken;
  const tagName = String(node.tagName || "").toUpperCase();
  if (tagName === "BR") return "\n";
  const value = [...(node.childNodes || [])].map(serializeEditableNode).join("");
  if (tagName === "STRONG") return `**${value}**`;
  if (tagName === "EM") return `*${value}*`;
  if (tagName === "CODE" && node.dataset?.manualMarkdownCode === "true") {
    return `\`${value}\``;
  }
  if (tagName === "A") {
    const href = safeMarkdownLinkHref(node.getAttribute?.("href"));
    return href
      ? `[${markdownLinkLabel(value)}](${markdownLinkHref(href)})`
      : value;
  }
  if (tagName === "UL") {
    return [...(node.children || [])].map((item) => `- ${serializeEditableNode(item)}`).join("\n") + "\n";
  }
  if (tagName === "OL") {
    return [...(node.children || [])].map((item, index) => `${index + 1}. ${serializeEditableNode(item)}`).join("\n") + "\n";
  }
  if (tagName === "P") return `${value}\n\n`;
  if (tagName === "DIV") return `${value}\n`;
  return value;
}

function editableText(node) {
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    return node.value;
  }
  return serializeEditableNode(node).replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
}

function markRenderedMarkdownCode(field) {
  const explicitCode = String(field.dataset.manualEditOriginal || "")
    .split("`")
    .filter((_part, index) => index % 2 === 1);
  if (!explicitCode.length) return;
  const remaining = [...explicitCode];
  field.querySelectorAll("code").forEach((code) => {
    const index = remaining.indexOf(code.textContent || "");
    if (index < 0) return;
    code.dataset.manualMarkdownCode = "true";
    remaining.splice(index, 1);
  });
}

function makeVisualFieldEditable(field, host) {
  const isHtmlField = field.namespaceURI === "http://www.w3.org/1999/xhtml";
  if (isHtmlField || !host) return field;
  const originalValue = field.dataset.manualEditOriginal ?? field.textContent ?? "";
  const overlay = document.createElement("span");
  overlay.className = "runtime-manual-svg-field";
  overlay.dataset.manualEditPath = field.dataset.manualEditPath;
  overlay.dataset.manualEditOriginal = originalValue;
  if (field.dataset.manualEditOptional === "true") {
    overlay.dataset.manualEditOptional = "true";
  }
  if (field.dataset.manualEditPlaceholder) {
    overlay.dataset.manualEditPlaceholder = field.dataset.manualEditPlaceholder;
  }
  if (field.dataset.manualEditPreserveGaps === "true") {
    overlay.dataset.manualEditPreserveGaps = "true";
  }
  overlay.setAttribute("contenteditable", "plaintext-only");
  overlay.setAttribute("role", "textbox");
  overlay.setAttribute("aria-multiline", "true");
  overlay.setAttribute("aria-label", field.getAttribute("aria-label") || "Editar conteúdo");
  overlay.spellcheck = false;
  overlay.textContent = field.textContent ?? "";
  const refreshPosition = () => {
    if (!field.isConnected || !host.isConnected) return;
    const fieldRect = field.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    if (!fieldRect.width || !fieldRect.height) return;
    const computed = getComputedStyle(field);
    const matrix = typeof field.getScreenCTM === "function" ? field.getScreenCTM() : null;
    const scaleX = matrix ? Math.hypot(matrix.a, matrix.b) || 1 : 1;
    const scaleY = matrix ? Math.hypot(matrix.c, matrix.d) || 1 : 1;
    const sourceFontSize = Number.parseFloat(computed.fontSize) || 0;
    const sourceLetterSpacing = Number.parseFloat(computed.letterSpacing) || 0;
    const screenFontSize = sourceFontSize ? sourceFontSize * scaleY : 0;
    const ink = computed.fill && computed.fill !== "none" ? computed.fill : computed.color;
    Object.assign(overlay.style, {
      left: `${fieldRect.left - hostRect.left}px`,
      top: `${fieldRect.top - hostRect.top}px`,
      width: `${Math.max(fieldRect.width, 1)}px`,
      height: `${Math.max(fieldRect.height, 1)}px`,
      fontFamily: computed.fontFamily,
      fontSize: screenFontSize ? `${screenFontSize}px` : computed.fontSize,
      fontWeight: computed.fontWeight,
      fontStyle: computed.fontStyle,
      fontVariantCaps: computed.fontVariantCaps,
      letterSpacing: sourceLetterSpacing ? `${sourceLetterSpacing * scaleX}px` : computed.letterSpacing,
      lineHeight: screenFontSize ? `${screenFontSize * 1.15}px` : computed.lineHeight,
      textAlign: computed.textAnchor === "middle"
        ? "center"
        : computed.textAnchor === "end"
          ? "right"
          : "left",
      textTransform: computed.textTransform
    });
    overlay.style.setProperty("--manual-edit-ink", ink);
  };
  overlay.manualEditRefreshPosition = refreshPosition;
  overlay.manualEditSource = field;
  field.classList.add("is-manual-edit-proxied-source");
  field.removeAttribute("contenteditable");
  field.removeAttribute("role");
  field.setAttribute("aria-hidden", "true");
  host.append(overlay);
  refreshPosition();
  return overlay;
}

function sourceGapTokens(value) {
  return String(value || "").match(/\{gap:[^}]+\}|\[\[[\s\S]*?\]\]/gu) || [];
}

function rangeTouchesManualGap(range, field) {
  if (!range || range.collapsed) return false;
  return [...field.querySelectorAll("[data-manual-gap-token]")].some((blank) => {
    try {
      const liveRange = field.ownerDocument.createRange();
      liveRange.setStart(range.startContainer, range.startOffset);
      liveRange.setEnd(range.endContainer, range.endOffset);
      return liveRange.intersectsNode(blank);
    } catch {
      return false;
    }
  });
}

function eventTouchesManualGap(event, field) {
  const targetRanges = typeof event?.getTargetRanges === "function"
    ? [...event.getTargetRanges()]
    : [];
  if (targetRanges.some((range) => rangeTouchesManualGap(range, field))) return true;
  const selection = field.ownerDocument?.getSelection?.();
  if (!selection || selection.rangeCount < 1) return false;
  return [...Array(selection.rangeCount)].some((_value, index) =>
    rangeTouchesManualGap(selection.getRangeAt(index), field)
  );
}

function guardManualGapOperations(field) {
  if (field.dataset.manualGapOperationsGuarded === "true") return;
  field.dataset.manualGapOperationsGuarded = "true";
  field.addEventListener("beforeinput", (event) => {
    const inputType = String(event.inputType || "");
    if (["deleteByDrag", "insertFromDrop"].includes(inputType) || (
      inputType.startsWith("delete") && eventTouchesManualGap(event, field)
    )) {
      event.preventDefault();
    }
  });
  field.addEventListener("cut", (event) => {
    if (eventTouchesManualGap(event, field)) event.preventDefault();
  });
  field.addEventListener("dragstart", (event) => {
    if (
      event.target?.closest?.("[data-manual-gap-token]") ||
      eventTouchesManualGap(event, field)
    ) {
      event.preventDefault();
    }
  });
  field.addEventListener("drop", (event) => event.preventDefault());
}

function lockManualGapField(field) {
  field.dataset.manualEditReadonly = "true";
  field.dataset.manualGapLocked = "true";
  field.classList.add("is-manual-gap-locked");
  field.setAttribute("contenteditable", "false");
  field.setAttribute("role", "note");
  field.setAttribute("tabindex", "0");
  field.setAttribute(
    "aria-label",
    "Lacuna de prática preservada. Edite a resposta e as alternativas pelo contrato autoral."
  );
  field.setAttribute(
    "title",
    "A estrutura desta lacuna é preservada na edição visual."
  );
}

function protectGapTokens(field, sourceValue = field.dataset.manualEditOriginal) {
  const tokens = sourceGapTokens(sourceValue);
  if (!tokens.length) return { hasGaps: false, locked: false };
  const blanks = [...field.querySelectorAll(
    ".runtime-text-gap-blank, [data-text-gap-field], [data-text-gap-choice]"
  )];
  if (field.dataset.manualEditPreserveGaps !== "true" && !blanks.length) {
    return { hasGaps: false, locked: false };
  }
  if (blanks.length !== tokens.length) {
    lockManualGapField(field);
    return { hasGaps: true, locked: true };
  }
  blanks.forEach((blank, index) => {
    blank.dataset.manualGapToken = tokens[index];
    blank.setAttribute("contenteditable", "false");
    blank.setAttribute("draggable", "false");
    blank.removeAttribute("data-action");
    blank.setAttribute("tabindex", "-1");
    blank.setAttribute("aria-disabled", "true");
    blank.setAttribute("aria-label", `Lacuna ${index + 1} preservada`);
    if (blank.matches("button, input, textarea, select")) {
      blank.setAttribute("disabled", "");
    }
  });
  field.dataset.manualGapSignature = JSON.stringify(tokens);
  guardManualGapOperations(field);
  return { hasGaps: true, locked: false };
}

function restoreGapDraft(field, value) {
  const draftValue = String(value ?? "");
  const blanks = [...field.querySelectorAll(
    ".runtime-text-gap-blank, [data-text-gap-field], [data-text-gap-choice]"
  )];
  const tokens = sourceGapTokens(draftValue);
  if (!blanks.length || blanks.length !== tokens.length) {
    field.textContent = draftValue;
    return;
  }

  const parts = draftValue.split(/(\{gap:[^}]+\}|\[\[[\s\S]*?\]\])/gu);
  const fragment = document.createDocumentFragment();
  let blankIndex = 0;
  parts.forEach((part) => {
    if (!part) return;
    if (sourceGapTokens(part).length === 1 && sourceGapTokens(part)[0] === part) {
      const blank = blanks[blankIndex];
      blankIndex += 1;
      blank.dataset.manualGapToken = part;
      fragment.append(blank);
      return;
    }
    fragment.append(document.createTextNode(part));
  });
  field.replaceChildren(fragment);
}

function markManualFieldDirty(field) {
  field.dataset.manualEditDirty = "true";
  field.classList.add("is-manual-edit-dirty");
  if (field.classList.contains("runtime-manual-svg-field")) {
    field.style.removeProperty("color");
  }
  field.manualEditSource?.classList.add("is-manual-edit-source-hidden");
}

function manualEditAffectsPractice(path, field) {
  return path === "question" ||
    path.startsWith("options[") ||
    field.dataset.manualEditPreserveGaps === "true" ||
    Boolean(field.dataset.manualGapSignature);
}

export function activateManualCardEdit(container, draftValues = null) {
  if (!(container instanceof HTMLElement)) return null;
  const content = container.querySelector(".runtime-resource-selection-content") || container;
  const initialRect = container.getBoundingClientRect();
  container.style.setProperty("--manual-edit-height", `${initialRect.height}px`);
  container.classList.add("is-manual-edit-ready");

  const visualFields = [...container.querySelectorAll(
    "svg [data-manual-edit-path], math [data-manual-edit-path]"
  )];
  const visualOverlays = visualFields.map((field) => makeVisualFieldEditable(field, content));
  let visualResizeObserver = null;
  let visualRemovalObserver = null;
  if (typeof ResizeObserver === "function") {
    visualResizeObserver = new ResizeObserver(() => {
      visualOverlays.forEach((field) => field.manualEditRefreshPosition?.());
    });
    visualResizeObserver.observe(content);
    visualFields.forEach((field) => visualResizeObserver.observe(field));
    if (typeof MutationObserver === "function" && document?.documentElement) {
      visualRemovalObserver = new MutationObserver(() => {
        if (container.isConnected) return;
        visualResizeObserver?.disconnect();
        visualRemovalObserver?.disconnect();
      });
      visualRemovalObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  }
  const fields = [...container.querySelectorAll("[data-manual-edit-path]")]
    .filter((field) => !field.classList.contains("is-manual-edit-proxied-source"));
  const draft = draftValues?.pathValues && typeof draftValues.pathValues === "object"
    ? draftValues.pathValues
    : {};
  const fieldsByPath = new Map();
  let firstEditableField = null;
  fields.forEach((field) => {
    const path = field.dataset.manualEditPath;
    const siblings = fieldsByPath.get(path) || [];
    siblings.push(field);
    fieldsByPath.set(path, siblings);
    markRenderedMarkdownCode(field);
    const originalValue = field.dataset.manualEditOriginal ?? "";
    let gapProtection = protectGapTokens(field, originalValue);
    const preserveGapStructure = gapProtection.hasGaps;
    const hasDraft = Object.hasOwn(draft, path);
    if (
      hasDraft &&
      !gapProtection.locked &&
      (!preserveGapStructure || preservesGapTokenStructure(originalValue, draft[path]))
    ) {
      restoreGapDraft(field, draft[path]);
      gapProtection = protectGapTokens(field, originalValue);
      markManualFieldDirty(field);
    }
    field.manualEditSafeHtml = field.innerHTML;
    field.addEventListener("click", (event) => event.stopPropagation());
    if (gapProtection.locked) return;
    if (!firstEditableField) firstEditableField = field;
    let isComposing = false;
    const synchronizeField = () => {
      const nextValue = editableText(field);
      if (preserveGapStructure && !preservesGapTokenStructure(originalValue, nextValue)) {
        field.innerHTML = field.manualEditSafeHtml;
        protectGapTokens(field, originalValue);
        return;
      }
      markManualFieldDirty(field);
      field.manualEditSafeHtml = field.innerHTML;
      if (manualEditAffectsPractice(path, field)) {
        container.dataset.manualEditInvalidatesExercise = "true";
      }
      (fieldsByPath.get(path) || []).forEach((mirror) => {
        if (mirror === field || mirror.dataset.manualEditReadonly === "true") return;
        if (sourceGapTokens(mirror.dataset.manualEditOriginal).length) {
          restoreGapDraft(mirror, nextValue);
          protectGapTokens(mirror, mirror.dataset.manualEditOriginal);
        } else {
          mirror.textContent = nextValue;
        }
        mirror.manualEditSafeHtml = mirror.innerHTML;
        markManualFieldDirty(mirror);
      });
      container.dispatchEvent(new CustomEvent("manual-card-edit-change", {
        bubbles: true,
        detail: {
          path,
          invalidatesExercise: manualEditAffectsPractice(path, field)
        }
      }));
    };
    field.addEventListener("compositionstart", () => {
      isComposing = true;
    });
    field.addEventListener("compositionend", () => {
      isComposing = false;
      synchronizeField();
    });
    field.addEventListener("input", () => {
      if (!isComposing) synchronizeField();
    });
  });
  if (firstEditableField) {
    firstEditableField.dataset.cardAuthoringFocus = "manual-first-field";
  }
  return {
    fields,
    content,
    refreshVisualFields() {
      visualOverlays.forEach((field) => field.manualEditRefreshPosition?.());
    },
    destroy() {
      visualResizeObserver?.disconnect();
      visualRemovalObserver?.disconnect();
    }
  };
}

export function readManualCardEditPathValues(container) {
  if (!(container instanceof HTMLElement)) return {};
  const result = {};
  const fields = [...container.querySelectorAll("[data-manual-edit-path]")]
    .filter((field) => !field.classList.contains("is-manual-edit-proxied-source"));
  const fieldsByPath = new Map();
  fields.forEach((field) => {
    const path = field.dataset.manualEditPath;
    const mirrors = fieldsByPath.get(path) || [];
    mirrors.push(field);
    fieldsByPath.set(path, mirrors);
  });
  fieldsByPath.forEach((mirrors, path) => {
    const dirty = mirrors.find((field) => field.dataset.manualEditDirty === "true");
    const field = dirty || mirrors[0];
    result[path] = dirty
      ? editableText(field)
      : field.dataset.manualEditOriginal ?? editableText(field);
  });
  return result;
}
