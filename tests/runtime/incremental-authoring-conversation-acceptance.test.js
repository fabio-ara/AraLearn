import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  AUTHORING_PROTOCOL_V1_TOOLS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  COURSE_MCP_TOOLS,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/courseMcpTools.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS,
  courseAuthoringGuidanceForCall
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import {
  projectConversationalAuthoringToolSuccess
} from "../../supabase/functions/_shared/aralearn-authoring/conversationalAuthoringProjection.js";
import {
  projectAuthoringProtocolToolsForActions
} from "../../scripts/projectChatGptActionSchemas.mjs";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/incremental-authoring-conversation.v1.json",
  import.meta.url
), "utf8"));
const openApiText = await fs.readFile(new URL(
  "../../docs/downloads/aralearn-chatgpt-action-openapi.yaml",
  import.meta.url
), "utf8");
const openApi = JSON.parse(openApiText);

const COURSE_ID = "80000000-0000-4000-8000-000000000001";
const PART_ID = "80000000-0000-4000-8000-000000000002";

function validator(schema, referencedSchemas = {}) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const [name, referenced] of Object.entries(referencedSchemas)) {
    ajv.addSchema(referenced, `#/components/schemas/${name}`);
  }
  return ajv.compile(schema);
}

test("#269 a fixture mantém uma única proposta corrente e 7–12 apenas como heurística", () => {
  assert.equal(fixture.format, "aralearn.incremental-authoring-conversation-eval.v1");
  assert.equal(
    fixture.epistemicStatus,
    "synthetic_flow_for_contract_and_human_review"
  );
  assert.deepEqual(Object.keys(fixture.minimumContext), [
    "audience",
    "explicitPrerequisites",
    "objective",
    "sources",
    "studyConstraints",
    "authorIntent"
  ]);
  assert.deepEqual(fixture.planningHeuristic.usualPartRange, [7, 12]);
  assert.equal(fixture.planningHeuristic.isGate, false);
  assert.equal(fixture.proposals.length, 2);
  for (const [index, proposal] of fixture.proposals.entries()) {
    assert.equal(proposal.persistedPartCountBeforeProposal, index);
    assert.deepEqual(Object.keys(proposal.part), ["key", "title", "intent", "focus"]);
    assert.deepEqual(Object.keys(proposal.visibleCoordination), [
      "change", "actionLabel", "nextDecision"
    ]);
    assert.equal((proposal.visibleCoordination.nextDecision.match(/\?/gu) || []).length, 1);
    assert.ok(JSON.stringify(proposal.visibleCoordination).length < 320);
    const visible = JSON.stringify(proposal.visibleCoordination);
    for (const hidden of Object.values(proposal.part.focus).flat()) {
      assert.equal(visible.includes(String(hidden)), false);
    }
  }
  assert.deepEqual(fixture.persistedStates.map(({ partKeys }) => partKeys.length), [0, 1, 1, 2, 2]);
  assert.deepEqual(fixture.persistedStates.map(({ sourceCount }) => sourceCount), [1, 1, 2, 2, 2]);
  assert.deepEqual(fixture.forbiddenPersistentMechanisms, [
    "proposal_history",
    "course_snapshot",
    "planning_session_state",
    "next_part_draft_table"
  ]);
});

test("#269 guidance exige propor, persistir, reler e decidir Parte por Parte", () => {
  const planning = courseAuthoringGuidanceForCall("lerCurso", {
    view: "instructional_plan"
  });
  const sources = courseAuthoringGuidanceForCall("lerCurso", {
    view: "course_sources",
    mode: "catalog"
  });
  const planningText = planning.instructions.join(" ");
  const sourceText = sources.instructions.join(" ");

  assert.match(planningText, /proponha somente a próxima Parte/iu);
  assert.match(planningText, /Não antecipe.*Partes seguintes/iu);
  assert.match(planningText, /nem despeje AnalysisUnits, requisitos de evidência/iu);
  assert.match(planningText, /grave exatamente uma Parte com add_part/iu);
  assert.match(planningText, /releia instructional_plan/iu);
  assert.match(planningText, /uma única próxima decisão/iu);
  assert.match(planningText, /Só então proponha a Parte seguinte/iu);
  assert.match(planningText, /retome exclusivamente pelo plano persistido/iu);
  assert.match(planningText, /Parte anterior pode ser reaberta e alterada/iu);
  assert.match(planningText, /sem criar versão, snapshot ou histórico paralelo/iu);
  assert.match(planningText, /Parte é lote operacional.*não nível/iu);
  assert.match(planningText, /Sete a doze Partes.*heurística/iu);
  assert.match(planningText, /nunca meta, mínimo, máximo ou gate/iu);
  assert.match(sourceText, /Fontes podem ser.*em qualquer fase/iu);
  assert.match(sourceText, /retome o planejamento.*estado persistido/iu);
  assert.match(sourceText, /não bloqueie nem reinicie o Curso/iu);
  assert.match(
    COURSE_AUTHORING_SERVER_INSTRUCTIONS,
    /uma proposta ou mudança, uma ação rotulada.*uma única decisão/iu
  );
  assert.match(
    COURSE_AUTHORING_SERVER_INSTRUCTIONS,
    /não reproduza na conversa o planejamento ou o conteúdo/iu
  );
});

test("#269 MCP e Actions reutilizam add_part sem identidade nem novo estado", () => {
  const proposal = fixture.proposals[0].part;
  const mcpTool = COURSE_MCP_TOOLS.find(({ name }) => name === "add_part");
  const validateMcp = validator(mcpTool.inputSchema);
  const mcpInput = {
    requestId: "incremental-part-0001",
    courseId: COURSE_ID,
    expectedRevision: 1,
    expectedPlanVersion: 1,
    position: 0,
    title: proposal.title,
    intent: proposal.intent
  };
  assert.equal(validateMcp(mcpInput), true, JSON.stringify(validateMcp.errors));
  assert.equal(validateMcp({ ...mcpInput, id: PART_ID }), false);
  const mapped = mapAuthoringMcpToolCall("add_part", mcpInput);
  assert.deepEqual(mapped.body.command, {
    type: "add_part",
    position: 0,
    title: proposal.title,
    intent: proposal.intent
  });

  const actionSchema = openApi.paths["/add_part"].post.requestBody
    .content["application/json"].schema;
  const validateAction = validator(actionSchema, openApi.components.schemas);
  const actionInput = {
    requestId: mcpInput.requestId,
    courseId: COURSE_ID,
    expectedRevision: 1,
    expectedPlanVersion: 1,
    operation: "update_instructional_plan",
    planCommand: mapped.body.command
  };
  assert.equal(validateAction(actionInput), true, JSON.stringify(validateAction.errors));
  assert.equal(validateAction({
    ...actionInput,
    planCommand: { ...actionInput.planCommand, id: PART_ID }
  }), false);

  const description = openApi.paths["/add_part"].post.description;
  assert.match(description, /somente a próxima Parte aprovada/iu);
  assert.match(description, /releia o planejamento.*uma única decisão/iu);
  assert.match(description, /não antecipe várias Partes/iu);
  assert.match(description, /7–12 é heurística, nunca gate/iu);
  assert.equal(mcpTool.description, description);
  assert.equal(
    COURSE_MCP_TOOLS.some(({ name }) => /propor|retomar|rascunho/iu.test(name)),
    false
  );
});

test("#269 Parte anterior e Fonte no meio do fluxo usam contratos já existentes", () => {
  const mcpChange = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso");
  const actionChange = projectAuthoringProtocolToolsForActions(
    AUTHORING_PROTOCOL_V1_TOOLS
  ).find(({ name }) => name === "alterarCurso");
  const validateMcp = validator(mcpChange.inputSchema);
  const validateAction = validator(actionChange.inputSchema);
  const reopen = {
    requestId: "reopen-part-0001",
    courseId: COURSE_ID,
    expectedRevision: 3,
    expectedPlanVersion: 3,
    operation: "update_instructional_plan",
    planCommand: {
      type: "update_part",
      id: PART_ID,
      title: "Do pedido ao endereço de rede — revisto",
      intent: "Incorporar a nova Fonte sem alterar a Parte seguinte."
    }
  };
  assert.equal(validateMcp(reopen), true, JSON.stringify(validateMcp.errors));
  assert.equal(validateAction(reopen), true, JSON.stringify(validateAction.errors));
  assert.ok(COURSE_MCP_TOOLS.some(({ name }) => name === "incorporarPdfComoFonte"));
  assert.ok(openApi.paths["/incorporarPdfComoFonte"]);
  assert.equal(Object.hasOwn(
    COURSE_MCP_TOOLS.find(({ name }) => name === "incorporarPdfComoFonte")
      .inputSchema.properties,
    "planningSessionId"
  ), false);
});

test("#269 projeção preserva o plano estruturado completo sem despejá-lo na conversa", () => {
  const parts = Array.from({ length: 10 }, (_, index) => ({
    id: `part-${index + 1}`,
    title: `Título interno detalhado ${index + 1}`,
    intent: `Intenção operacional detalhada ${index + 1}`,
    analysisUnits: [`Novidade detalhada ${index + 1}`],
    progress: { materializations: [] }
  }));
  const envelope = {
    ok: true,
    requestId: null,
    data: {
      plan: {
        title: "Curso incremental",
        parts,
        counts: {
          intendedLearningOutcomeCount: 1,
          instructionalAnalysisUnitCount: 1,
          evidenceRequirementCount: 1,
          authoringPartCount: parts.length,
          studyUnitCount: 0
        }
      }
    }
  };
  const before = structuredClone(envelope);
  const projected = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: { view: "instructional_plan", courseId: COURSE_ID },
    envelope
  });
  assert.match(projected.message, /10 Partes permanecem definidas/iu);
  assert.match(projected.message, /Nenhum conteúdo foi produzido/iu);
  for (const part of parts) {
    assert.equal(projected.message.includes(part.title), false);
    assert.equal(projected.message.includes(part.intent), false);
    assert.equal(projected.message.includes(part.analysisUnits[0]), false);
  }
  assert.equal(JSON.stringify(projected).includes(COURSE_ID), false);
  assert.deepEqual(envelope, before);
  assert.deepEqual(envelope.data.plan.parts, parts);
});

test("#269 confirmação de uma Parte devolve link e exatamente uma decisão curta", () => {
  const proposal = fixture.proposals[1];
  const deepLink = `https://example.test/#/authoring/courses/${COURSE_ID}?section=planning`;
  const projected = projectConversationalAuthoringToolSuccess({
    toolName: "add_part",
    rawArguments: {
      courseId: COURSE_ID,
      title: proposal.part.title,
      intent: proposal.part.intent
    },
    envelope: {
      ok: true,
      requestId: "incremental-part-0002",
      data: { changed: true, deepLink }
    },
    summary: {
      change: proposal.visibleCoordination.change,
      nextDecision: proposal.visibleCoordination.nextDecision
    }
  });
  assert.equal(projected.action?.label, proposal.visibleCoordination.actionLabel);
  assert.match(projected.message, /A alteração foi gravada e validada/iu);
  assert.match(projected.message, /Próxima decisão:/iu);
  assert.equal((projected.message.match(/\?/gu) || []).length, 1);
  assert.ok(projected.message.length < 280);
  assert.equal(projected.message.includes(deepLink), false);
  for (const hidden of Object.values(proposal.part.focus).flat()) {
    assert.equal(projected.message.includes(String(hidden)), false);
  }
  assert.equal(JSON.stringify(projected).includes(COURSE_ID), false);
  assert.equal(JSON.stringify(projected).includes("expectedPlanVersion"), false);
});

test("#269 o OpenAPI só projeta o fluxo existente e não transforma a heurística em gate", () => {
  assert.match(openApi.paths["/lerCurso"].post.description, /phaseGuidance focal/iu);
  assert.ok(openApi.paths["/add_part"]);
  assert.ok(openApi.paths["/update_plan_item"]);
  assert.ok(openApi.paths["/incorporarPdfComoFonte"]);
  assert.doesNotMatch(
    openApiText,
    /planningSessionId|nextPartDraft|proposalHistory|courseSnapshot/iu
  );
  const addPartSchema = openApi.paths["/add_part"].post.requestBody
    .content["application/json"].schema;
  assert.equal(addPartSchema.properties.expectedPlanVersion.minimum, 1);
  assert.equal(addPartSchema.properties.planCommand.$ref.endsWith("Add_partPlanCommand"), true);
});
