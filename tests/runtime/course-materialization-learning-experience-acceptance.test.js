import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  materializeHumanCoursePart
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanMaterialization.js";
import {
  validateCourseEntityContent
} from "../../supabase/functions/_shared/aralearn/runtime/domain/courseEntities.js";
import {
  readPackageStudyUnitText,
  renderPackageStudyUnitArticle,
  renderPackageStudyUnitBlocksWithDock
} from "../../src/render/renderPackageStudyUnit.js";

const PRINCIPAL = {
  actorId: "40000000-0000-4000-8000-000000000101",
  scopes: ["authoring:read", "authoring:write"]
};

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

const ethernet = fixture("ethernet-switch-materialization.v1.json");
const beginner = fixture("beginner-concept-chain-materialization.v1.json");

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/gu, " ")
    .trim();
}

function planForFixture(value) {
  const hasEstablishedKnowledge = value.repertoire.some((idea) => idea.introducedAt);
  const prerequisiteMicrosequenceId = "micro-prerequisite";
  const microsequences = hasEstablishedKnowledge
    ? [{
        id: prerequisiteMicrosequenceId,
        position: 0,
        title: "Conhecimentos estabelecidos antes deste lote"
      }, {
        id: value.part.microsequence.id,
        position: 1,
        title: value.part.microsequence.title
      }]
    : [{
        id: value.part.microsequence.id,
        position: 0,
        title: value.part.microsequence.title
      }];
  return {
    contract: "aralearn.course-instructional-plan.v3",
    courseRevision: value.course.revision,
    plan: {
      version: 3,
      title: value.course.title,
      curriculum: {
        modules: [{
          id: "module-fixture",
          position: 0,
          title: value.part.title,
          lessons: [{
            id: "lesson-fixture",
            position: 0,
            title: value.part.microsequence.title,
            microsequences
          }]
        }]
      },
      curriculumScopeItems: [{
        id: "50000000-0000-4000-8000-000000000101",
        position: 0,
        statement: value.part.title,
        state: "planned",
        curriculumTargets: [{
          moduleId: "module-fixture",
          lessonId: "lesson-fixture",
          didacticMicrosequenceIds: [value.part.microsequence.id]
        }],
        developedIn: []
      }],
      instructionalAnalysisUnits: value.repertoire.map((idea, position) => ({
        id: idea.id,
        position,
        statement: idea.name,
        description: idea.description,
        version: 1,
        introducedAt: idea.introducedAt ? {
          ...idea.introducedAt,
          didacticMicrosequenceId: idea.introducedAt.didacticMicrosequenceId ??
            prerequisiteMicrosequenceId
        } : null,
        usedBy: [],
        revisitedBy: []
      })),
      evidenceRequirements: [],
      parts: [{
        id: value.part.id,
        position: value.part.position,
        title: value.part.title,
        version: value.part.version,
        microsequences: [{
          id: value.part.microsequence.id,
          productionPosition: value.part.microsequence.position,
          title: value.part.microsequence.title
        }]
      }]
    }
  };
}

function adapterForFixture(value) {
  const calls = [];
  let revision = value.course.revision;
  const plan = planForFixture(value);
  return {
    calls,
    async listCourses() {
      return {
        items: [{ courseId: value.course.id, title: value.course.title }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourse() {
      return { courseId: value.course.id, title: value.course.title, revision };
    },
    async getCourseInstructionalPlan() {
      return structuredClone(plan);
    },
    async getCourseDesign() {
      return {
        targetPlanItems: {
          instructionalAnalysisUnitIds: value.repertoire.map(({ id }) => id),
          evidenceRequirementIds: []
        },
        parameters: [
          ["new_analysis_unit_ceiling_per_expository_study_unit", value.acceptance.newIdeaCeiling],
          ["required_explanation_forms", ["plain_definition"]],
          ["minimum_distinct_practice_opportunities_per_evidence_requirement", 1],
          ["required_practice_variation_dimensions", []],
          ["authoring_chat_response_word_target", 90],
          ["study_unit_content_word_target", 180]
        ].map(([parameterId, parameterValue]) => ({
          parameterId,
          effectiveAssignment: {
            value: parameterValue,
            origin: "author",
            sourceScope: {
              kind: "didactic_microsequence",
              ref: value.part.microsequence.id
            }
          }
        })),
        guidance: { effectiveAssignments: [] },
        componentPolicy: {
          effectiveAssignment: {
            policy: {
              catalogVersion: "fixture",
              availability: "all",
              allowedRefs: [],
              excludedRefs: [],
              preferredRefs: []
            },
            origin: "system_default",
            sourceScope: null
          }
        }
      };
    },
    async getCourseSources() {
      return { items: [], nextCursor: null };
    },
    async listCourseStudyUnits() {
      return { items: [], hasMore: false, nextCursor: null };
    },
    async materializeCourseAuthoringPart(request) {
      calls.push(structuredClone(request));
      revision += 1;
      return {
        contract: "aralearn.course-part-materialization.v1",
        courseId: value.course.id,
        courseRevision: revision,
        authoringPartId: value.part.id,
        changed: true,
        studyUnitCount: request.units.length,
        idempotent: false,
        deepLink: `#/authoring/courses/${value.course.id}?section=content`
      };
    }
  };
}

function studyUnitEnvelope(unit, index, id = `fixture-study-unit-${index + 1}`) {
  return {
    ...structuredClone(unit.conteudo ?? unit.content),
    id: unit.studyUnitId ?? id,
    position: unit.posicao ?? unit.position ?? index + 1
  };
}

function validateAndRender(units) {
  return units.map((unit, index) => {
    const studyUnit = studyUnitEnvelope(unit, index);
    const validation = validateCourseEntityContent("study_unit", studyUnit);
    assert.equal(
      validation.valid,
      true,
      `Unidade ${index + 1} inválida: ${JSON.stringify(validation.errors)}`
    );
    const normalized = validation.normalized;
    const blocks = renderPackageStudyUnitBlocksWithDock(normalized, {
      revealPracticeAnswers: true,
      blockKeyPrefix: `acceptance:${normalized.id}`
    });
    const articleHtml = renderPackageStudyUnitArticle(normalized, {
      revealPracticeAnswers: true
    });
    assert.match(articleHtml, /<article class="card card-package"/u);
    assert.ok(blocks.bodyHtml.length > 0, `Unidade ${index + 1} sem conteúdo renderizado.`);
    return {
      studyUnit: normalized,
      contentText: readPackageStudyUnitText(normalized),
      text: `${normalized.title} ${readPackageStudyUnitText(normalized)}`,
      html: `${articleHtml}${blocks.dockHtml}`,
      application: structuredClone(unit.designApplication ?? unit.aplicacaoPedagogica)
    };
  });
}

async function materializeFixture(value) {
  const adapter = adapterForFixture(value);
  const units = structuredClone(value.units);
  for (const unit of units) unit.aplicacaoPedagogica.cobertura = [];
  units.at(-1).aplicacaoPedagogica.cobertura = [value.part.title];
  await materializeHumanCoursePart({
    adapter,
    principal: PRINCIPAL,
    course: value.course.title,
    part: value.part.position + 1,
    units
  });
  assert.equal(adapter.calls.length, 1);
  const committed = adapter.calls[0].units;
  assert.deepEqual(
    committed.filter(({ designApplication }) =>
      designApplication.curriculumScopeItemIds.length > 0).map(({ designApplication }) =>
      designApplication.curriculumScopeItemIds),
    [["50000000-0000-4000-8000-000000000101"]]
  );
  return committed;
}

function ideaMaps(value) {
  return {
    idByName: new Map(value.repertoire.map(({ id, name }) => [name, id])),
    nameById: new Map(value.repertoire.map(({ id, name }) => [id, name]))
  };
}

function accumulatedRepertoire(value, committedUnits) {
  const { nameById } = ideaMaps(value);
  const state = new Map(value.repertoire.map((idea) => [idea.name, {
    id: idea.id,
    introducedAt: idea.introducedAt ?? null,
    usedBy: [],
    revisitedBy: []
  }]));
  for (const unit of committedUnits) {
    const application = unit.designApplication;
    const introduced = new Set(application.introducedInstructionalAnalysisUnitIds);
    for (const id of introduced) {
      state.get(nameById.get(id)).introducedAt = {
        studyUnitId: unit.studyUnitId,
        title: unit.content.title
      };
    }
    for (const id of application.usedInstructionalAnalysisUnitIds) {
      state.get(nameById.get(id)).usedBy.push({
        studyUnitId: unit.studyUnitId,
        title: unit.content.title
      });
    }
    for (const explanation of application.explanationApplications) {
      if (introduced.has(explanation.instructionalAnalysisUnitId)) continue;
      state.get(nameById.get(explanation.instructionalAnalysisUnitId)).revisitedBy.push({
        studyUnitId: unit.studyUnitId,
        title: unit.content.title
      });
    }
  }
  return state;
}

function rawIdeas(unit, key) {
  return Array.isArray(unit.aplicacaoPedagogica?.[key])
    ? unit.aplicacaoPedagogica[key]
    : [];
}

function inspectBeginnerExperience(value, candidateUnits, {
  repertoireNames = value.repertoire.map(({ name }) => name)
} = {}) {
  const rendered = validateAndRender(candidateUnits);
  const ordered = candidateUnits
    .map((unit, index) => ({ unit, rendered: rendered[index] }))
    .sort((left, right) => left.unit.posicao - right.unit.posicao);
  const violations = [];
  const introducedAt = new Map();
  const established = new Set(value.repertoire
    .filter(({ status }) => status === "established")
    .map(({ name }) => name));

  for (const { unit } of ordered) {
    const introduced = rawIdeas(unit, "ideiasIntroduzidas");
    if (unit.conteudo.role === "theory" && introduced.length > value.acceptance.newIdeaCeiling) {
      violations.push("card expositivo denso");
    }
    for (const idea of rawIdeas(unit, "ideiasUtilizadas")) {
      if (!established.has(idea)) violations.push(`uso antes de estabelecer: ${idea}`);
    }
    for (const explanation of unit.aplicacaoPedagogica.explicacoes) {
      if (!established.has(explanation.ideia) && !introduced.includes(explanation.ideia)) {
        violations.push(`retomada antes de estabelecer: ${explanation.ideia}`);
      }
    }
    for (const idea of introduced) {
      if (established.has(idea)) violations.push(`introdução repetida: ${idea}`);
      established.add(idea);
      introducedAt.set(idea, unit.posicao);
    }
  }

  let previousPosition = -Infinity;
  for (const idea of value.acceptance.dependencyOrder) {
    const position = introducedAt.get(idea);
    if (position == null) {
      violations.push(`elo não estabelecido: ${idea}`);
      continue;
    }
    if (position <= previousPosition) violations.push(`dependência fora de ordem: ${idea}`);
    previousPosition = position;
  }

  for (const [idea, evidence] of Object.entries(value.acceptance.explanationEvidence)) {
    const introduction = ordered.find(({ unit }) =>
      rawIdeas(unit, "ideiasIntroduzidas").includes(idea));
    const text = normalizedText(introduction?.rendered.contentText);
    if (!introduction || evidence.some((term) => !text.includes(normalizedText(term)))) {
      violations.push(`mera menção sem explicação: ${idea}`);
    }
  }

  const application = value.acceptance.applicationMustBePracticed;
  const applicationIntroduction = introducedAt.get(application) ?? Infinity;
  if (!ordered.some(({ unit }) => unit.posicao > applicationIntroduction &&
      unit.conteudo.role === "practice" &&
      rawIdeas(unit, "ideiasUtilizadas").includes(application) &&
      unit.conteudo.response !== null)) {
    violations.push(`aplicação sem prática: ${application}`);
  }

  const completeText = normalizedText(rendered.map(({ text }) => text).join(" "));
  for (const term of value.acceptance.unestablishedTechnicalTerms) {
    if (completeText.includes(normalizedText(term)) && !repertoireNames.includes(term)) {
      violations.push(`conhecimento técnico oculto: ${term}`);
    }
  }

  const fragments = value.acceptance.coherentFusion.fragmentsThatMustNotBecomeIdeas;
  if (fragments.some((fragment) => repertoireNames.includes(fragment))) {
    violations.push("atomização excessiva de uma relação coerente");
  }
  return { rendered, violations };
}

function withPositions(units) {
  return units.map((unit, index) => ({ ...structuredClone(unit), posicao: index + 1 }));
}

test("switch Ethernet materializa e renderiza uma progressão real usando repertório acumulado", async () => {
  const publicInput = JSON.stringify(ethernet.units);
  assert.doesNotMatch(publicInput, /AnalysisUnit|StudyUnit|evidenceRequirements|instructionalAnalysis/iu);

  const sourceRendering = validateAndRender(ethernet.units);
  assert.deepEqual(
    sourceRendering.map(({ studyUnit }) => studyUnit.title),
    ethernet.acceptance.renderedProgression
  );
  assert.match(sourceRendering[0].html, /<table class="runtime-table">/u);
  assert.match(sourceRendering[0].html, /Alternativas e resposta esperada/u);
  assert.match(sourceRendering[3].html, /Resposta esperada: 3/u);
  assert.match(sourceRendering[10].html, /Resposta esperada: porta 1/u);
  assert.match(sourceRendering[11].text, /aprendizagem e encaminhamento nos três passos/iu);

  const committed = await materializeFixture(ethernet);
  const rendered = validateAndRender(committed);
  assert.equal(rendered.length, ethernet.units.length);

  const { idByName } = ideaMaps(ethernet);
  const expectedNewIds = new Set(ethernet.acceptance.expectedNewIdeas.map((name) => idByName.get(name)));
  const introducedIds = committed.flatMap(({ designApplication }) =>
    designApplication.introducedInstructionalAnalysisUnitIds);
  assert.deepEqual(new Set(introducedIds), expectedNewIds);
  assert.equal(introducedIds.length, expectedNewIds.size, "Cada ideia nova tem uma única introdução.");

  for (const unit of committed) {
    const application = unit.designApplication;
    assert.ok(Array.isArray(application.usedInstructionalAnalysisUnitIds));
    if (["expository", "mixed"].includes(application.mode)) {
      assert.ok(
        application.introducedInstructionalAnalysisUnitIds.length <=
          ethernet.acceptance.newIdeaCeiling,
        `${unit.content.title} ultrapassou o teto de ideias novas.`
      );
    }
    if (application.mode === "practice") {
      assert.deepEqual(application.introducedInstructionalAnalysisUnitIds, []);
    }
  }

  const repertoire = accumulatedRepertoire(ethernet, committed);
  for (const name of ethernet.acceptance.expectedEstablishedIdeas) {
    assert.equal(repertoire.get(name).introducedAt.title,
      ethernet.repertoire.find((idea) => idea.name === name).introducedAt.title);
    assert.ok(repertoire.get(name).usedBy.length > 0, `${name} deveria ser reutilizada.`);
  }
  assert.deepEqual(
    repertoire.get("encaminhamento para destino conhecido").revisitedBy.map(({ title }) => title),
    ["Conhecido e desconhecido lado a lado"]
  );
  assert.deepEqual(
    repertoire.get("flooding para destino desconhecido").revisitedBy.map(({ title }) => title),
    ["Conhecido e desconhecido lado a lado"]
  );
  assert.deepEqual(
    repertoire.get("aprendizagem pelo endereço de origem").revisitedBy.map(({ title }) => title),
    ["A origem ensina; o destino orienta", "A resposta também ensina"]
  );

  for (const position of ethernet.acceptance.componentFunctions.stateAndChange) {
    assert.match(rendered[position - 1].html, /runtime-table/u);
  }
  for (const position of ethernet.acceptance.componentFunctions.quickPrediction) {
    assert.match(rendered[position - 1].html, /package-choice-response/u);
  }
  for (const position of ethernet.acceptance.componentFunctions.focusedExplanation) {
    assert.match(rendered[position - 1].html, /runtime-paragraph-block/u);
  }
});

test("fixture mobiliza explicitamente as ideias já estabelecidas em ideiasUtilizadas", async () => {
  const established = ethernet.acceptance.expectedEstablishedIdeas;
  const mobilized = new Set(ethernet.units.flatMap((unit) =>
    rawIdeas(unit, "ideiasUtilizadas")));
  assert.deepEqual(
    established.filter((idea) => mobilized.has(idea)),
    established
  );

  const requiredByUnit = ethernet.acceptance.requiredEstablishedUsesByUnit;
  for (const [title, requiredIdeas] of Object.entries(requiredByUnit)) {
    const unit = ethernet.units.find((candidate) => candidate.conteudo.title === title);
    assert.ok(unit, `Unidade obrigatória ausente: ${title}`);
    assert.deepEqual(
      requiredIdeas.filter((idea) => rawIdeas(unit, "ideiasUtilizadas").includes(idea)),
      requiredIdeas,
      `${title} precisa declarar todo conhecimento estabelecido que mobiliza.`
    );
  }

  const omission = structuredClone(ethernet);
  const integrated = omission.units.find(({ conteudo }) =>
    conteudo.title === "Analise a sequência completa");
  integrated.aplicacaoPedagogica.ideiasUtilizadas = rawIdeas(
    integrated,
    "ideiasUtilizadas"
  ).filter((idea) => idea !== "endereço MAC");
  assert.notDeepEqual(
    requiredByUnit["Analise a sequência completa"].filter((idea) =>
      rawIdeas(integrated, "ideiasUtilizadas").includes(idea)),
    requiredByUnit["Analise a sequência completa"],
    "O teste precisa detectar omissão semântica na unidade específica, não só no lote."
  );
});

test("uma ideia só pode ser usada ou retomada depois de existir no repertório do percurso", async () => {
  const withoutPriorMac = structuredClone(ethernet);
  const mac = withoutPriorMac.repertoire.find(({ name }) => name === "endereço MAC");
  mac.status = "new";
  delete mac.introducedAt;
  await assert.rejects(
    () => materializeFixture(withoutPriorMac),
    (error) => error.code === "human_materialization_use_before_introduction"
  );
});

test("cadeia para iniciantes é autocontida, progride, retoma e chega a uma aplicação praticada", async () => {
  const sourceAssessment = inspectBeginnerExperience(beginner, beginner.units);
  assert.deepEqual(sourceAssessment.violations, []);
  assert.match(sourceAssessment.rendered[5].html, /<table class="runtime-table">/u);
  assert.match(sourceAssessment.rendered[8].html, /package-choice-response/u);
  assert.match(sourceAssessment.rendered[8].text, /linha D e procurar a coluna 2/iu);

  const committed = await materializeFixture(beginner);
  const rendered = validateAndRender(committed);
  assert.equal(rendered.length, beginner.units.length);
  const applications = committed.map(({ designApplication }) => designApplication);
  assert.ok(applications.some((application) =>
    application.introducedInstructionalAnalysisUnitIds.length === 0));
  assert.ok(applications.some((application) =>
    application.introducedInstructionalAnalysisUnitIds.length === 1));
  assert.ok(applications.every((application) =>
    !["expository", "mixed"].includes(application.mode) ||
      application.introducedInstructionalAnalysisUnitIds.length <= 2));

  const repertoire = accumulatedRepertoire(beginner, committed);
  assert.deepEqual(
    repertoire.get("linha de assentos").revisitedBy.map(({ title }) => title),
    ["O encontro aponta um único assento"]
  );
  assert.deepEqual(
    repertoire.get("coluna de assentos").revisitedBy.map(({ title }) => title),
    ["O encontro aponta um único assento"]
  );
  assert.ok(repertoire.get("posição na interseção de linha e coluna").usedBy
    .some(({ title }) => title === "Agora encontre seu lugar"));
});

test("a aceitação rejeita lacunas evidentes e os dois extremos sem criar heurísticas de domínio", () => {
  const accepted = inspectBeginnerExperience(beginner, beginner.units);
  assert.deepEqual(accepted.violations, []);
  assert.equal(
    beginner.repertoire.filter(({ name }) =>
      name === beginner.acceptance.coherentFusion.canonicalIdea).length,
    1,
    "A relação coerente permanece uma única ideia acompanhável."
  );

  const bBeforeA = structuredClone(beginner.units);
  [bBeforeA[1], bBeforeA[3]] = [bBeforeA[3], bBeforeA[1]];
  assert.ok(inspectBeginnerExperience(beginner, withPositions(bBeforeA)).violations
    .some((message) => /antes de estabelecer|fora de ordem/u.test(message)));

  const relationAssumed = withPositions(beginner.units.filter((unit) => unit.posicao !== 6));
  assert.ok(inspectBeginnerExperience(beginner, relationAssumed).violations
    .some((message) => /posição na interseção|elo não estabelecido/u.test(message)));

  const applicationNeverPracticed = beginner.units.filter((unit) => unit.posicao !== 9);
  assert.ok(inspectBeginnerExperience(beginner, applicationNeverPracticed).violations
    .some((message) => /aplicação sem prática/u.test(message)));

  const hiddenKnowledge = structuredClone(beginner.units);
  hiddenKnowledge[7].conteudo.content[0].data.text +=
    " Represente o auditório como matriz bidimensional com índice zero.";
  assert.ok(inspectBeginnerExperience(beginner, hiddenKnowledge).violations
    .some((message) => /conhecimento técnico oculto/u.test(message)));

  const mereMention = structuredClone(beginner.units);
  mereMention[5].conteudo.content[0].data.text =
    "Linha e coluna formam a localização do assento. Agora siga adiante.";
  assert.ok(inspectBeginnerExperience(beginner, mereMention).violations
    .some((message) => /mera menção sem explicação/u.test(message)));

  const denseChain = [structuredClone(beginner.units[1])];
  denseChain[0].conteudo.title = "Toda a regra de uma vez";
  denseChain[0].conteudo.content = [{
    id: "dense-chain",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: {
      text: "Uma linha é horizontal e usa letra; uma coluna é vertical e usa número; o encontro aponta um único assento; o bilhete informa ambos."
    }
  }];
  denseChain[0].aplicacaoPedagogica.ideiasIntroduzidas =
    beginner.acceptance.dependencyOrder.slice();
  denseChain[0].aplicacaoPedagogica.explicacoes =
    beginner.acceptance.dependencyOrder.map((ideia) => ({
      ideia,
      formas: ["plain_definition"]
    }));
  assert.ok(inspectBeginnerExperience(beginner, denseChain).violations
    .some((message) => /card expositivo denso/u.test(message)));

  const fragments = beginner.acceptance.coherentFusion.fragmentsThatMustNotBecomeIdeas;
  const overAtomized = fragments.map((fragment, index) => ({
    microssequencia: beginner.part.microsequence.title,
    posicao: index + 1,
    conteudo: {
      title: `Passo ${index + 1}`,
      role: "theory",
      content: [{
        id: `fragment-${index + 1}`,
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: `Agora, ${fragment}.` }
      }],
      response: null,
      feedback: [],
      topics: ["localização"]
    },
    aplicacaoPedagogica: {
      ideiasIntroduzidas: [fragment],
      ideiasUtilizadas: [],
      explicacoes: [{ ideia: fragment, formas: ["plain_definition"] }],
      praticas: []
    },
    fontes: []
  }));
  const overAtomizedAssessment = inspectBeginnerExperience(beginner, overAtomized, {
    repertoireNames: [
      ...beginner.repertoire.map(({ name }) => name)
        .filter((name) => name !== beginner.acceptance.coherentFusion.canonicalIdea),
      ...fragments
    ]
  });
  assert.ok(overAtomizedAssessment.rendered.every(({ html }) =>
    /runtime-paragraph-block/u.test(html)));
  assert.ok(overAtomizedAssessment.violations
    .some((message) => /atomização excessiva/u.test(message)));
});
