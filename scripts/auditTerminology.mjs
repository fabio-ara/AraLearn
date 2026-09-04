import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { citationLabel, normalizeDoi, parseBibTeX, renderLocalReferences } from "./buildReadableReferences.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultRegistryPath = "docs/evidence/terminologia-canonica.v1.json";
const defaultDocumentPath = "docs/vocabulario-controlado.md";
const defaultBibliographyPath = "docs/referencias.bib";
const decisions = new Set(["manter", "restringir", "substituir", "remover"]);
const decisionStatuses = new Set(["vigente", "concluido"]);
const alternativesAssessments = new Set(["compared", "no-plausible-candidate"]);
const sourceStatuses = new Set([
  "decisao-produto",
  "definicao-propria",
  "evidencia-academica",
  "evidencia-historica",
  "hipotese-produto",
  "observacao-tecnica",
  "padrao-externo"
]);
const layers = new Set([
  "accessibility",
  "assistant",
  "code",
  "database",
  "deployment",
  "documentation",
  "domain",
  "interface",
  "mcp",
  "research",
  "security",
  "storage"
]);
const forbiddenTransitionKeys = new Set([
  "alias",
  "aliases",
  "compatibilityalias",
  "compatibilityaliases",
  "fallback",
  "fallbacks",
  "legacyalias",
  "legacyaliases"
]);
const textExtensions = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".kt",
  ".kts",
  ".md",
  ".mjs",
  ".ps1",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);
const ignoredDirectories = new Set([
  ".git",
  ".gradle",
  ".pages",
  ".tmp",
  "build",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results"
]);
const familyLabels = new Map([
  ["product-surfaces", "Superfícies do produto"],
  ["instructional-structure", "Estrutura instrucional"],
  ["discourse-text", "Discurso e organização textual"],
  ["representation-system", "Representações e componentes"],
  ["authoring-process", "Processo de autoria"],
  ["evidence-provenance", "Evidência, anotação e proveniência"],
  ["design-parameters", "Parâmetros e regras"],
  ["research-design", "Desenho e mensuração de pesquisa"],
  ["organization-access", "Organização, acesso e distribuição"],
  ["identity-authorization", "Identidade e autorização"],
  ["software-architecture", "Arquitetura de software"],
  ["interaction-cognition", "Interação e cognição"],
  ["assistant-architecture", "Assistente, MCP e estado" ]
]);
const decisionLabels = new Map([
  ["manter", "o nome coincide com o conceito, dentro da definição registrada"],
  ["restringir", "o nome permanece apenas no sentido e nas camadas declarados"],
  ["substituído", "a forma anterior saiu do uso corrente e o termo canônico assumiu seu lugar"],
  ["retirado", "o nome ou símbolo não representa mais um conceito corrente"]
]);
const sourceLabels = new Map([
  ["decisao-produto", "decisão de produto"],
  ["definicao-propria", "definição própria"],
  ["evidencia-academica", "evidência acadêmica"],
  ["evidencia-historica", "evidência histórica"],
  ["hipotese-produto", "hipótese de produto"],
  ["observacao-tecnica", "observação técnica"],
  ["padrao-externo", "padrão externo"]
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizedRelativePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//u, "");
}

function normalizedTerm(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
}

function escapedRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function forbiddenSymbolPattern(symbol) {
  const value = String(symbol);
  if (value.endsWith(".*")) {
    const namespace = escapedRegex(value.slice(0, -1));
    return new RegExp(`(?<=["'\`])${namespace}[A-Za-z0-9_-]+`, "u");
  }
  const startsAsToken = /^[\p{L}\p{N}_]/u.test(value);
  const endsAsToken = /[\p{L}\p{N}_]$/u.test(value);
  return new RegExp(
    `${startsAsToken ? "(?<![\\p{L}\\p{N}_])" : ""}${escapedRegex(value)}${endsAsToken ? "(?![\\p{L}\\p{N}_])" : ""}`,
    value.includes(" ") ? "iu" : "u"
  );
}

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/gu, " ")
    .trim();
}

function codeValues(values) {
  return list(values).map((value) => `\`${markdownCell(value)}\``).join(", ");
}

function sentence(value) {
  const normalized = markdownCell(value);
  return /[.!?]$/u.test(normalized) ? normalized : `${normalized}.`;
}

function symbolValues(term) {
  return codeValues([term.technicalSymbol, ...list(term.relatedSymbols)]);
}

function normalizedAcademicReference(reference) {
  const value = String(reference || "").trim();
  const anchor = /^docs\/referencias\.md#ref-([A-Za-z0-9:_-]+)$/iu.exec(value);
  if (anchor) return `reference:${anchor[1]}`;

  const doi = normalizeDoi(value);
  if (doi) return `doi:${doi}`;

  try {
    return `url:${new URL(value).href}`;
  } catch {
    return `literal:${value}`;
  }
}

function bibliographicSourceIndex(entries) {
  const sources = new Map();
  const collisions = [];
  const register = (reference, entry) => {
    const identifier = normalizedAcademicReference(reference);
    const existing = sources.get(identifier);
    if (existing && existing.key !== entry.key) {
      collisions.push(`${identifier} identifica simultaneamente ${existing.key} e ${entry.key}`);
      return;
    }
    sources.set(identifier, entry);
  };
  for (const entry of list(entries)) {
    register(`docs/referencias.md#ref-${entry.key}`, entry);
    if (entry.fields?.doi) register(entry.fields.doi, entry);
    if (entry.fields?.url) register(entry.fields.url, entry);
  }
  return { sources, collisions };
}

function sourceValues(sources, bibliography) {
  return list(sources).map((source) => {
    const status = sourceLabels.get(source.status) || markdownCell(source.status);
    const reference = markdownCell(source.ref);
    const bibliographicEntry = bibliography.get(normalizedAcademicReference(reference));
    const citation = source.status === "evidencia-academica" && bibliographicEntry
      ? `[${citationLabel(bibliographicEntry)}](referencias.md#ref-${bibliographicEntry.key})`
      : reference.startsWith("https://")
        ? `[${status}](${reference})`
        : reference.startsWith("docs/")
          ? `[${status}](${reference.slice("docs/".length)})`
          : `\`${status}\``;
    return typeof source.supports === "string" && source.supports.trim()
      ? `${citation}: ${markdownCell(source.supports).replace(/[.!?;]+$/u, "")}`
      : citation;
  }).join("; ");
}

function validateAcademicSourceCitations(registry, bibliographyEntries) {
  if (!bibliographyEntries.length) return [];
  const { sources: bibliography, collisions } = bibliographicSourceIndex(bibliographyEntries);
  const findings = collisions.map((collision) => `referencias.bib: identificador bibliográfico ambíguo: ${collision}.`);
  for (const [termIndex, term] of list(registry.terms).entries()) {
    for (const [sourceIndex, source] of list(term.sources).entries()) {
      if (source.status !== "evidencia-academica") continue;
      const reference = String(source.ref || "").trim();
      if (!bibliography.has(normalizedAcademicReference(reference))) {
        findings.push(`terms[${termIndex}].sources[${sourceIndex}]: evidência acadêmica sem citação legível em referencias.bib (${reference}).`);
      }
    }
  }
  return findings;
}

function publicDecision(term) {
  if (term.status !== "concluido") return term.decision;
  return term.decision === "remover" ? "retirado" : "substituído";
}

export function renderControlledVocabulary(registry, bibliographyEntries = []) {
  const { sources: bibliography, collisions } = bibliographicSourceIndex(bibliographyEntries);
  if (collisions.length) {
    throw new Error(`Identificador bibliográfico ambíguo: ${collisions.join("; ")}.`);
  }
  const lines = [
    "# Vocabulário controlado do AraLearn",
    "",
    "Este vocabulário permite usar palavras simples na interface sem misturar conceitos de produto, pesquisa, protocolos e infraestrutura. Cada entrada liga as formas encontradas no projeto aos termos de interface e de domínio, ao símbolo técnico adotado e à definição operacional. As definições, fontes e alternativas examinadas também estão disponíveis no [registro terminológico versionado](evidence/terminologia-canonica.v1.json).",
    "",
    "## Como as camadas se relacionam",
    "",
    "- **Interface e documentação:** linguagem ensinável às pessoas que estudam, criam cursos ou pesquisam.",
    "- **Domínio e pesquisa:** conceitos com definição operacional; eventos observáveis não recebem nomes de processos cognitivos não medidos.",
    "- **Código, banco, Storage e implantação:** símbolos de implementação; não criam um segundo conceito para o mesmo objeto.",
    "- **MCP e assistente:** distinguem instruções de sistema, pedido da tarefa, recurso MCP, ferramenta e estado persistido do curso.",
    "- **Segurança e acessibilidade:** qualificam permissões e estados técnicos sem convertê-los em papéis institucionais ou cognição.",
    "",
    "Um termo pode aparecer em várias camadas, mas conserva uma única definição. Termos de interface podem ser mais curtos que o símbolo técnico somente quando esta correspondência está registrada.",
    "",
    "## Estatutos de decisão",
    "",
    ...[...decisionLabels.entries()].map(([decision, explanation]) => `- \`${decision}\`: ${explanation}.`),
    "",
    "As decisões registram quando um nome permanece com sentido delimitado, quando deve ser usado apenas numa camada e quando uma forma histórica foi substituída ou retirada.",
    "",
    "## Termos",
    ""
  ];

  for (const family of list(registry.policy?.requiredFamilies)) {
    const terms = registry.terms.filter((term) => term.family === family);
    lines.push(`### ${familyLabels.get(family) || family}`, "");
    for (const term of terms) {
      const normalizedInterface = normalizedTerm(term.interfaceTerm);
      const distinctForms = list(term.currentTerms)
        .filter((value) => normalizedTerm(value) !== normalizedInterface);
      lines.push(
        `#### ${markdownCell(term.interfaceTerm)}`,
        "",
        `${sentence(term.definition)} ${sentence(term.araLearnExample)}`,
        "",
        `**Domínio e implementação.** ${markdownCell(term.domainTerm)}; equivalente internacional: ${markdownCell(term.englishEquivalent)}; símbolo: ${symbolValues(term)}.`,
        "",
        `**Uso.** \`${publicDecision(term)}\`${distinctForms.length > 0 ? `; formas técnicas ou históricas: ${codeValues(distinctForms)}` : ""}. Distinguir de ${codeValues(term.notSynonyms)}.`,
        "",
        `**Base.** ${sourceValues(term.sources, bibliography)}.`,
        ""
      );
    }
  }

  const rendered = lines.join("\n");
  return bibliographyEntries.length
    ? renderLocalReferences(rendered, bibliographyEntries)
    : rendered;
}

function absoluteInside(repositoryRoot, relativePath) {
  const normalized = normalizedRelativePath(relativePath);
  const absolute = path.resolve(repositoryRoot, normalized);
  const relative = path.relative(repositoryRoot, absolute);
  if (!normalized || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

function uniqueStrings(value, label, findings, { nonEmpty = true } = {}) {
  const values = list(value);
  if (nonEmpty && values.length === 0) findings.push(`${label}: informe ao menos um valor.`);
  const seen = new Set();
  for (const [index, entry] of values.entries()) {
    if (typeof entry !== "string" || !entry.trim()) {
      findings.push(`${label}[${index}]: valor textual vazio ou inválido.`);
      continue;
    }
    const normalized = normalizedTerm(entry);
    if (seen.has(normalized)) findings.push(`${label}: valor duplicado (${entry}).`);
    seen.add(normalized);
  }
  return values;
}

function auditForbiddenKeys(value, location, findings) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => auditForbiddenKeys(entry, `${location}[${index}]`, findings));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.replaceAll(/[-_]/gu, "").toLocaleLowerCase("en-US");
    if (forbiddenTransitionKeys.has(normalizedKey)) {
      findings.push(`${location}.${key}: aliases e fallbacks de legado são proibidos.`);
    }
    auditForbiddenKeys(entry, `${location}.${key}`, findings);
  }
}

function validateSource(source, label, findings) {
  if (!isRecord(source)) {
    findings.push(`${label}: fonte inválida.`);
    return;
  }
  if (!sourceStatuses.has(source.status)) {
    findings.push(`${label}.status: estatuto inválido (${source.status ?? "ausente"}).`);
  }
  if (typeof source.ref !== "string" || !source.ref.trim()) {
    findings.push(`${label}.ref: referência vazia.`);
  } else if (!source.ref.startsWith("https://")
      && !/^docs\/[A-Za-z0-9_./-]+\.md(?:#[A-Za-z0-9_.:-]+)?$/u.test(source.ref)) {
    findings.push(`${label}.ref: use documento público do projeto ou URL HTTPS (${source.ref}).`);
  }
  if (Object.hasOwn(source, "supports")
      && (typeof source.supports !== "string" || source.supports.trim().length < 30)) {
    findings.push(`${label}.supports: delimite com precisão o que a fonte sustenta.`);
  }
}

function validateTerm(term, index, context) {
  const { findings, ids, symbols, currentTerms } = context;
  const label = `terms[${index}]`;
  if (!isRecord(term)) {
    findings.push(`${label}: registro inválido.`);
    return;
  }
  if (typeof term.id !== "string" || !/^[a-z][a-z0-9-]*$/u.test(term.id)) {
    findings.push(`${label}.id: use identificador kebab-case estável.`);
  } else if (ids.has(term.id)) {
    findings.push(`${label}.id: identificador duplicado (${term.id}).`);
  } else {
    ids.add(term.id);
  }
  if (typeof term.family !== "string" || !term.family) {
    findings.push(`${label}.family: família ausente.`);
  }
  const discoveredTerms = uniqueStrings(term.currentTerms, `${label}.currentTerms`, findings);
  for (const discoveredTerm of discoveredTerms) {
    const normalized = normalizedTerm(discoveredTerm);
    const owner = currentTerms.get(normalized);
    if (owner && owner !== term.id) {
      findings.push(`${label}.currentTerms: termo ${JSON.stringify(discoveredTerm)} também pertence a ${owner}.`);
    } else {
      currentTerms.set(normalized, term.id);
    }
  }
  if (typeof term.productTerm !== "string" || !term.productTerm.trim()) {
    findings.push(`${label}.productTerm: termo de produto ausente.`);
  }
  for (const field of ["interfaceTerm", "domainTerm", "englishEquivalent"]) {
    if (typeof term[field] !== "string" || !term[field].trim()) {
      findings.push(`${label}.${field}: valor textual ausente.`);
    }
  }
  if (typeof term.technicalSymbol !== "string"
      || !/^[A-Za-z][A-Za-z0-9_.:-]*$/u.test(term.technicalSymbol)) {
    findings.push(`${label}.technicalSymbol: símbolo técnico inválido.`);
  } else if (symbols.has(term.technicalSymbol)) {
    findings.push(`${label}.technicalSymbol: símbolo duplicado (${term.technicalSymbol}).`);
  } else {
    symbols.add(term.technicalSymbol);
  }
  for (const [currentIndex, currentSymbol] of uniqueStrings(
    term.currentSymbols,
    `${label}.currentSymbols`,
    findings,
    { nonEmpty: false }
  ).entries()) {
    if (!/^[A-Za-z][A-Za-z0-9_.:*-]*$/u.test(currentSymbol)) {
      findings.push(`${label}.currentSymbols[${currentIndex}]: símbolo atual inválido.`);
    } else if (currentSymbol === term.technicalSymbol) {
      findings.push(`${label}.currentSymbols[${currentIndex}]: símbolo atual deve diferir do símbolo-alvo.`);
    }
  }
  if (Object.hasOwn(term, "currentTechnicalSymbols")) {
    findings.push(`${label}.currentTechnicalSymbols: use currentSymbols.`);
  }
  for (const [relatedIndex, relatedSymbol] of uniqueStrings(
    term.relatedSymbols,
    `${label}.relatedSymbols`,
    findings,
    { nonEmpty: false }
  ).entries()) {
    if (!/^[A-Za-z][A-Za-z0-9_.:*-]*$/u.test(relatedSymbol)) {
      findings.push(`${label}.relatedSymbols[${relatedIndex}]: símbolo relacionado inválido.`);
    } else if (symbols.has(relatedSymbol)) {
      findings.push(`${label}.relatedSymbols[${relatedIndex}]: símbolo duplicado (${relatedSymbol}).`);
    } else {
      symbols.add(relatedSymbol);
    }
  }
  if (typeof term.definition !== "string" || term.definition.trim().length < 40) {
    findings.push(`${label}.definition: definição operacional ausente ou insuficiente.`);
  }
  for (const field of ["araLearnExample", "ambiguityRisk"]) {
    if (typeof term[field] !== "string" || term[field].trim().length < 30) {
      findings.push(`${label}.${field}: explicação ausente ou insuficiente.`);
    }
  }
  if (String(term.araLearnExample || "").includes("é aplicado a uma situação concreta segundo esta regra")) {
    findings.push(`${label}.araLearnExample: substitua o exemplo genérico por uma situação observável do AraLearn.`);
  }
  if (!alternativesAssessments.has(term.alternativesAssessment)) {
    findings.push(`${label}.alternativesAssessment: estado inválido (${term.alternativesAssessment ?? "ausente"}).`);
  }
  const alternatives = uniqueStrings(
    term.alternativesConsidered,
    `${label}.alternativesConsidered`,
    findings,
    { nonEmpty: term.alternativesAssessment === "compared" }
  );
  if (term.alternativesAssessment === "no-plausible-candidate" && alternatives.length > 0) {
    findings.push(`${label}.alternativesConsidered: não invente candidatos quando alternativesAssessment é no-plausible-candidate.`);
  }
  if (term.alternativesAssessment === "no-plausible-candidate") {
    if (typeof term.alternativesRationale !== "string"
        || term.alternativesRationale.trim().length < 40) {
      findings.push(`${label}.alternativesRationale: justifique especificamente por que não há candidato plausível.`);
    } else {
      const normalizedRationale = normalizedTerm(term.alternativesRationale);
      const owner = context.alternativeRationales.get(normalizedRationale);
      if (owner && owner !== term.id) {
        findings.push(`${label}.alternativesRationale: justificativa duplicada com ${owner}.`);
      } else {
        context.alternativeRationales.set(normalizedRationale, term.id);
      }
    }
  } else if (Object.hasOwn(term, "alternativesRationale")) {
    findings.push(`${label}.alternativesRationale: use somente quando não houver candidato plausível.`);
  }
  for (const [alternativeIndex, alternative] of alternatives.entries()) {
    if (typeof alternative === "string" && alternative.trim().length < 30) {
      findings.push(`${label}.alternativesConsidered[${alternativeIndex}]: registre candidato e razão específica da decisão.`);
    }
    if (alternative.includes("rejeitado ou restringido porque o nome atual não explicita")
        || (alternative.includes("não substitui") && alternative.includes("o critério adotado é"))
        || alternative.includes("permanece conceito separado porque classificá-lo como")) {
      findings.push(`${label}.alternativesConsidered[${alternativeIndex}]: justifique a alternativa específica; boilerplate é proibido.`);
    }
  }
  if (!decisions.has(term.decision)) {
    findings.push(`${label}.decision: decisão inválida (${term.decision ?? "ausente"}).`);
  }
  if (!decisionStatuses.has(term.status)) {
    findings.push(`${label}.status: estado inválido (${term.status ?? "ausente"}).`);
  }
  for (const obsoleteField of [
    "cutoverStatus",
    "cutoverIssue",
    "removeBy",
    "transitionPolicy",
    "migrationImpact",
    "implementationStatus"
  ]) {
    if (Object.hasOwn(term, obsoleteField)) {
      findings.push(`${label}.${obsoleteField}: o registro corrente não conserva metadados de migração.`);
    }
  }
  for (const [layerIndex, layer] of uniqueStrings(term.layers, `${label}.layers`, findings).entries()) {
    if (!layers.has(layer)) findings.push(`${label}.layers[${layerIndex}]: camada inválida (${layer}).`);
  }
  const sources = list(term.sources);
  if (sources.length === 0) findings.push(`${label}.sources: informe fonte e estatuto.`);
  sources.forEach((source, sourceIndex) => (
    validateSource(source, `${label}.sources[${sourceIndex}]`, findings)
  ));
  uniqueStrings(term.notSynonyms, `${label}.notSynonyms`, findings);

  const replacementDecision = new Set(["substituir", "remover"]).has(term.decision);
  if (term.status === "vigente" && replacementDecision) {
    findings.push(`${label}: substituir/remover exige decisão concluída.`);
  }
  if (term.status === "concluido" && !replacementDecision) {
    findings.push(`${label}: manter/restringir deve permanecer vigente.`);
  }
  const requiresResidueGate = term.status === "concluido"
    && new Set(["substituir", "remover"]).has(term.decision);
  const forbiddenSymbols = uniqueStrings(
    term.forbiddenSymbols,
    `${label}.forbiddenSymbols`,
    findings,
    { nonEmpty: requiresResidueGate }
  );
  if (!requiresResidueGate && forbiddenSymbols.length > 0) {
    findings.push(`${label}.forbiddenSymbols: só decisões concluídas de substituição/remoção podem abolir símbolos.`);
  }
}

export function validateTerminologyRegistry(registry) {
  const findings = [];
  if (!isRecord(registry)) return ["Registro terminológico ausente ou inválido."];
  if (registry.contract !== "aralearn.canonical-terminology.v1") {
    findings.push("contract: esperado aralearn.canonical-terminology.v1.");
  }
  if (typeof registry.purpose !== "string" || registry.purpose.trim().length < 40) {
    findings.push("purpose: finalidade ausente ou insuficiente.");
  }
  const policy = isRecord(registry.policy) ? registry.policy : {};
  for (const obsoleteField of [
    "reviewIssue",
    "finalRemovalIssue",
    "transitionPolicy",
    "issueCatalog"
  ]) {
    if (Object.hasOwn(policy, obsoleteField)) {
      findings.push(`policy.${obsoleteField}: a política corrente não conserva metadados de migração.`);
    }
  }
  const requiredFamilies = uniqueStrings(
    policy.requiredFamilies,
    "policy.requiredFamilies",
    findings
  );
  uniqueStrings(policy.historicalPaths, "policy.historicalPaths", findings, { nonEmpty: false });
  const terms = list(registry.terms);
  if (terms.length === 0) findings.push("terms: registro precisa conter decisões terminológicas.");
  const context = {
    findings,
    ids: new Set(),
    symbols: new Set(),
    currentTerms: new Map(),
    alternativeRationales: new Map()
  };
  terms.forEach((term, index) => validateTerm(term, index, context));
  const coveredFamilies = new Set(terms.map((term) => term?.family).filter(Boolean));
  for (const family of requiredFamilies) {
    if (!coveredFamilies.has(family)) findings.push(`Família obrigatória sem decisão: ${family}.`);
  }
  for (const family of coveredFamilies) {
    if (!requiredFamilies.includes(family)) findings.push(`Família não declarada em policy.requiredFamilies: ${family}.`);
  }
  auditForbiddenKeys(registry, "registry", findings);
  return findings;
}

function historicalPath(relativePath, configuredPaths) {
  return configuredPaths.some((configuredPath) => {
    const normalized = normalizedRelativePath(configuredPath);
    if (!normalized) return false;
    return normalized.endsWith("/")
      ? relativePath.startsWith(normalized)
      : relativePath === normalized;
  });
}

async function textFiles(repositoryRoot, relativeDirectory = "") {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relativePath = normalizedRelativePath(path.join(relativeDirectory, entry.name));
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : textFiles(repositoryRoot, relativePath);
    }
    return textExtensions.has(path.extname(entry.name).toLocaleLowerCase("en-US"))
      ? [relativePath]
      : [];
  }));
  return nested.flat().sort();
}

async function auditAbolishedSymbols({
  repositoryRoot,
  registry,
  registryPath,
  documentPath
}) {
  const findings = [];
  const abolished = registry.terms.filter((term) => term.status === "concluido"
    && new Set(["substituir", "remover"]).has(term.decision));
  if (abolished.length === 0) return findings;
  const registryRelativePath = normalizedRelativePath(registryPath);
  const documentRelativePath = normalizedRelativePath(documentPath);
  const historicalPaths = list(registry.policy?.historicalPaths).map(normalizedRelativePath);
  const files = (await textFiles(repositoryRoot)).filter((relativePath) => (
    relativePath !== registryRelativePath
      && relativePath !== documentRelativePath
      && !historicalPath(relativePath, historicalPaths)
  ));
  for (const relativePath of files) {
    const source = await readFile(path.join(repositoryRoot, relativePath), "utf8");
    for (const term of abolished) {
      for (const symbol of list(term.forbiddenSymbols)) {
        if (forbiddenSymbolPattern(symbol).test(source)) {
          findings.push(`${relativePath}: contém símbolo abolido ${JSON.stringify(symbol)} (${term.id}).`);
        }
      }
    }
  }
  return findings;
}

async function auditRenderedDocument({ repositoryRoot, registry, documentPath, bibliographyEntries }) {
  const absoluteDocumentPath = absoluteInside(repositoryRoot, documentPath);
  if (!absoluteDocumentPath) return [`Documento gerado fora do repositório: ${documentPath}.`];
  let current;
  try {
    current = await readFile(absoluteDocumentPath, "utf8");
  } catch {
    return [`${documentPath}: documento derivado ausente; execute audit:terminology -- --render.`];
  }
  const expected = renderControlledVocabulary(registry, bibliographyEntries);
  return current.replace(/\r\n?/gu, "\n") === expected
    ? []
    : [`${documentPath}: documento derivado desatualizado; execute audit:terminology -- --render.`];
}

export async function auditTerminology({
  repositoryRoot = defaultRepositoryRoot,
  registry = null,
  registryPath = defaultRegistryPath,
  documentPath = defaultDocumentPath,
  bibliographyEntries = null,
  bibliographyPath = defaultBibliographyPath,
  checkRenderedDocument = registry == null
} = {}) {
  const resolvedRegistry = registry ?? JSON.parse(await readFile(
    absoluteInside(repositoryRoot, registryPath),
    "utf8"
  ));
  const resolvedBibliography = bibliographyEntries ?? (registry == null
    ? parseBibTeX(await readFile(absoluteInside(repositoryRoot, bibliographyPath), "utf8"))
    : []);
  const findings = validateTerminologyRegistry(resolvedRegistry);
  if (findings.length > 0) return findings;
  findings.push(...validateAcademicSourceCitations(resolvedRegistry, resolvedBibliography));
  findings.push(...await auditAbolishedSymbols({
    repositoryRoot,
    registry: resolvedRegistry,
    registryPath,
    documentPath
  }));
  if (checkRenderedDocument) {
    findings.push(...await auditRenderedDocument({
      repositoryRoot,
      registry: resolvedRegistry,
      documentPath,
      bibliographyEntries: resolvedBibliography
    }));
  }
  return findings;
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const render = argumentsList.length === 1 && argumentsList[0] === "--render";
  const check = argumentsList.length === 0
    || (argumentsList.length === 1 && argumentsList[0] === "--check");
  if (!render && !check) throw new TypeError("Use --render, --check ou nenhum argumento.");
  const registry = JSON.parse(await readFile(
    path.join(defaultRepositoryRoot, defaultRegistryPath),
    "utf8"
  ));
  const bibliographyEntries = parseBibTeX(await readFile(
    path.join(defaultRepositoryRoot, defaultBibliographyPath),
    "utf8"
  ));
  const findings = await auditTerminology({
    registry,
    bibliographyEntries,
    checkRenderedDocument: check
  });
  if (findings.length > 0) {
    process.stderr.write(`${findings.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  if (render) {
    await writeFile(
      path.join(defaultRepositoryRoot, defaultDocumentPath),
      renderControlledVocabulary(registry, bibliographyEntries),
      "utf8"
    );
    process.stdout.write(`Vocabulário humano regenerado em ${defaultDocumentPath}.\n`);
    return;
  }
  process.stdout.write(
    `Vocabulário canônico validado: ${registry.terms.length} decisões, sem aliases, fallbacks ou resíduos concluídos.\n`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
