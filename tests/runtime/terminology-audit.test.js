import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  auditTerminology,
  validateTerminologyRegistry
} from "../../scripts/auditTerminology.mjs";

function syntheticRegistry(termOverrides = {}) {
  return {
    contract: "aralearn.canonical-terminology.v1",
    purpose: "Registro sintético completo para provar as regras do auditor terminológico.",
    policy: {
      reviewIssue: "#116",
      finalRemovalIssue: "#129",
      transitionPolicy: "clean-cutover",
      historicalPaths: ["supabase/migrations/"],
      requiredFamilies: ["synthetic-family"],
      issueCatalog: {
        "#116": "Vocabulário canônico",
        "#129": "Corte integral"
      }
    },
    terms: [{
      id: "synthetic-term",
      family: "synthetic-family",
      currentTerms: ["termo anterior"],
      productTerm: "Termo canônico",
      interfaceTerm: "Termo canônico",
      domainTerm: "Termo canônico",
      englishEquivalent: "canonical term",
      technicalSymbol: "canonical_symbol",
      definition: "Conceito sintético com definição operacional suficiente para o teste focal.",
      araLearnExample: "No AraLearn, o termo sintético identifica uma instância concreta criada para este teste.",
      ambiguityRisk: "Sem a definição, o termo sintético pode ser confundido com outro conceito e invalidar a decisão.",
      alternativesAssessment: "compared",
      alternativesConsidered: ["Usar “conceito diferente”: rejeitado porque designa outra coisa."],
      migrationImpact: "Não há corte programado; novas superfícies devem aplicar a definição sem inferir disponibilidade.",
      decision: "restringir",
      cutoverStatus: "sem-corte",
      layers: ["domain"],
      sources: [{ status: "definicao-propria", ref: "#116" }],
      cutoverIssue: "#116",
      notSynonyms: ["conceito diferente"],
      ...termOverrides
    }]
  };
}

test("o registro corrente é completo e não contém resíduos concluídos", async () => {
  assert.deepEqual(await auditTerminology(), []);
});

test("o audit rejeita símbolo abolido fora de migration ou evidência histórica", async (context) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "aralearn-terminology-"));
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(path.join(repositoryRoot, "src"), { recursive: true });
  await mkdir(path.join(repositoryRoot, "docs"), { recursive: true });
  await writeFile(
    path.join(repositoryRoot, "src", "current.js"),
    "export const LegacyTerm = true;\n",
    "utf8"
  );
  await writeFile(
    path.join(repositoryRoot, "docs", "vocabulario-controlado.md"),
    "| termo anterior | LegacyTerm |\n",
    "utf8"
  );
  const registry = syntheticRegistry({
    decision: "remover",
    technicalSymbol: "current_symbol",
    cutoverStatus: "concluido",
    migrationImpact: "Corte terminológico concluído; o gate rejeita resíduos fora das evidências históricas.",
    forbiddenSymbols: ["LegacyTerm"]
  });
  const findings = await auditTerminology({
    repositoryRoot,
    registry,
    checkRenderedDocument: false
  });
  assert.ok(findings.includes(
    "src/current.js: contém símbolo abolido \"LegacyTerm\" (synthetic-term)."
  ));
  assert.equal(findings.some((finding) => finding.startsWith(
    "docs/vocabulario-controlado.md: contém símbolo abolido"
  )), false);
});

test("o padrão operation.* não bloqueia o namespace canônico task_operation", async (context) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "aralearn-terminology-boundary-"));
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(path.join(repositoryRoot, "src"), { recursive: true });
  await writeFile(
    path.join(repositoryRoot, "src", "current.js"),
    "export const id = 'task_operation.compare';\n",
    "utf8"
  );
  const registry = syntheticRegistry({
    decision: "substituir",
    cutoverStatus: "concluido",
    forbiddenSymbols: ["operation.*"],
    migrationImpact: "Corte terminológico concluído; o namespace canônico task_operation permanece permitido."
  });
  assert.deepEqual(await auditTerminology({
    repositoryRoot,
    registry,
    checkRenderedDocument: false
  }), []);
});

test("o padrão operation.* rejeita identificador antigo em string", async (context) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "aralearn-terminology-namespace-"));
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(path.join(repositoryRoot, "src"), { recursive: true });
  await writeFile(
    path.join(repositoryRoot, "src", "legacy.js"),
    "export const id = '" + "operation" + ".compare';\n",
    "utf8"
  );
  const registry = syntheticRegistry({
    decision: "substituir",
    cutoverStatus: "concluido",
    forbiddenSymbols: ["operation.*"],
    migrationImpact: "Corte terminológico concluído; identificadores da taxonomia antiga são proibidos."
  });
  const findings = await auditTerminology({
    repositoryRoot,
    registry,
    checkRenderedDocument: false
  });
  assert.ok(findings.includes(
    "src/legacy.js: contém símbolo abolido \"operation.*\" (synthetic-term)."
  ));
});

test("o gate inspeciona fontes SVG e Kotlin", async (context) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "aralearn-terminology-extensions-"));
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(path.join(repositoryRoot, "docs"), { recursive: true });
  await mkdir(path.join(repositoryRoot, "android"), { recursive: true });
  await writeFile(
    path.join(repositoryRoot, "docs", "current.svg"),
    "<svg><text>LegacyTerm</text></svg>\n",
    "utf8"
  );
  await writeFile(
    path.join(repositoryRoot, "android", "Current.kt"),
    "const val label = \"LegacyTerm\"\n",
    "utf8"
  );
  const registry = syntheticRegistry({
    decision: "remover",
    technicalSymbol: "current_symbol",
    cutoverStatus: "concluido",
    migrationImpact: "Corte concluído; o gate deve abranger fontes vetoriais e Kotlin.",
    forbiddenSymbols: ["LegacyTerm"]
  });
  const findings = await auditTerminology({
    repositoryRoot,
    registry,
    checkRenderedDocument: false
  });
  assert.ok(findings.includes(
    "docs/current.svg: contém símbolo abolido \"LegacyTerm\" (synthetic-term)."
  ));
  assert.ok(findings.includes(
    "android/Current.kt: contém símbolo abolido \"LegacyTerm\" (synthetic-term)."
  ));
});

test("um corte pendente sem etapa de remoção é inválido", () => {
  const registry = syntheticRegistry({
    decision: "substituir",
    cutoverStatus: "pendente",
    migrationImpact: "Corte limpo ainda pendente, com renomeação coordenada e sem compatibilidade de legado.",
    transitionPolicy: "clean-cutover"
  });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "terms[0].removeBy: referência de issue inválida (ausente)."
  ));
});

test("a ficha exige exemplo, risco, avaliação de alternativas e impacto de migração", () => {
  const registry = syntheticRegistry({
    araLearnExample: "",
    ambiguityRisk: "",
    alternativesAssessment: undefined,
    alternativesConsidered: undefined,
    migrationImpact: ""
  });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "terms[0].araLearnExample: explicação ausente ou insuficiente."
  ));
  assert.ok(findings.includes(
    "terms[0].alternativesAssessment: estado inválido (ausente)."
  ));
});

test("a ficha não pode encerrar revisão sem examinar alternativas", () => {
  const registry = syntheticRegistry({
    alternativesAssessment: "not-compared",
    alternativesConsidered: undefined
  });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "terms[0].alternativesAssessment: estado inválido (not-compared)."
  ));
});

test("a ficha sem candidato plausível exige justificativa e não inventa opções", () => {
  const registry = syntheticRegistry({
    alternativesAssessment: "no-plausible-candidate",
    alternativesRationale: "O termo disciplinar já individua o conceito; os nomes próximos pertencem a categorias diferentes."
  });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "terms[0].alternativesConsidered: não invente candidatos quando alternativesAssessment é no-plausible-candidate."
  ));
});

test("a ficha aceita ausência examinada de candidato com justificativa específica", () => {
  const registry = syntheticRegistry({
    alternativesAssessment: "no-plausible-candidate",
    alternativesConsidered: undefined,
    alternativesRationale: "O termo disciplinar já individua o conceito; os nomes próximos pertencem a categorias diferentes."
  });
  assert.deepEqual(validateTerminologyRegistry(registry), []);
});

test("a ficha sem candidato plausível não aceita justificativa ausente", () => {
  const registry = syntheticRegistry({
    alternativesAssessment: "no-plausible-candidate",
    alternativesConsidered: undefined
  });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "terms[0].alternativesRationale: justifique especificamente por que não há candidato plausível."
  ));
});

test("justificativas sem candidato não podem ser duplicadas entre fichas", () => {
  const registry = syntheticRegistry({
    alternativesAssessment: "no-plausible-candidate",
    alternativesConsidered: undefined,
    alternativesRationale: "O termo disciplinar já individua o conceito; os nomes próximos pertencem a categorias diferentes."
  });
  registry.terms.push({
    ...structuredClone(registry.terms[0]),
    id: "second-synthetic-term",
    currentTerms: ["segundo termo anterior"],
    productTerm: "Segundo termo canônico",
    interfaceTerm: "Segundo termo canônico",
    domainTerm: "Segundo termo canônico",
    technicalSymbol: "second_canonical_symbol"
  });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "terms[1].alternativesRationale: justificativa duplicada com synthetic-term."
  ));
});

test("a ficha rejeita alternativa boilerplate", () => {
  const registry = syntheticRegistry({
    alternativesConsidered: [
      "Manter “termo anterior”: rejeitado ou restringido porque o nome atual não explicita a definição operacional."
    ]
  });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "terms[0].alternativesConsidered[0]: justifique a alternativa específica; boilerplate é proibido."
  ));
});

test("a ficha delimita o que uma fonte sustenta quando declara esse escopo", () => {
  const registry = syntheticRegistry({
    sources: [{ status: "evidencia-academica", ref: "https://example.org/source", supports: "Distinção." }]
  });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "terms[0].sources[0].supports: delimite com precisão o que a fonte sustenta."
  ));
});

test("símbolo atual não pode se apresentar como símbolo-alvo", () => {
  const registry = syntheticRegistry({ currentSymbols: ["canonical_symbol"] });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "terms[0].currentSymbols[0]: símbolo atual deve diferir do símbolo-alvo."
  ));
});

test("o registro não pode prescrever alias ou fallback de legado", () => {
  const registry = syntheticRegistry({ aliases: ["termo anterior"] });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "registry.terms[0].aliases: aliases e fallbacks de legado são proibidos."
  ));
});
