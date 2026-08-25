import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  auditTerminology,
  renderControlledVocabulary,
  validateTerminologyRegistry
} from "../../scripts/auditTerminology.mjs";
import {
  buildReadableReferences,
  parseBibTeX
} from "../../scripts/buildReadableReferences.mjs";

function syntheticRegistry(termOverrides = {}) {
  return {
    contract: "aralearn.canonical-terminology.v1",
    purpose: "Registro sintético completo para provar as regras do auditor terminológico.",
    policy: {
      historicalPaths: ["supabase/migrations/"],
      requiredFamilies: ["synthetic-family"]
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
      decision: "restringir",
      status: "vigente",
      layers: ["domain"],
      sources: [{ status: "definicao-propria", ref: "docs/vocabulario-controlado.md" }],
      notSynonyms: ["conceito diferente"],
      ...termOverrides
    }]
  };
}

test("o registro corrente é completo e não contém resíduos concluídos", async () => {
  assert.deepEqual(await auditTerminology(), []);
});

test("fontes acadêmicas aparecem como citações legíveis derivadas da bibliografia", () => {
  const registry = syntheticRegistry({
    sources: [{ status: "evidencia-academica", ref: "https://doi.org/10.1000/source" }]
  });
  const bibliography = [{
    key: "fonte2024",
    fields: {
      author: "Fonte, Ana",
      year: "2024",
      doi: "10.1000/source"
    }
  }];
  const rendered = renderControlledVocabulary(registry, bibliography);
  assert.match(rendered, /\[Fonte \(2024\)\]\(referencias\.md#ref-fonte2024\)/u);
  assert.doesNotMatch(rendered, /\[evidência acadêmica\]/u);
  assert.match(rendered, /## Referências/u);
  assert.match(rendered, /- \[Fonte \(2024\)\]\(referencias\.md#ref-fonte2024\):/u);
});

test("fontes acadêmicas reconhecem variantes equivalentes de DOI e URL", () => {
  const registry = syntheticRegistry({
    sources: [
      { status: "evidencia-academica", ref: "HTTP://DX.DOI.ORG/10.1000/SOURCE/" },
      { status: "evidencia-academica", ref: "https://EXAMPLE.ORG" }
    ]
  });
  const bibliography = [
    { key: "doi2024", fields: { author: "Fonte, Ana", year: "2024", doi: "10.1000/source" } },
    { key: "url2025", fields: { author: "Outra, Bia", year: "2025", url: "https://example.org/" } }
  ];
  const rendered = renderControlledVocabulary(registry, bibliography);
  assert.match(rendered, /\[Fonte \(2024\)\]\(referencias\.md#ref-doi2024\)/u);
  assert.match(rendered, /\[Outra \(2025\)\]\(referencias\.md#ref-url2025\)/u);
});

test("auditoria rejeita fonte acadêmica não resolvida e identificador ambíguo", async (context) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "aralearn-terminology-bibliography-"));
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const findings = await auditTerminology({
    repositoryRoot,
    registry: syntheticRegistry({
      sources: [{ status: "evidencia-academica", ref: "https://doi.org/10.1000/ausente" }]
    }),
    bibliographyEntries: [
      { key: "fonte-a", fields: { author: "Fonte, Ana", year: "2024", doi: "10.1000/repetida" } },
      { key: "fonte-b", fields: { author: "Outra, Bia", year: "2025", doi: "HTTPS://DOI.ORG/10.1000/REPETIDA/" } }
    ],
    checkRenderedDocument: false
  });
  assert.ok(findings.some((finding) => finding.includes("identificador bibliográfico ambíguo")));
  assert.ok(findings.some((finding) => finding.includes("evidência acadêmica sem citação legível")));
});

test("ordem de geração atualiza rótulo e referência local até o mesmo ponto fixo", async (context) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "aralearn-documentation-references-"));
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(path.join(repositoryRoot, "docs"), { recursive: true });
  const registry = syntheticRegistry({
    sources: [{ status: "evidencia-academica", ref: "docs/referencias.md#ref-fonte2024" }]
  });
  const previousBibliography = `@article{fonte2024,
  author = {Antiga, Ana},
  title = {Fonte anterior},
  year = {2024},
  doi = {10.1000/source}
}\n`;
  const currentBibliography = `@article{fonte2024,
  author = {Nova, Bia},
  title = {Fonte atualizada},
  year = {2025},
  doi = {10.1000/source}
}\n`;
  const previousEntries = parseBibTeX(previousBibliography);
  await writeFile(path.join(repositoryRoot, "docs", "referencias.bib"), previousBibliography, "utf8");
  await writeFile(
    path.join(repositoryRoot, "docs", "vocabulario-controlado.md"),
    renderControlledVocabulary(registry, previousEntries),
    "utf8"
  );
  await writeFile(path.join(repositoryRoot, "docs", "referencias.bib"), currentBibliography, "utf8");
  const currentEntries = parseBibTeX(currentBibliography);
  const generate = async () => {
    await writeFile(
      path.join(repositoryRoot, "docs", "vocabulario-controlado.md"),
      renderControlledVocabulary(registry, currentEntries),
      "utf8"
    );
    buildReadableReferences({ root: repositoryRoot, guides: [] });
    return readFile(path.join(repositoryRoot, "docs", "vocabulario-controlado.md"), "utf8");
  };
  const first = await generate();
  const second = await generate();
  assert.equal(first, second);
  assert.equal(first, renderControlledVocabulary(registry, currentEntries));
  assert.match(first, /\[Nova \(2025\)\]\(referencias\.md#ref-fonte2024\)/u);
  assert.doesNotMatch(first, /Antiga \(2024\)/u);

  const packageConfig = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.match(
    packageConfig.scripts["docs:references"],
    /auditTerminology\.mjs --render && node \.\/scripts\/buildReadableReferences\.mjs/u
  );
});

test("o documento derivado aceita as quebras de linha do checkout Windows", async (context) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "aralearn-terminology-eol-"));
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(path.join(repositoryRoot, "docs"), { recursive: true });
  const registry = syntheticRegistry();
  await writeFile(
    path.join(repositoryRoot, "docs", "vocabulario-controlado.md"),
    renderControlledVocabulary(registry).replaceAll("\n", "\r\n"),
    "utf8"
  );
  assert.deepEqual(await auditTerminology({
    repositoryRoot,
    registry,
    checkRenderedDocument: true
  }), []);
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
    status: "concluido",
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
    status: "concluido",
    forbiddenSymbols: ["operation.*"]
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
    status: "concluido",
    forbiddenSymbols: ["operation.*"]
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
    status: "concluido",
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

test("uma substituição não pode permanecer como decisão vigente", () => {
  const registry = syntheticRegistry({
    decision: "substituir",
    status: "vigente"
  });
  const findings = validateTerminologyRegistry(registry);
  assert.ok(findings.includes(
    "terms[0]: substituir/remover exige decisão concluída."
  ));
});

test("a ficha exige exemplo, risco e avaliação de alternativas", () => {
  const registry = syntheticRegistry({
    araLearnExample: "",
    ambiguityRisk: "",
    alternativesAssessment: undefined,
    alternativesConsidered: undefined
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
