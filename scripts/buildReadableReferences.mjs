import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");
const PANDOC_CITATION = /\[([^\]]*?@[^\]]+)\]/gu;
const READABLE_CITATION = /\[([^\]]+)\]\(referencias\.md#ref-([A-Za-z0-9:_-]+)\)/gu;

function matchingBrace(source, opening) {
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{" && source[index - 1] !== "\\") depth += 1;
    if (source[index] === "}" && source[index - 1] !== "\\") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`Entrada BibTeX iniciada na posição ${opening} não foi encerrada.`);
}

function readFieldValue(source, start) {
  if (source[start] === "{") {
    const end = matchingBrace(source, start);
    return { value: source.slice(start + 1, end), end: end + 1 };
  }
  if (source[start] === '"') {
    let index = start + 1;
    while (index < source.length && (source[index] !== '"' || source[index - 1] === "\\")) index += 1;
    if (index >= source.length) throw new Error(`Campo BibTeX iniciado na posição ${start} não foi encerrado.`);
    return { value: source.slice(start + 1, index), end: index + 1 };
  }
  let index = start;
  while (index < source.length && source[index] !== ",") index += 1;
  return { value: source.slice(start, index).trim(), end: index };
}

function parseFields(source) {
  const fields = {};
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /[\s,]/u.test(source[index])) index += 1;
    if (index >= source.length) break;
    const name = /^[A-Za-z][A-Za-z0-9_-]*/u.exec(source.slice(index));
    if (!name) throw new Error(`Nome de campo BibTeX inválido próximo à posição ${index}.`);
    index += name[0].length;
    while (/\s/u.test(source[index] || "")) index += 1;
    if (source[index] !== "=") throw new Error(`Campo BibTeX ${name[0]} não possui sinal de igualdade.`);
    index += 1;
    while (/\s/u.test(source[index] || "")) index += 1;
    const parsed = readFieldValue(source, index);
    fields[name[0].toLocaleLowerCase("en-US")] = parsed.value.trim();
    index = parsed.end;
  }
  return fields;
}

export function parseBibTeX(source) {
  const entries = [];
  const keys = new Set();
  let cursor = 0;
  while (cursor < source.length) {
    const relative = source.slice(cursor).search(/@[A-Za-z]+\s*\{/u);
    if (relative < 0) break;
    const start = cursor + relative;
    const header = /^@([A-Za-z]+)\s*\{\s*([^,\s]+)\s*,/u.exec(source.slice(start));
    if (!header) throw new Error(`Cabeçalho BibTeX inválido próximo à posição ${start}.`);
    const opening = start + header[0].lastIndexOf("{");
    const end = matchingBrace(source, opening);
    const bodyStart = start + header[0].length;
    const key = header[2];
    if (keys.has(key)) throw new Error(`Chave BibTeX duplicada: ${key}.`);
    keys.add(key);
    entries.push({ type: header[1].toLocaleLowerCase("en-US"), key, fields: parseFields(source.slice(bodyStart, end)) });
    cursor = end + 1;
  }
  if (!entries.length) throw new Error("A bibliografia BibTeX não contém entradas.");
  return entries;
}

const COMBINING_MARKS = Object.freeze({
  "'": "\u0301",
  "`": "\u0300",
  '"': "\u0308",
  "^": "\u0302",
  "~": "\u0303",
  "=": "\u0304",
  ".": "\u0307",
  u: "\u0306",
  v: "\u030C",
  H: "\u030B",
  c: "\u0327"
});

function accent(command, letter) {
  return `${letter}${COMBINING_MARKS[command] || ""}`.normalize("NFC");
}

export function decodeBibTeX(value) {
  return String(value || "")
    .replace(/\{\\ss\}/gu, "ß")
    .replace(/\\ss\b/gu, "ß")
    .replace(/\{\\i\}/gu, "i")
    .replace(/\{\\j\}/gu, "j")
    .replace(/\{\\(["'`^~=.uvHc])\{?([A-Za-z])\}?\}/gu, (_, command, letter) => accent(command, letter))
    .replace(/\\(["'`^~=.uvHc])\{([A-Za-z])\}/gu, (_, command, letter) => accent(command, letter))
    .replace(/\\(["'`^~=.uvHc])([A-Za-z])/gu, (_, command, letter) => accent(command, letter))
    .replace(/\\&/gu, "&")
    .replace(/\\_/gu, "_")
    .replace(/---/gu, "—")
    .replace(/--/gu, "–")
    .replace(/[{}]/gu, "")
    .replace(/\\([#$%])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function splitNames(value) {
  const result = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "{") depth += 1;
    else if (value[index] === "}") depth -= 1;
    else if (depth === 0 && value.slice(index, index + 5) === " and ") {
      result.push(value.slice(start, index));
      start = index + 5;
      index += 4;
    }
  }
  result.push(value.slice(start));
  return result.map((name) => name.trim()).filter(Boolean);
}

function parsedNames(rawValue) {
  return splitNames(rawValue || "").map((raw) => {
    const corporate = /^\{.*\}$/su.test(raw.trim());
    const value = decodeBibTeX(raw);
    if (corporate || !value.includes(",")) {
      return { display: value, family: corporate ? value : value.split(/\s+/u).at(-1) };
    }
    const [family, ...givenParts] = value.split(",").map((part) => part.trim());
    const given = givenParts.join(" ");
    return { display: given ? `${given} ${family}` : family, family };
  });
}

export function citationLabel(entry) {
  const authors = parsedNames(entry.fields.author);
  const year = decodeBibTeX(entry.fields.year) || "s.d.";
  if (!authors.length) return `${decodeBibTeX(entry.fields.institution || entry.fields.publisher) || entry.key} (${year})`;
  if (authors.length === 1) return `${authors[0].family} (${year})`;
  if (authors.length === 2) return `${authors[0].family} e ${authors[1].family} (${year})`;
  return `${authors[0].family} et al. (${year})`;
}

function markdownText(value) {
  return decodeBibTeX(value).replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function pageRange(value) {
  return markdownText(value).replace(/--/gu, "–");
}

function publication(entry) {
  const fields = entry.fields;
  const parts = [];
  if (entry.type === "article") {
    if (fields.journal) parts.push(`*${markdownText(fields.journal)}*`);
    if (fields.volume) {
      const issue = fields.number ? `(${markdownText(fields.number)})` : "";
      parts.push(`${markdownText(fields.volume)}${issue}`);
    }
    if (fields.pages) parts.push(`p. ${pageRange(fields.pages)}`);
  } else if (entry.type === "book") {
    if (fields.edition) parts.push(`${markdownText(fields.edition)}. ed.`);
    if (fields.address) parts.push(markdownText(fields.address));
    if (fields.publisher) parts.push(markdownText(fields.publisher));
  } else if (entry.type === "incollection" || entry.type === "inproceedings") {
    if (fields.booktitle) parts.push(`In: *${markdownText(fields.booktitle)}*`);
    if (fields.publisher) parts.push(markdownText(fields.publisher));
    if (fields.volume) parts.push(`vol. ${markdownText(fields.volume)}`);
    if (fields.pages) parts.push(`p. ${pageRange(fields.pages)}`);
  } else if (entry.type === "techreport") {
    if (fields.institution) parts.push(markdownText(fields.institution));
    if (fields.number) parts.push(markdownText(fields.number));
  } else {
    if (fields.institution) parts.push(markdownText(fields.institution));
    else if (fields.publisher) parts.push(markdownText(fields.publisher));
    if (fields.number) parts.push(markdownText(fields.number));
  }
  return parts.join(", ");
}

function referenceBlock(entry) {
  const authors = parsedNames(entry.fields.author).map((author) => author.display).join("; ");
  const responsible = authors || markdownText(entry.fields.institution || entry.fields.publisher) || entry.key;
  const year = markdownText(entry.fields.year) || "s.d.";
  const title = markdownText(entry.fields.title) || "Sem título";
  const publicationText = publication(entry);
  const identifiers = [];
  if (entry.fields.doi) {
    const doi = decodeBibTeX(entry.fields.doi);
    identifiers.push(`[DOI ${doi}](https://doi.org/${doi})`);
  }
  if (entry.fields.url) identifiers.push(`[acesso ao documento](${decodeBibTeX(entry.fields.url)})`);
  if (entry.fields.isbn) identifiers.push(`ISBN ${markdownText(entry.fields.isbn)}`);
  return [
    `<a id="ref-${entry.key}"></a>`,
    "",
    `### ${citationLabel(entry)}`,
    "",
    `${responsible} (${year}). **${title}.**${publicationText ? ` ${publicationText}.` : ""}${identifiers.length ? ` ${identifiers.join(" · ")}.` : ""}`,
    "",
    `Chave bibliográfica: \`${entry.key}\`.`,
    ""
  ].join("\n");
}

export function renderReadableReferences(entries) {
  const sorted = [...entries].sort((left, right) => {
    const byLabel = citationLabel(left).localeCompare(citationLabel(right), "pt-BR", { sensitivity: "base" });
    return byLabel || left.key.localeCompare(right.key, "en-US");
  });
  return [
    "# Referências bibliográficas",
    "",
    "Esta página apresenta, em formato legível, as fontes citadas na documentação do AraLearn. Os links de citação levam diretamente à entrada correspondente e conservam, em sua âncora, a chave usada pela bibliografia canônica.",
    "",
    "O arquivo [`referencias.bib`](referencias.bib) é a fonte canônica dos metadados e permanece disponível para editores bibliográficos, processadores como Pandoc e outros fluxos acadêmicos. Esta página é gerada a partir dele; portanto, não deve ser editada manualmente.",
    "",
    "## Como interpretar as entradas",
    "",
    "Cada entrada informa autoria ou responsabilidade institucional, ano, título, veículo de publicação e identificadores persistentes disponíveis. O DOI é preferido como ligação estável; ISBN e endereço oficial são mantidos quando pertinentes.",
    "",
    "## Como manter a bibliografia",
    "",
    "1. Edite somente `referencias.bib` para acrescentar ou corrigir metadados.",
    "2. Execute `npm run docs:references` para reconstruir esta página.",
    "3. Nas páginas públicas, use o rótulo legível de autoria e ano com um link para a âncora `ref-<chave>`. Ao incorporar texto que ainda contenha citações Pandoc, `npm run docs:references:convert` realiza essa conversão de forma determinística.",
    "4. Execute `npm run docs:references:check` antes de concluir a alteração. A conferência rejeita página gerada divergente, citação Pandoc exposta, chave desconhecida e rótulo de autoria ou ano desatualizado.",
    "",
    "Como a chave permanece no destino de cada link, um processamento futuro pode recuperar a notação `[@chave]` sem inferir a fonte a partir do texto visível.",
    "",
    "## Lista de referências",
    "",
    ...sorted.map(referenceBlock)
  ].join("\n").replace(/\n{3,}/gu, "\n\n").trimEnd() + "\n";
}

export function replacePandocCitations(source, entries, target = "referencias.md") {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  return source.replace(PANDOC_CITATION, (whole, body) => {
    const keys = [...body.matchAll(/@([A-Za-z0-9:_-]+)/gu)].map((match) => match[1]);
    if (!keys.length || body.replace(/@([A-Za-z0-9:_-]+)/gu, "").replace(/[;\s]/gu, "")) return whole;
    const links = keys.map((key) => {
      const entry = byKey.get(key);
      if (!entry) throw new Error(`Citação desconhecida: @${key}.`);
      return `[${citationLabel(entry)}](${target}#ref-${key})`;
    });
    return `(${links.join("; ")})`;
  });
}

export function readableCitationKeys(source) {
  return [...source.matchAll(READABLE_CITATION)].map((match) => match[2]);
}

export function validateReadableCitations(source, entries, file = "documento") {
  const errors = [];
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  for (const match of source.matchAll(PANDOC_CITATION)) {
    errors.push(`${file}: citação Pandoc exposta ao leitor: ${match[0]}`);
  }
  for (const match of source.matchAll(READABLE_CITATION)) {
    const [, label, key] = match;
    const entry = byKey.get(key);
    if (!entry) {
      errors.push(`${file}: citação legível aponta para chave desconhecida: ${key}`);
      continue;
    }
    const expected = citationLabel(entry);
    if (label !== expected) errors.push(`${file}: rótulo da citação ${key} deveria ser “${expected}”, não “${label}”`);
  }
  return errors;
}

function cliArguments(argv) {
  return {
    check: argv.includes("--check"),
    convert: argv.includes("--convert-citations"),
    root: defaultRoot
  };
}

function markdownUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownUnder(target);
    return entry.isFile() && target.endsWith(".md") ? [target] : [];
  });
}

export function buildReadableReferences({ root = defaultRoot, check = false, convert = false } = {}) {
  const bibliography = path.join(root, "docs", "referencias.bib");
  const output = path.join(root, "docs", "referencias.md");
  const entries = parseBibTeX(fs.readFileSync(bibliography, "utf8"));
  const rendered = renderReadableReferences(entries);
  const current = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
  if (check && current !== rendered) throw new Error("docs/referencias.md diverge de docs/referencias.bib; execute npm run docs:references.");
  if (!check && current !== rendered) fs.writeFileSync(output, rendered, "utf8");

  if (check) {
    const citationErrors = [];
    for (const file of markdownUnder(path.join(root, "docs"))) {
      if (file === output || file.includes(`${path.sep}downloads${path.sep}`)) continue;
      const relative = path.relative(root, file).replaceAll("\\", "/");
      citationErrors.push(...validateReadableCitations(fs.readFileSync(file, "utf8"), entries, relative));
    }
    if (citationErrors.length) throw new Error(citationErrors.join("\n"));
  }

  if (convert) {
    if (check) throw new Error("--check e --convert-citations não podem ser usados juntos.");
    for (const file of markdownUnder(path.join(root, "docs"))) {
      if (file === output || file.includes(`${path.sep}downloads${path.sep}`)) continue;
      const source = fs.readFileSync(file, "utf8");
      const converted = replacePandocCitations(source, entries);
      if (converted !== source) fs.writeFileSync(file, converted, "utf8");
    }
  }
  return { entries, rendered };
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  try {
    const options = cliArguments(process.argv.slice(2));
    const result = buildReadableReferences(options);
    console.log(`${result.entries.length} referências bibliográficas verificadas.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
