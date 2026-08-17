import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultRegistryPath = "docs/evidence/terminologia-canonica.v1.json";
const defaultDocumentPath = "docs/vocabulario-controlado.md";
const decisions = new Set(["manter", "restringir", "substituir", "remover"]);
const cutoverStatuses = new Set(["sem-corte", "pendente", "concluido"]);
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
  ["manter", "manter: o nome coincide com o conceito, dentro da definição registrada"],
  ["restringir", "restringir: o nome permanece apenas no sentido e nas camadas declarados"],
  ["substituir", "substituir: o nome atual sai no corte indicado e o canônico assume todas as camadas"],
  ["remover", "remover: o nome ou símbolo não representa mais um conceito corrente"]
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

function termStage(term) {
  if (term.cutoverStatus === "pendente") {
    return `corte ${term.cutoverIssue}; remoção integral até ${term.removeBy}`;
  }
  if (term.cutoverStatus === "concluido") {
    return `corte terminológico concluído em ${term.cutoverIssue}`;
  }
  return `termo vigente; sem corte de renomeação`;
}

function symbolValues(term) {
  const target = codeValues([term.technicalSymbol, ...list(term.relatedSymbols)]);
  const current = codeValues(term.currentSymbols);
  return current ? `atual: ${current} → alvo: ${target}` : target;
}

function sourceValues(sources) {
  return list(sources).map((source) => {
    const status = markdownCell(source.status);
    const reference = markdownCell(source.ref);
    const citation = reference.startsWith("https://")
      ? `[${status}](${reference})`
      : `\`${status}\` ${reference}`;
    return typeof source.supports === "string" && source.supports.trim()
      ? `${citation} — ${markdownCell(source.supports)}`
      : citation;
  }).join("; ");
}

export function renderControlledVocabulary(registry) {
  const lines = [
    "# Vocabulário controlado do AraLearn",
    "",
    "> Documento gerado de `docs/evidence/terminologia-canonica.v1.json`. Não edite as tabelas manualmente; altere o registro e execute `npm run audit:terminology -- --render`.",
    "",
    "Este vocabulário permite usar palavras simples na interface sem misturar conceitos de produto, pesquisa, protocolos e infraestrutura. Cada entrada liga o nome encontrado hoje aos termos de interface e de domínio, ao símbolo técnico-alvo, à definição operacional e à etapa que fará a retirada completa do nome anterior.",
    "",
    "## Como as camadas se relacionam",
    "",
    "- **Interface e documentação:** linguagem ensinável às pessoas que estudam, criam cursos ou pesquisam.",
    "- **Domínio e pesquisa:** conceitos com definição operacional; eventos observáveis não recebem nomes de processos cognitivos não medidos.",
    "- **Código, banco, Storage e implantação:** símbolos de implementação; não criam um segundo conceito para o mesmo objeto.",
    "- **MCP e assistente:** distinguem instruções de sistema, prompt de tarefa, Resource MCP, ferramenta e estado persistido do curso.",
    "- **Segurança e acessibilidade:** qualificam permissões e estados técnicos sem convertê-los em papéis institucionais ou cognição.",
    "",
    "Um termo pode aparecer em várias camadas, mas conserva uma única definição. Termos de interface podem ser mais curtos que o símbolo técnico somente quando esta correspondência está registrada.",
    "",
    "## Estatutos de decisão",
    "",
    ...[...decisionLabels.entries()].map(([decision, explanation]) => `- \`${decision}\` — ${explanation}.`),
    "",
    "`cutoverStatus` descreve somente o estado da **decisão terminológica**: `sem-corte` para um termo vigente, `pendente` para uma troca programada e `concluido` para uma troca já aplicada. Ele não afirma que a funcionalidade de produto correspondente existe, está conectada ou funciona.",
    "",
    "Decisões pendentes usam corte limpo: não admitem aliases, fallback, dupla escrita nem leitor de legado. Migrations publicadas e evidências históricas podem conservar o nome anterior porque registram o passado; elas não autorizam esse nome em objetos ativos ou documentação corrente.",
    "",
    "Caminhos históricos excluídos do gate de resíduos:",
    "",
    ...list(registry.policy?.historicalPaths).map((entry) => `- \`${entry}\``),
    "",
    "## Hipótese visual",
    "",
    "A imagem abaixo é uma **hipótese visual ainda não implementada** para testar o vocabulário em celular. Ela não prova que os nomes já foram migrados nem que a interface foi aprovada por pessoas usuárias.",
    "",
    "![Hipótese visual móvel do vocabulário da Autoria](screenshots/authoring/prototype-terminologia-v1.png)",
    "",
    "[Abrir a versão vetorial da hipótese](screenshots/authoring/prototype-terminologia-v1.svg).",
    "",
    "## Mapa atual → canônico",
    ""
  ];

  for (const family of list(registry.policy?.requiredFamilies)) {
    const terms = registry.terms.filter((term) => term.family === family);
    lines.push(
      `### ${familyLabels.get(family) || family}`,
      "",
      "| Termo encontrado | Interface | Domínio | Símbolo técnico-alvo | Decisão e etapa | Definição operacional | Base | Não usar como sinônimo |",
      "|---|---|---|---|---|---|---|---|"
    );
    for (const term of terms) {
      lines.push(`| ${codeValues(term.currentTerms)} | **${markdownCell(term.interfaceTerm)}** | **${markdownCell(term.domainTerm)}** | ${symbolValues(term)} | \`${term.decision}\`; ${termStage(term)} | ${markdownCell(term.definition)} | ${sourceValues(term.sources)} | ${codeValues(term.notSynonyms)} |`);
    }
    lines.push("");
  }

  lines.push(
    "## Fichas terminológicas didáticas",
    "",
    "As fichas explicam como aplicar cada decisão. O exemplo é situado no AraLearn; o risco registra a confusão que a escolha evita. Cada ficha registra candidatos realmente examinados ou justifica, com base no recorte disciplinar, por que nenhum nome próximo disputa o mesmo conceito.",
    ""
  );
  for (const family of list(registry.policy?.requiredFamilies)) {
    const terms = registry.terms.filter((term) => term.family === family);
    lines.push(`### ${familyLabels.get(family) || family}`, "");
    for (const term of terms) {
      lines.push(
        `#### ${markdownCell(term.interfaceTerm)} — \`${term.id}\``,
        "",
        `- **Equivalente em inglês:** ${markdownCell(term.englishEquivalent)}.`,
        `- **Termo de domínio:** ${markdownCell(term.domainTerm)}.`,
        `- **Símbolo técnico-alvo:** ${symbolValues(term)}.`,
        `- **Exemplo no AraLearn:** ${markdownCell(term.araLearnExample)}`,
        `- **Risco de ambiguidade:** ${markdownCell(term.ambiguityRisk)}`,
        term.alternativesAssessment === "compared"
          ? `- **Alternativas consideradas:** ${list(term.alternativesConsidered).map(markdownCell).join("; ")}.`
          : `- **Alternativas consideradas:** nenhum candidato plausível após exame — ${markdownCell(term.alternativesRationale)}`,
        `- **Impacto da migração:** ${markdownCell(term.migrationImpact)}`,
        ""
      );
    }
  }

  lines.push(
    "## Uso operacional",
    "",
    "1. Antes de criar UI, schema, RPC, ferramenta, evento ou métrica, procure o conceito neste registro.",
    "2. Se o conceito não existir, acrescente uma decisão com definição, camadas, fontes, issue de corte e termos não sinônimos.",
    "3. Se a decisão for diferida, registre `removeBy` e faça um único corte coordenado; não crie compatibilidade paralela.",
    "4. Quando a substituição terminar, marque-a como concluída e informe `forbiddenSymbols`; o audit falhará diante de qualquer resíduo corrente.",
    "5. Execute `npm run audit:terminology`. Para regenerar este documento, use `npm run audit:terminology -- --render`.",
    ""
  );
  return lines.join("\n");
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

function validIssue(reference, issueCatalog, label, findings) {
  if (typeof reference !== "string" || !/^#[1-9]\d*$/u.test(reference)) {
    findings.push(`${label}: referência de issue inválida (${reference ?? "ausente"}).`);
    return false;
  }
  if (!Object.hasOwn(issueCatalog, reference)) {
    findings.push(`${label}: issue não registrada em policy.issueCatalog (${reference}).`);
    return false;
  }
  return true;
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

function validateSource(source, label, issueCatalog, findings) {
  if (!isRecord(source)) {
    findings.push(`${label}: fonte inválida.`);
    return;
  }
  if (!sourceStatuses.has(source.status)) {
    findings.push(`${label}.status: estatuto inválido (${source.status ?? "ausente"}).`);
  }
  if (typeof source.ref !== "string" || !source.ref.trim()) {
    findings.push(`${label}.ref: referência vazia.`);
  } else if (source.ref.startsWith("#")) {
    validIssue(source.ref, issueCatalog, `${label}.ref`, findings);
  } else if (!source.ref.startsWith("https://")) {
    findings.push(`${label}.ref: use issue registrada ou URL HTTPS (${source.ref}).`);
  }
  if (Object.hasOwn(source, "supports")
      && (typeof source.supports !== "string" || source.supports.trim().length < 30)) {
    findings.push(`${label}.supports: delimite com precisão o que a fonte sustenta.`);
  }
}

function validateTerm(term, index, context) {
  const { findings, issueCatalog, ids, symbols, currentTerms } = context;
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
  for (const field of ["araLearnExample", "ambiguityRisk", "migrationImpact"]) {
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
  if (!cutoverStatuses.has(term.cutoverStatus)) {
    findings.push(`${label}.cutoverStatus: estado inválido (${term.cutoverStatus ?? "ausente"}).`);
  }
  if (Object.hasOwn(term, "implementationStatus")) {
    findings.push(`${label}.implementationStatus: use cutoverStatus; o campo descreve somente a decisão terminológica.`);
  }
  for (const [layerIndex, layer] of uniqueStrings(term.layers, `${label}.layers`, findings).entries()) {
    if (!layers.has(layer)) findings.push(`${label}.layers[${layerIndex}]: camada inválida (${layer}).`);
  }
  const sources = list(term.sources);
  if (sources.length === 0) findings.push(`${label}.sources: informe fonte e estatuto.`);
  sources.forEach((source, sourceIndex) => (
    validateSource(source, `${label}.sources[${sourceIndex}]`, issueCatalog, findings)
  ));
  validIssue(term.cutoverIssue, issueCatalog, `${label}.cutoverIssue`, findings);
  uniqueStrings(term.notSynonyms, `${label}.notSynonyms`, findings);

  if (term.cutoverStatus === "pendente") {
    validIssue(term.removeBy, issueCatalog, `${label}.removeBy`, findings);
    if (term.transitionPolicy !== "clean-cutover") {
      findings.push(`${label}.transitionPolicy: corte pendente exige clean-cutover.`);
    }
    if (!new Set(["substituir", "remover"]).has(term.decision)) {
      findings.push(`${label}: corte pendente deve substituir ou remover o termo atual.`);
    }
  } else if (Object.hasOwn(term, "removeBy") || Object.hasOwn(term, "transitionPolicy")) {
    findings.push(`${label}: removeBy/transitionPolicy só pertencem a corte pendente.`);
  }

  const replacementDecision = new Set(["substituir", "remover"]).has(term.decision);
  if (term.cutoverStatus === "sem-corte" && replacementDecision) {
    findings.push(`${label}: substituir/remover exige corte pendente ou concluído.`);
  }
  if (term.cutoverStatus !== "sem-corte" && !replacementDecision) {
    findings.push(`${label}: manter/restringir deve usar cutoverStatus sem-corte.`);
  }
  const requiresResidueGate = term.cutoverStatus === "concluido"
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
  if (policy.transitionPolicy !== "clean-cutover") {
    findings.push("policy.transitionPolicy: o corte deve ser clean-cutover.");
  }
  const issueCatalog = isRecord(policy.issueCatalog) ? policy.issueCatalog : {};
  for (const [issue, title] of Object.entries(issueCatalog)) {
    if (!/^#[1-9]\d*$/u.test(issue) || typeof title !== "string" || !title.trim()) {
      findings.push(`policy.issueCatalog: entrada inválida (${issue}).`);
    }
  }
  validIssue(policy.reviewIssue, issueCatalog, "policy.reviewIssue", findings);
  validIssue(policy.finalRemovalIssue, issueCatalog, "policy.finalRemovalIssue", findings);
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
    issueCatalog,
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
  const abolished = registry.terms.filter((term) => term.cutoverStatus === "concluido"
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

async function auditRenderedDocument({ repositoryRoot, registry, documentPath }) {
  const absoluteDocumentPath = absoluteInside(repositoryRoot, documentPath);
  if (!absoluteDocumentPath) return [`Documento gerado fora do repositório: ${documentPath}.`];
  let current;
  try {
    current = await readFile(absoluteDocumentPath, "utf8");
  } catch {
    return [`${documentPath}: documento derivado ausente; execute audit:terminology -- --render.`];
  }
  const expected = renderControlledVocabulary(registry);
  return current === expected
    ? []
    : [`${documentPath}: documento derivado desatualizado; execute audit:terminology -- --render.`];
}

export async function auditTerminology({
  repositoryRoot = defaultRepositoryRoot,
  registry = null,
  registryPath = defaultRegistryPath,
  documentPath = defaultDocumentPath,
  checkRenderedDocument = registry == null
} = {}) {
  const resolvedRegistry = registry ?? JSON.parse(await readFile(
    absoluteInside(repositoryRoot, registryPath),
    "utf8"
  ));
  const findings = validateTerminologyRegistry(resolvedRegistry);
  if (findings.length > 0) return findings;
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
      documentPath
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
  const findings = await auditTerminology({
    registry,
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
      renderControlledVocabulary(registry),
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
