import { validateCard } from "../domain/cards.js";
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
  formula: ["prompt", "expression"],
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
  "title",
  "text",
  "value",
  "prompt",
  "question",
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

function resolveTarget(card, targetId) {
  const requested = text(targetId).trim();
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
  const addBinary = (node, path) => {
    add(`${path}.branchLabels.yes`, text(node?.branchLabels?.yes) || "Sim");
    add(`${path}.branchLabels.no`, text(node?.branchLabels?.no) || "Não");
  };
  const visitNode = (node, path) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (FLOW_BINARY_BRANCH_KINDS.has(node.kind)) addBinary(node, path);
    if (node.kind === "switch_case") {
      add(
        `${path}.branchLabels.default`,
        text(node?.branchLabels?.default) || "Outro caso"
      );
    }
    if (node.kind === "if_chain") {
      (Array.isArray(node.cases) ? node.cases : []).forEach((item, index) => {
        const casePath = `${path}.cases[${index}]`;
        addBinary(item, casePath);
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
  const isFlow = resolved.value?.resource === "flow" || resolved.value?.kind === "flow";
  if (!isFlow || !resolved.value?.structure) return leaves;
  const byPath = new Map(leaves.map((leaf) => [leaf.path, leaf]));
  listFlowBranchLabelLeaves(resolved.value.structure).forEach((leaf) => {
    if (!byPath.has(leaf.path)) byPath.set(leaf.path, leaf);
  });
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
    targetKind: text(resolved.value?.kind || resolved.value?.resource),
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
    if (
      currentValue === undefined &&
      editableLeaf.synthetic &&
      String(value ?? "") === String(editableLeaf.value ?? "")
    ) return;
    writePath(resolved.value, path, value, {
      createMissing: editableLeaf.synthetic === true
    });
  });

  const validation = validateCard(nextCard, "$.manualEdit.card");
  if (!validation.ok) {
    const issue = validation.errors?.[0];
    throw new Error(
      `A edição deixou o card inválido${issue?.path ? ` em ${issue.path}` : ""}.`
    );
  }
  return validation.value;
}

function serializeEditableNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.data;
  if (!(node instanceof Element)) return "";
  if (node.dataset.manualGapToken) return node.dataset.manualGapToken;
  if (node.tagName === "BR") return "\n";
  const value = [...node.childNodes].map(serializeEditableNode).join("");
  if (node.tagName === "STRONG") return `**${value}**`;
  if (node.tagName === "EM") return `*${value}*`;
  if (node.tagName === "CODE" && node.dataset.manualMarkdownCode === "true") {
    return `\`${value}\``;
  }
  if (node.tagName === "UL") {
    return [...node.children].map((item) => `- ${serializeEditableNode(item)}`).join("\n") + "\n";
  }
  if (node.tagName === "OL") {
    return [...node.children].map((item, index) => `${index + 1}. ${serializeEditableNode(item)}`).join("\n") + "\n";
  }
  if (node.tagName === "P") return `${value}\n\n`;
  if (node.tagName === "DIV") return `${value}\n`;
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
  const fieldRect = field.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  if (!fieldRect.width || !fieldRect.height) return field;
  const computed = getComputedStyle(field);
  const matrix = typeof field.getScreenCTM === "function" ? field.getScreenCTM() : null;
  const scaleX = matrix ? Math.hypot(matrix.a, matrix.b) || 1 : 1;
  const scaleY = matrix ? Math.hypot(matrix.c, matrix.d) || 1 : 1;
  const sourceFontSize = Number.parseFloat(computed.fontSize) || 0;
  const sourceLetterSpacing = Number.parseFloat(computed.letterSpacing) || 0;
  const screenFontSize = sourceFontSize ? sourceFontSize * scaleY : 0;
  const ink = computed.fill && computed.fill !== "none" ? computed.fill : computed.color;
  const originalValue = field.dataset.manualEditOriginal ?? field.textContent ?? "";
  const overlay = document.createElement("span");
  overlay.className = "runtime-manual-svg-field";
  overlay.dataset.manualEditPath = field.dataset.manualEditPath;
  overlay.dataset.manualEditOriginal = originalValue;
  overlay.setAttribute("contenteditable", "plaintext-only");
  overlay.setAttribute("role", "textbox");
  overlay.setAttribute("aria-label", field.getAttribute("aria-label") || "Editar conteúdo");
  overlay.spellcheck = false;
  overlay.textContent = originalValue;
  Object.assign(overlay.style, {
    left: `${fieldRect.left - hostRect.left}px`,
    top: `${fieldRect.top - hostRect.top}px`,
    width: `${Math.max(fieldRect.width, 1)}px`,
    height: `${Math.max(fieldRect.height, 1)}px`,
    color: "transparent",
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
  overlay.manualEditSource = field;
  field.classList.add("is-manual-edit-proxied-source");
  field.removeAttribute("contenteditable");
  field.removeAttribute("role");
  field.setAttribute("aria-hidden", "true");
  host.append(overlay);
  return overlay;
}

function sourceGapTokens(value) {
  return String(value || "").match(/\{gap:[^}]+\}|\[\[[\s\S]*?\]\]/gu) || [];
}

function protectGapTokens(field, sourceValue = field.dataset.manualEditOriginal) {
  const tokens = sourceGapTokens(sourceValue);
  if (!tokens.length) return;
  const blanks = field.querySelectorAll(
    ".runtime-text-gap-blank, [data-text-gap-field], [data-text-gap-choice]"
  );
  [...blanks].forEach((blank, index) => {
    if (!tokens[index]) return;
    blank.dataset.manualGapToken = tokens[index];
    blank.setAttribute("contenteditable", "false");
    blank.removeAttribute("data-action");
    blank.removeAttribute("tabindex");
  });
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

export function activateManualCardEdit(container, draftValues = null) {
  if (!(container instanceof HTMLElement)) return null;
  const content = container.querySelector(".runtime-resource-selection-content") || container;
  const initialRect = container.getBoundingClientRect();
  container.style.setProperty("--manual-edit-height", `${initialRect.height}px`);
  container.classList.add("is-manual-edit-ready");

  const visualFields = [...container.querySelectorAll(
    "svg [data-manual-edit-path], math [data-manual-edit-path]"
  )];
  visualFields.forEach((field) => makeVisualFieldEditable(field, content));
  const fields = [...container.querySelectorAll("[data-manual-edit-path]")]
    .filter((field) => !field.classList.contains("is-manual-edit-proxied-source"));
  const draft = draftValues?.pathValues && typeof draftValues.pathValues === "object"
    ? draftValues.pathValues
    : {};
  const fieldsByPath = new Map();
  fields.forEach((field, index) => {
    const path = field.dataset.manualEditPath;
    const siblings = fieldsByPath.get(path) || [];
    siblings.push(field);
    fieldsByPath.set(path, siblings);
    markRenderedMarkdownCode(field);
    protectGapTokens(field, Object.hasOwn(draft, path) ? draft[path] : undefined);
    if (Object.hasOwn(draft, path)) {
      restoreGapDraft(field, draft[path]);
      markManualFieldDirty(field);
    }
    field.addEventListener("click", (event) => event.stopPropagation());
    field.addEventListener("input", () => {
      markManualFieldDirty(field);
      const nextValue = editableText(field);
      (fieldsByPath.get(path) || []).forEach((mirror) => {
        if (mirror === field) return;
        mirror.textContent = nextValue;
        markManualFieldDirty(mirror);
      });
    });
    if (index === 0) field.dataset.cardAuthoringFocus = "manual-first-field";
  });
  return { fields, content };
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
