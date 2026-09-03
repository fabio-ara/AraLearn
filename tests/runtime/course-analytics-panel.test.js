import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  COURSE_AUTHORING_ANALYTICS_CONTRACT
} from "../../src/domain/courseAuthoringAnalytics.js";
import { createCourseAnalyticsPanel } from "../../src/ui/CourseAnalyticsPanel.js";

const COURSE_ID = "123e4567-e89b-42d3-a456-426614174000";
const MICRO_REF = "microsequence:fundamentos";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

class FakeRoot {
  constructor() {
    this.innerHTML = "";
    this.listeners = new Map();
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
}

function analyticsPage({
  revision = 7,
  selected = { kind: "course", ref: null, label: "Curso inteiro" },
  studyUnitCount = 2,
  manuallyRevisedStudyUnitCount = 2,
  missingData = ["Uma direção editorial não informou origem."]
} = {}) {
  const courseScope = { kind: "course", ref: null, label: "Curso inteiro" };
  const microScope = {
    kind: "didactic_microsequence",
    ref: MICRO_REF,
    label: "Microssequência · Fundamentos"
  };
  const units = Array.from({ length: studyUnitCount }, (_, index) => ({
    studyUnitRef: `study-unit:${index + 1}`,
    position: index + 1,
    title: index === 0 ? "O que é um servidor" : "Pedido e resposta",
    introducedCount: 1
  }));
  return {
    contract: COURSE_AUTHORING_ANALYTICS_CONTRACT,
    course: { id: COURSE_ID, revision, title: "Redes para iniciantes" },
    scope: { selected, options: [courseScope, microScope] },
    design: {
      studyUnitCount,
      parameters: [{
        parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
        label: "Novidades por unidade de estudo expositiva",
        valueKind: "integer",
        effectiveValues: [{ value: 1, origin: "research_condition", studyUnitCount }]
      }, {
        parameterId: "required_explanation_forms",
        label: "Formas de explicação requeridas",
        valueKind: "string_list",
        effectiveValues: [{ value: ["definition", "contrast"], origin: "automatic", studyUnitCount }]
      }, {
        parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement",
        label: "Práticas distintas por requisito",
        valueKind: "integer",
        effectiveValues: [{ value: 3, origin: "author", studyUnitCount }]
      }, {
        parameterId: "required_practice_variation_dimensions",
        label: "Dimensões de variação requeridas",
        valueKind: "string_list",
        effectiveValues: [{ value: ["context", "representation"], origin: "automatic", studyUnitCount }]
      }],
      editorialDirections: [{
        direction: "Títulos diretos e parágrafos breves.",
        origin: null,
        studyUnitCount
      }],
      analysisUnits: Array.from({ length: studyUnitCount }, (_, index) => ({
        position: index + 1,
        statement: index === 0
          ? "Servidor oferece um serviço em rede."
          : "Pedido e resposta organizam a comunicação.",
        introductionCount: 1
      })),
      introductionsByStudyUnit: units,
      explanationForms: [{ form: "definition", studyUnitCount, applicationCount: studyUnitCount }, {
        form: "contrast", studyUnitCount: 1, applicationCount: 1
      }],
      components: [{
        componentRef: "aralearn.resource.paragraph@1.0.0",
        studyUnitCount,
        instanceCount: studyUnitCount + 2
      }, {
        componentRef: "aralearn.resource.table@1.0.0",
        studyUnitCount: 1,
        instanceCount: 1
      }],
      practiceByRequirement: [{
        position: 1,
        statement: "Distinguir cliente e servidor em situações novas.",
        opportunityCount: 3
      }],
      practiceVariationDimensions: [{ dimension: "context", opportunityCount: 2 }, {
        dimension: "representation", opportunityCount: 1
      }],
      sourcesByRole: [{
        role: "factual_support",
        sourceCount: 2,
        anchorCount: 3,
        studyUnitCount
      }]
    },
    authorship: {
      observations: { createdCount: 5, openCount: 2, resolvedCount: 3 },
      explicitParameterOverrideCount: 1,
      manuallyRevisedStudyUnitCount,
      studyUnitsByOrigin: [{ origin: "gpt", createdCount: 2, lastRevisedCount: 1 }, {
        origin: "author", createdCount: 0, lastRevisedCount: 2
      }]
    },
    missingData,
    deepLink: null
  };
}

async function submitScope(root, index) {
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches: (selector) => selector === "[data-course-analytics-scope]",
      elements: { scope: { value: String(index) } }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
}

test("dados de autoria mostram somente desenho e autoria em uma leitura quantitativa estreita", async () => {
  const root = new FakeRoot();
  const queries = [];
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: { async loadCourseAuthoringAnalytics(_courseId, { query }) {
      queries.push(query);
      return analyticsPage();
    } }
  });

  await panel.open();

  assert.deepEqual(queries, [{ scope: { kind: "course", ref: null } }]);
  assert.match(root.innerHTML, /id="course-analytics-section-title">Dados de autoria<\/h2>/u);
  assert.match(root.innerHTML, /<label for="course-analytics-scope">Escopo<\/label>/u);
  assert.match(root.innerHTML, /aria-label="Aplicar escopo"/u);
  assert.match(root.innerHTML, /aria-label="Baixar dados de autoria"/u);
  assert.deepEqual([...root.innerHTML.matchAll(/<h3[^>]*>([^<]+)<\/h3>/gu)].map((match) => match[1]), [
    "Desenho", "Autoria"
  ]);
  assert.match(root.innerHTML, /aria-label="Resumo do desenho"/u);
  assert.match(root.innerHTML, /Unidades de estudo<small>Unidades no escopo\.<\/small><\/dt><dd>2<\/dd>/u);
  assert.match(root.innerHTML, /Unidades de análise<small>Novidades semânticas inventariadas\.<\/small><\/dt><dd>2<\/dd>/u);
  assert.match(root.innerHTML, /Prática<small>Oportunidades produzidas\.<\/small><\/dt><dd>3<\/dd>/u);
  assert.match(root.innerHTML, /Observações abertas<small>Pendências humanas atuais\.<\/small><\/dt><dd>2<\/dd>/u);
  assert.match(root.innerHTML, /Parâmetros definidos[\s\S]+<dd>1<\/dd>/u);
  assert.match(root.innerHTML, /Unidades de estudo revisadas manualmente[\s\S]+<dd>2<\/dd>/u);
  assert.doesNotMatch(
    root.innerHTML,
    /StudyUnits?|AnalysisUnits?|analysisUnits|evidenceRequirements|courseRevision|componentRef|studyUnitRef|Representation/u
  );
  assert.doesNotMatch(root.innerHTML, /Reparos aceitos|Reparos rejeitados/u);
  assert.equal((root.innerHTML.match(/<table /gu) || []).length, 4);
  assert.equal((root.innerHTML.match(/<details /gu) || []).length, 4);
  assert.doesNotMatch(root.innerHTML, new RegExp(MICRO_REF, "u"));
  assert.doesNotMatch(root.innerHTML, /Fatos do recorte|timeline|dashboard|sidebar|role="dialog"/iu);
  panel.destroy();
});

test("tabelas simples preservam os números do desenho e intervenções explícitas", async () => {
  const root = new FakeRoot();
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: { async loadCourseAuthoringAnalytics() { return analyticsPage(); } }
  });

  await panel.open();

  for (const table of [
    "Configuração aplicada", "Conteúdo e representações", "Prática e fontes",
    "Intervenções por origem"
  ]) assert.match(root.innerHTML, new RegExp(`table aria-label="${table}"`, "u"));
  assert.match(root.innerHTML, /Novidades por unidade de estudo expositiva<\/th><td>1 · 2 unidades de estudo · condição de pesquisa/u);
  assert.match(root.innerHTML, /Formas de explicação requeridas<\/th><td>Definição, contraste · 2 unidades de estudo · calibração automática/u);
  assert.match(root.innerHTML, /Dimensões de variação requeridas<\/th><td>Contexto, representação · 2 unidades de estudo · calibração automática/u);
  assert.match(root.innerHTML, /Direção editorial<\/th><td>Títulos diretos e parágrafos breves\./u);
  assert.match(root.innerHTML, /Unidade de análise 1<\/th><td>Servidor oferece um serviço em rede\. · 1 introdução/u);
  assert.match(root.innerHTML, /Unidade de estudo 2 · Pedido e resposta<\/th><td>1 novidade introduzida/u);
  assert.match(root.innerHTML, /Forma · contraste<\/th><td>1 unidade de estudo · 1 aplicação/u);
  assert.match(root.innerHTML, /Componente · tabela<\/th><td>1 unidade de estudo · 1 uso/u);
  assert.match(root.innerHTML, /Prática 1<\/th><td>Distinguir cliente e servidor em situações novas\. · 3 oportunidades/u);
  assert.match(root.innerHTML, /Fonte · sustentação factual<\/th><td>2 fontes · 3 âncoras · 2 unidades de estudo/u);
  assert.match(root.innerHTML, /Variação · representação<\/th><td>1 oportunidade/u);
  assert.match(root.innerHTML, /Observações criadas<\/th><td>5 observações/u);
  assert.match(root.innerHTML, /Observações resolvidas<\/th><td>3 observações/u);
  assert.match(root.innerHTML, /GPT<\/th><td>2 unidades de estudo criadas · 1 unidade de estudo com última revisão/u);
  assert.match(root.innerHTML, /Pessoa autora<\/th><td>0 unidades de estudo criadas · 2 unidades de estudo com última revisão/u);
  assert.match(root.innerHTML, /<strong>Dados ausentes<\/strong>/u);
  assert.match(root.innerHTML, /Uma direção editorial não informou origem\./u);
  assert.doesNotMatch(
    root.innerHTML,
    /provider_assistance|parameterId|componentRef|studyUnitRef|aralearn\.resource/iu
  );
});

test("download JSON usa o mesmo snapshot v2 e os mesmos números da interface", async () => {
  const root = new FakeRoot();
  const downloads = [];
  const expected = analyticsPage();
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    download: (file) => { downloads.push(file); return file; },
    controller: { async loadCourseAuthoringAnalytics() { return expected; } }
  });

  await panel.open();
  panel.export();

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, "aralearn-analytics-snapshot-r7.json");
  assert.equal(downloads[0].type, "application/json;charset=utf-8");
  const snapshot = JSON.parse(downloads[0].content);
  assert.deepEqual(snapshot, expected);
  assert.equal(snapshot.contract, COURSE_AUTHORING_ANALYTICS_CONTRACT);
  assert.equal(snapshot.design.studyUnitCount, 2);
  assert.equal(snapshot.design.analysisUnits.length, 2);
  assert.equal(snapshot.design.practiceByRequirement[0].opportunityCount, 3);
  assert.equal(snapshot.authorship.observations.openCount, 2);
  assert.equal(snapshot.authorship.explicitParameterOverrideCount, 1);
  assert.equal(snapshot.authorship.manuallyRevisedStudyUnitCount, 2);
  assert.doesNotMatch(downloads[0].content, /"facts"|"runs"|"steps"|"duration"|"hash"|"payload"/iu);
  for (const value of [2, 3, 1]) {
    assert.match(root.innerHTML, new RegExp(`<dd>${value}</dd>`, "u"));
  }
  assert.match(root.innerHTML, /Unidades de estudo revisadas manualmente[\s\S]+<dd>2<\/dd>/u);
});

test("filtro relê um escopo humano sem expor sua referência no DOM", async () => {
  const root = new FakeRoot();
  const calls = [];
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: { async loadCourseAuthoringAnalytics(_courseId, request) {
      calls.push(request);
      const selected = request.query.scope.kind === "course"
        ? { kind: "course", ref: null, label: "Curso inteiro" }
        : {
          kind: "didactic_microsequence",
          ref: MICRO_REF,
          label: "Microssequência · Fundamentos"
        };
      return analyticsPage({ selected, studyUnitCount: selected.kind === "course" ? 2 : 1 });
    } }
  });

  await panel.open();
  await submitScope(root, 1);

  assert.deepEqual(calls.map(({ query }) => query), [{
    scope: { kind: "course", ref: null }
  }, {
    scope: { kind: "didactic_microsequence", ref: MICRO_REF }
  }]);
  assert.match(root.innerHTML, /<option value="1" selected>Microssequência · Fundamentos<\/option>/u);
  assert.match(root.innerHTML, /Unidades de estudo<small>Unidades no escopo\.<\/small><\/dt><dd>1<\/dd>/u);
  assert.doesNotMatch(root.innerHTML, new RegExp(MICRO_REF, "u"));

  await submitScope(root, 1);
  assert.equal(calls.length, 2);
});

test("refresh adota a revisão relida e dados ausentes continuam explícitos", async () => {
  const root = new FakeRoot();
  const revisions = [];
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: { async loadCourseAuthoringAnalytics(_courseId, { expectedCourseRevision }) {
      revisions.push(expectedCourseRevision);
      return analyticsPage({ revision: expectedCourseRevision });
    } }
  });

  await panel.open();
  await panel.refresh(8);

  assert.deepEqual(revisions, [7, 8]);
  assert.match(root.innerHTML, /aria-label="Dados ausentes"/u);
  assert.doesNotMatch(root.innerHTML, /Revisão 8|courseRevision|generatedAt/iu);
  await assert.rejects(panel.refresh(0), /revisão do curso para atualizar os dados de autoria é inválida/u);
});

test("falha transitória oferece nova tentativa sem expor a infraestrutura", async () => {
  const root = new FakeRoot();
  let calls = 0;
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: { async loadCourseAuthoringAnalytics() {
      calls += 1;
      if (calls === 1) throw new Error("O serviço não respondeu a tempo.");
      return analyticsPage();
    } }
  });

  await panel.open();
  assert.match(root.innerHTML, /O serviço não respondeu a tempo\./u);
  assert.match(root.innerHTML, /data-course-analytics-action="reload"/u);
  assert.match(root.innerHTML, /aria-label="Tentar novamente"/u);
  assert.doesNotMatch(root.innerHTML, /Supabase/iu);

  root.listeners.get("click")({
    target: {
      closest: (selector) => selector === "[data-course-analytics-action]"
        ? { dataset: { courseAnalyticsAction: "reload" } }
        : null
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.match(root.innerHTML, /Resumo do desenho/u);
  assert.doesNotMatch(root.innerHTML, /Tentar novamente/u);
});

test("nova tentativa preserva o escopo que falhou e não se oferece para erro de exportação", async () => {
  const root = new FakeRoot();
  const queries = [];
  let calls = 0;
  const panel = createCourseAnalyticsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    download() { throw new Error("O arquivo não pôde ser salvo."); },
    controller: { async loadCourseAuthoringAnalytics(_courseId, { query }) {
      calls += 1;
      queries.push(query);
      if (calls === 2) throw new Error("O serviço não respondeu a tempo.");
      const selected = query.scope.kind === "course"
        ? { kind: "course", ref: null, label: "Curso inteiro" }
        : {
          kind: "didactic_microsequence",
          ref: MICRO_REF,
          label: "Microssequência · Fundamentos"
        };
      return analyticsPage({ selected });
    } }
  });

  await panel.open();
  await submitScope(root, 1);
  assert.match(root.innerHTML, /Tentar novamente/u);
  root.listeners.get("click")({
    target: {
      closest: (selector) => selector === "[data-course-analytics-action]"
        ? { dataset: { courseAnalyticsAction: "reload" } }
        : null
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(queries.map(({ scope }) => scope), [
    { kind: "course", ref: null },
    { kind: "didactic_microsequence", ref: MICRO_REF },
    { kind: "didactic_microsequence", ref: MICRO_REF }
  ]);
  assert.match(root.innerHTML, /<option value="1" selected>Microssequência · Fundamentos/u);

  panel.export();
  assert.match(root.innerHTML, /O arquivo não pôde ser salvo\./u);
  assert.doesNotMatch(root.innerHTML, /data-course-analytics-action="reload"/u);
});

test("CSS e fonte do painel não restauram dashboard, segunda rolagem ou métricas técnicas", () => {
  const panelSource = fs.readFileSync(path.join(
    repositoryRoot, "src", "ui", "CourseAnalyticsPanel.js"
  ), "utf8");
  const css = fs.readFileSync(path.join(repositoryRoot, "public", "course-authoring.css"), "utf8");
  const analyticsCss = css.slice(
    css.indexOf(".course-analytics-host,"),
    css.indexOf("/* Parâmetros conserva quatro decisões pedagógicas")
  );

  assert.match(analyticsCss, /\.course-analytics\s*\{[\s\S]+max-width: 720px/u);
  assert.match(analyticsCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(analyticsCss, /@media \(min-width: 620px\)[\s\S]+repeat\(4, minmax\(0, 1fr\)\)/u);
  assert.doesNotMatch(analyticsCss, /overflow-y|position:\s*(?:fixed|sticky)|course-analytics-(?:sheet|facts|chart|bar)/u);
  assert.doesNotMatch(
    panelSource,
    /\b(?:run|runs|step|steps|retry|duration|hash|payload|timeline|score|percentage)\b/iu
  );
  assert.doesNotMatch(panelSource, /serializeCourseAuthoringAnalyticsCsv|text\/csv|open-fact/u);
});
