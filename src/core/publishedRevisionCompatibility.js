const ORIGINAL_PUBLISHED_REVISION = new WeakMap();

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function comparablePrompt(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR");
}

function normalizeNode(value) {
  if (Array.isArray(value)) {
    let changed = false;
    const normalized = value.map((item) => {
      const result = normalizeNode(item);
      changed ||= result.changed;
      return result.value;
    });
    return { value: changed ? normalized : value, changed };
  }
  if (!plainObject(value)) return { value, changed: false };

  let changed = false;
  const normalizedEntries = Object.entries(value).map(([key, entry]) => {
    const result = normalizeNode(entry);
    changed ||= result.changed;
    return [key, result.value];
  });
  let normalized = changed ? Object.fromEntries(normalizedEntries) : value;

  const question = comparablePrompt(normalized.response?.package === "aralearn.response.choice"
    ? normalized.response?.data?.question
    : "");
  if (!question || !Array.isArray(normalized.content)) {
    return { value: normalized, changed };
  }

  const content = normalized.content.filter((instance) => !(
    instance?.package === "aralearn.resource.paragraph" &&
    comparablePrompt(instance.data?.text) === question
  ));
  if (content.length === normalized.content.length) {
    return { value: normalized, changed };
  }
  if (normalized === value) normalized = { ...value };
  normalized.content = content;
  return { value: normalized, changed: true };
}

export function normalizePublishedRevisionDocument(document) {
  if (!plainObject(document)) return document;
  const normalized = normalizeNode(document);
  if (!normalized.changed || normalized.value === document) return document;
  ORIGINAL_PUBLISHED_REVISION.set(normalized.value, document);
  return normalized.value;
}

export function publishedRevisionHashSource(document) {
  return document && typeof document === "object"
    ? ORIGINAL_PUBLISHED_REVISION.get(document) || document
    : document;
}
