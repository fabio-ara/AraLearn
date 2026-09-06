const STYLES = new Set(["apa7", "abnt-2025"]);
const TYPES = new Set([
  "article", "article-journal", "article-magazine", "article-newspaper", "book", "chapter",
  "webpage", "document", "report", "standard", "speech", "manuscript", "motion_picture", "broadcast", "song"
]);
const TEXT_FIELDS = new Set([
  "title", "container-title", "publisher", "publisher-place", "volume", "issue", "page",
  "number", "edition", "DOI", "ISBN", "ISSN", "URL", "language", "genre"
]);
const ITEM_FIELDS = new Set(["id", "type", "author", "editor", "issued", "accessed", ...TEXT_FIELDS]);
const encoder = new TextEncoder();
let enginePromise;
const resultCache = new Map();

export class BibliographyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BibliographyError";
    this.code = code;
  }
}

function invalid(message = "Os dados bibliográficos não estão em um formato aceito.") {
  throw new BibliographyError("invalid_bibliographic_reference", message);
}

function object(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some((key) => !fields.has(key))) invalid();
}

function text(value, maximum = 4000) {
  if (typeof value !== "string" || !value.trim() || Array.from(value).length > maximum ||
      Array.from(value).some((character) => {
        const point = character.codePointAt(0);
        return (point < 32 && ![9, 10, 13].includes(point)) || point === 127 || (point >= 0xD800 && point <= 0xDFFF);
      })) invalid();
  return value;
}

function names(value) {
  if (!Array.isArray(value) || value.length > 64) invalid();
  return value.map((name) => {
    object(name, new Set(["literal", "family", "given"]));
    if (Object.hasOwn(name, "literal")) {
      if (Object.keys(name).length !== 1) invalid();
      return { literal: text(name.literal, 1000) };
    }
    const result = { family: text(name.family, 1000) };
    if (Object.hasOwn(name, "given")) result.given = text(name.given, 1000);
    return result;
  });
}

function date(value) {
  object(value, new Set(["date-parts"]));
  const parts = value["date-parts"];
  if (!Array.isArray(parts) || parts.length !== 1 || !Array.isArray(parts[0]) ||
      parts[0].length < 1 || parts[0].length > 3 || !parts[0].every(Number.isInteger)) invalid();
  const [year, month, day] = parts[0];
  if (year < 1 || year > 9999 || (month !== undefined && (month < 1 || month > 12))) invalid();
  if (day !== undefined) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > days[month - 1]) invalid();
  }
  return { "date-parts": [[...parts[0]]] };
}

function normalizeItem(value) {
  object(value, ITEM_FIELDS);
  if (!TYPES.has(value.type)) invalid();
  const result = { id: text(value.id, 240), type: value.type };
  for (const field of TEXT_FIELDS) {
    if (!Object.hasOwn(value, field)) continue;
    if (field === "title" && value[field] === null) continue;
    result[field] = text(value[field], ["title", "container-title"].includes(field) ? 4000 : field === "URL" ? 2048 : 1000);
  }
  if (result.URL) {
    let url;
    try { url = new URL(result.URL); } catch { invalid(); }
    if (url.protocol !== "https:" || url.username || url.password) invalid();
  }
  if (result.language && !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(result.language)) invalid();
  for (const field of ["author", "editor"]) if (Object.hasOwn(value, field)) result[field] = names(value[field]);
  for (const field of ["issued", "accessed"]) if (Object.hasOwn(value, field)) result[field] = date(value[field]);
  if (!["title", "container-title", "publisher", "URL", "DOI", "ISBN", "ISSN", "number"].some((field) => result[field]) &&
      !result.author?.length && !result.editor?.length) {
    throw new BibliographyError("insufficient_bibliographic_data", "Informe os dados conhecidos ou escolha uma referência escrita por você.");
  }
  if (encoder.encode(JSON.stringify(result)).length > 32768) invalid("Os dados bibliográficos excedem o tamanho aceito.");
  return result;
}

function closedFormat(CSL) {
  return {
    ...CSL.Output.Formats.text,
    text_escape: (value) => String(value || "").replace(/&/gu, "&#38;").replace(/</gu, "&#60;").replace(/>/gu, "&#62;"),
    "@font-style/italic": "<em>%%STRING%%</em>",
    "@font-style/oblique": "<em>%%STRING%%</em>",
    "@font-style/normal": "<span class=\"normal-italic\">%%STRING%%</span>",
    "@font-weight/bold": "<strong>%%STRING%%</strong>",
    "@font-weight/normal": "<span class=\"normal-bold\">%%STRING%%</span>",
    "@vertical-align/sup": "<sup>%%STRING%%</sup>",
    "@vertical-align/sub": "<sub>%%STRING%%</sub>",
    "@vertical-align/baseline": "<span class=\"normal-baseline\">%%STRING%%</span>"
  };
}

async function engine() {
  if (!enginePromise) {
    enginePromise = Promise.all([
      import("./vendor/citeproc.generated.js"),
      import("./vendor/styles.generated.js")
    ]).then(([{ default: CSL }, assets]) => {
      CSL.Output.Formats.aralearn = closedFormat(CSL);
      return { CSL, ...assets };
    }).catch(() => {
      enginePromise = null;
      throw new BibliographyError("bibliography_engine_unavailable", "Não foi possível carregar a formatação de referências.");
    });
  }
  return enginePromise;
}

function runsFromClosedOutput(value) {
  if (typeof value !== "string" || encoder.encode(value).length > 131072) invalid();
  const runs = [];
  const stack = [{ tag: "", format: {} }];
  const decoded = { "&#38;": "&", "&#60;": "<", "&#62;": ">" };
  for (const part of value.trim().split(/(<[^>]*>)/gu)) {
    if (!part) continue;
    if (part.startsWith("<")) {
      if (/^<\/(?:em|strong|sup|sub|span)>$/u.test(part)) {
        if (stack.length === 1 || stack.at(-1).tag !== part.slice(2, -1)) invalid();
        stack.pop();
        continue;
      }
      const format = { ...stack.at(-1).format };
      let tag;
      if (part === "<em>") { tag = "em"; format.italic = true; }
      else if (part === "<strong>") { tag = "strong"; format.bold = true; }
      else if (part === "<sup>" || part === "<sub>") { tag = part.slice(1, -1); format.verticalAlign = tag; }
      else if (part === '<span class="normal-italic">') { tag = "span"; delete format.italic; }
      else if (part === '<span class="normal-bold">') { tag = "span"; delete format.bold; }
      else if (part === '<span class="normal-baseline">') { tag = "span"; delete format.verticalAlign; }
      else invalid();
      if (stack.length >= 32) invalid();
      stack.push({ tag, format });
      continue;
    }
    const run = { text: part.replace(/&#(?:38|60|62);/gu, (entity) => decoded[entity]), ...stack.at(-1).format };
    const previous = runs.at(-1);
    if (previous && previous.italic === run.italic && previous.bold === run.bold && previous.verticalAlign === run.verticalAlign) previous.text += run.text;
    else runs.push(run);
  }
  if (stack.length !== 1 || runs.length > 512 || !runs.some((run) => run.text.trim())) invalid();
  return runs;
}

async function renderNormalizedItem(normalized, style) {
  const { CSL, styles, locales } = await engine();
  const processorId = "aralearn-reference";
  const processor = new CSL.Engine({
    retrieveLocale: (language) => Object.hasOwn(locales, language) ? locales[language] : false,
    retrieveItem: (id) => {
      if (id !== processorId) invalid();
      return structuredClone({ ...normalized, id: processorId });
    }
  }, styles[style], style === "apa7" ? "en-US" : "pt-BR");
  processor.setOutputFormat("aralearn");
  processor.updateItems([processorId]);
  const bibliography = processor.makeBibliography();
  if (!bibliography || bibliography[1].length !== 1 || bibliography[0].bibliography_errors?.length) {
    throw new BibliographyError("bibliographic_formatting_failed", "Revise os dados para formatar esta referência.");
  }
  const runs = runsFromClosedOutput(bibliography[1][0]);
  return { text: runs.map((run) => run.text).join(""), runs };
}

/** Formats one bounded CSL item; source projection and manual references belong to the domain adapter. */
export async function renderCslReference(item, { style } = {}) {
  if (!STYLES.has(style)) throw new BibliographyError("invalid_bibliography_style", "Escolha um estilo de referência disponível.");
  const normalized = normalizeItem(item);
  const key = JSON.stringify([style, normalized]);
  let result = resultCache.get(key);
  if (!result) {
    result = renderNormalizedItem(normalized, style).catch((error) => {
      if (resultCache.get(key) === result) resultCache.delete(key);
      if (error instanceof BibliographyError) throw error;
      throw new BibliographyError("bibliographic_formatting_failed", "Revise os dados para formatar esta referência.");
    });
    resultCache.set(key, result);
    if (resultCache.size > 32) resultCache.delete(resultCache.keys().next().value);
  }
  return structuredClone(await result);
}
