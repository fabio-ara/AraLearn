function clone(value) {
  return structuredClone(value);
}

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createDefaultChildBlock(kind = "paragraph") {
  const labelByKind = {
    paragraph: "",
    list: "",
    choice: "Pergunta-guia",
    table: "Quadro",
    flowchart: "Fluxo"
  };

  return {
    kind,
    label: labelByKind[kind] || ""
  };
}

function normalizeChildBlock(block) {
  if (!isPlainObject(block)) {
    return createDefaultChildBlock();
  }

  const kind = normalizeText(block.kind).trim() || "paragraph";

  return {
    kind,
    label: normalizeText(block.label)
  };
}

function normalizePopupChildren(list) {
  return (Array.isArray(list) ? list : []).reduce((acc, item) => {
    if (!isPlainObject(item)) {
      acc.push(createDefaultChildBlock());
      return acc;
    }

    const kind = normalizeText(item.kind).trim() || "paragraph";
    if (kind === "popup") {
      const nestedChildren = normalizePopupChildren(item.children);
      if (nestedChildren.length) {
        acc.push(...nestedChildren);
      } else if (normalizeText(item.label).trim() && normalizeText(item.label).trim().toLowerCase() !== "botão") {
        acc.push({
          kind: "paragraph",
          label: normalizeText(item.label)
        });
      }
      return acc;
    }

    acc.push(normalizeChildBlock(item));
    return acc;
  }, []);
}

export function normalizeCardBlocks({ title = "", text = "", blocks = [] } = {}) {
  const sourceBlocks = Array.isArray(blocks) ? clone(blocks) : [];
  const headingBlock = isPlainObject(sourceBlocks[0]) && sourceBlocks[0].kind === "heading"
    ? {
        kind: "heading",
        label: normalizeText(sourceBlocks[0].label).trim() || normalizeText(title).trim() || "Novo card"
      }
    : {
        kind: "heading",
        label: normalizeText(title).trim() || "Novo card"
      };

  let popupBlock = sourceBlocks.find((block) => isPlainObject(block) && block.kind === "popup") || null;
  if (popupBlock) {
    const children = normalizePopupChildren(popupBlock.children);
    popupBlock = {
      kind: "popup",
      label: normalizeText(popupBlock.label).trim() || "Botão",
      popupEnabled: typeof popupBlock.popupEnabled === "boolean" ? popupBlock.popupEnabled : children.length > 0,
      children
    };
  } else {
    const legacyContent = sourceBlocks
      .filter((block, index) => !(index === 0 && isPlainObject(block) && block.kind === "heading"))
      .map(normalizeChildBlock);

    if (!legacyContent.length && normalizeText(text).trim()) {
      legacyContent.push({
        kind: "paragraph",
        label: normalizeText(text).trim()
      });
    }

    popupBlock = {
      kind: "popup",
      label: "Botão",
      popupEnabled: legacyContent.length > 0,
      children: legacyContent
    };
  }

  return [headingBlock, popupBlock];
}

export function createDefaultCardData({ title = "Novo card", text = "" } = {}) {
  const normalizedTitle = normalizeText(title).trim() || "Novo card";
  const normalizedText = normalizeText(text);

  return {
    text: normalizedText,
    blocks: normalizeCardBlocks({
      title: normalizedTitle,
      text: normalizedText
    })
  };
}

export function summarizeCardTextFromBlocks(blocks) {
  const lines = [];

  function visit(items) {
    (items || []).forEach((item) => {
      if (!isPlainObject(item)) {
        return;
      }

      if (item.kind === "heading") {
        return;
      }

      if (typeof item.label === "string" && item.label.trim()) {
        lines.push(item.label.trim());
      }

      if (item.kind === "popup" && item.popupEnabled && Array.isArray(item.children)) {
        visit(item.children);
      }
    });
  }

  visit(blocks);
  return lines.join("\n\n").trim();
}

export function updateNormalizedCardBlocks(blocks, updater) {
  const nextBlocks = clone(Array.isArray(blocks) ? blocks : []);
  updater(nextBlocks);
  return normalizeCardBlocks({
    title: nextBlocks[0]?.label || "",
    blocks: nextBlocks
  });
}
