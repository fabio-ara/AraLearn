function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCode(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n") : "";
}

function parseChoiceOptionCodeFence(value = "") {
  const source = normalizeCode(value).trim();
  const match = source.match(/^```([A-Za-z0-9_+-]*)\n([\s\S]*?)\n```$/u);
  if (!match) {
    return null;
  }
  return {
    language: text(match[1]) || "text",
    code: normalizeCode(match[2] || "")
  };
}

export function isChoiceCodeOption(option = {}) {
  if (!option || typeof option !== "object" || Array.isArray(option)) {
    return false;
  }
  const kind = text(option?.kind).toLowerCase();
  if (kind === "code") {
    return true;
  }
  return kind === "" && (typeof option?.code === "string" || typeof option?.language === "string");
}

export function parseChoiceOptionString(value = "", id = "") {
  const normalizedId = text(id) || "option-1";
  const codeFence = parseChoiceOptionCodeFence(value);
  if (codeFence) {
    return {
      id: normalizedId,
      kind: "code",
      language: codeFence.language,
      code: codeFence.code
    };
  }
  return {
    id: normalizedId,
    kind: "text",
    text: text(value)
  };
}

export function normalizeChoiceOption(option, index = 0) {
  if (typeof option === "string") {
    return parseChoiceOptionString(option, `option-${index + 1}`);
  }

  if (!option || typeof option !== "object" || Array.isArray(option)) {
    return {
      id: `option-${index + 1}`,
      kind: "text",
      text: ""
    };
  }

  const id = text(option?.id) || `option-${index + 1}`;
  if (isChoiceCodeOption(option)) {
    return {
      id,
      kind: "code",
      language: text(option?.language) || "text",
      code: normalizeCode(option?.code),
      ...(text(option?.feedback) ? { feedback: text(option.feedback) } : {}),
      ...(text(option?.misconceptionId)
        ? { misconceptionId: text(option.misconceptionId) }
        : {})
    };
  }

  const rawText = option?.text ?? option?.label ?? option?.value ?? option?.content;
  const codeFence = parseChoiceOptionCodeFence(rawText);
  if (codeFence) {
    return {
      id,
      kind: "code",
      language: codeFence.language,
      code: codeFence.code
    };
  }

  return {
    id,
    kind: "text",
    text: text(rawText),
    ...(text(option?.feedback) ? { feedback: text(option.feedback) } : {}),
    ...(text(option?.misconceptionId)
      ? { misconceptionId: text(option.misconceptionId) }
      : {})
  };
}

export function getChoiceOptionComparableValue(option = {}, index = 0) {
  const normalized = normalizeChoiceOption(option, index);
  return normalized.kind === "code" ? normalized.code : normalized.text;
}

export function normalizeChoiceComparableValue(option = {}, index = 0) {
  return getChoiceOptionComparableValue(option, index)
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[^\S\n]+/gu, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}
