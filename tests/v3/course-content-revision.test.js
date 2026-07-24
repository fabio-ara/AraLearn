import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  buildCourseContentRevisionFragment,
  decompileCourseRevisionFragment,
  prepareCourseContentRevision
} from "../../supabase/functions/_shared/aralearn-authoring/contentRevision.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  AUTHORING_MCP_TOOLS,
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/mcpTools.js";
import {
  validateApplyCourseRevisionPayload,
  validateCourseRevisionFragment,
  validateOpenCourseRevisionPayload,
  validateSaveCourseRevisionPayload
} from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";
import {
  compileAuthoringFragmentGaps
} from "../../supabase/functions/_shared/aralearn/runtime/core/authoringGaps.js";
import {
  contractToRelationalRows
} from "../../supabase/functions/_shared/aralearn/runtime/persistence/contractToRelationalRows.js";

const fixtureUrl = new URL("../fixtures/v3/project-minimal.json", import.meta.url);
const REQUEST_ID = "revision-request-0001";
const COURSE_ID = "11111111-1111-4111-8111-111111111111";
const MICROSEQUENCE_ID = "22222222-2222-4222-8222-222222222222";
const CARD_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";

async function revisionFixture() {
  const project = JSON.parse(await fs.readFile(fixtureUrl, "utf8"));
  const rows = contractToRelationalRows(project);
  const course = rows.courses[0];
  const moduleValue = rows.modules[0];
  const lesson = rows.lessons[0];
  const microsequence = rows.microsequences[0];
  const context = {
    course: {
      id: course.id,
      contractKey: course.contractKey,
      title: course.title
    },
    module: {
      id: moduleValue.id,
      contractKey: moduleValue.contractKey,
      title: moduleValue.title
    },
    lesson: {
      id: lesson.id,
      contractKey: lesson.contractKey,
      title: lesson.title
    },
    microsequence: {
      id: microsequence.id,
      contractKey: microsequence.contractKey
    }
  };
  const payload = {
    revisionId: REVISION_ID,
    target: "catalog",
    courseId: course.id,
    microsequenceId: microsequence.id,
    baseContentHash: "a".repeat(64),
    context,
    rows
  };
  return {
    project,
    rows,
    payload,
    exposed: buildCourseContentRevisionFragment(payload)
  };
}

test("fragmento de correção expõe somente a linguagem formal, sem linhas internas", async () => {
  const { exposed } = await revisionFixture();

  assert.equal(exposed.rows, undefined);
  assert.equal(exposed.compiledFragment, undefined);
  assert.equal(exposed.authoringFragment.microsequences.length, 1);
  const exercise = exposed.authoringFragment.microsequences[0].cards[1];
  assert.match(exercise.text, /\{gap:[^}]+\}/u);
  assert.ok(Array.isArray(exercise.gaps));
  assert.doesNotMatch(exercise.text, /\[\[/u);
});

test("round-trip formal preserva lacunas e práticas estruturadas de flow", () => {
  const formal = {
    courseId: "course-flow",
    moduleId: "module-flow",
    lessonId: "lesson-flow",
    microsequences: [{
      id: "micro-flow",
      position: 0,
      title: "Fluxo",
      status: "ready",
      dependsOn: [],
      cards: [{
        id: "card-flow",
        position: 0,
        title: "Decisão",
        kind: "exercise",
        exercise: "gap",
        resource: "flow",
        after: "A condição define o ramo.",
        structure: {
          id: "root",
          kind: "sequence",
          items: [{
            id: "input",
            kind: "input",
            text: "{gap:read}"
          }, {
            id: "decision",
            kind: "if_then_else",
            condition: "{gap:condition}",
            practice: {
              blankShape: true,
              shapeOptions: ["process"],
              labels: {
                yes: {
                  blank: true,
                  mode: "choice",
                  options: ["Não"]
                }
              }
            },
            thenBranch: [{
              id: "accept",
              kind: "output",
              text: "Aceitar"
            }],
            elseBranch: [{
              id: "reject",
              kind: "output",
              text: "Rejeitar"
            }]
          }]
        },
        gaps: [{
          id: "read",
          response: "text",
          answer: "Ler nota",
          acceptedAnswers: ["Obter nota"]
        }, {
          id: "condition",
          response: "choice",
          answer: "nota >= 6",
          distractors: ["nota < 6"]
        }]
      }, {
        id: "card-composite-flow",
        position: 1,
        title: "Fluxo composto",
        kind: "exercise",
        exercise: "gap",
        resource: "composite",
        after: "O processo transforma a entrada.",
        blocks: [{
          id: "block-flow",
          kind: "flow",
          structure: {
            id: "root-composite",
            kind: "sequence",
            items: [{
              id: "process",
              kind: "process",
              text: "{gap:process}"
            }]
          }
        }],
        gaps: [{
          id: "process",
          response: "choice",
          answer: "Calcular média",
          distractors: ["Apagar nota"]
        }]
      }]
    }]
  };

  const compiled = compileAuthoringFragmentGaps(formal);
  const decompiled = decompileCourseRevisionFragment(compiled);
  const decision = decompiled.microsequences[0].cards[0].structure.items[1];
  const compositeProcess =
    decompiled.microsequences[0].cards[1].blocks[0].structure.items[0];

  assert.equal(decision.condition, "{gap:condition}");
  assert.equal(decision.practice.blankShape, true);
  assert.equal(decision.practice.text, undefined);
  assert.equal(compositeProcess.text, "{gap:process}");
  assert.doesNotMatch(JSON.stringify(decompiled), /\[\[/u);
  assert.deepEqual(compileAuthoringFragmentGaps(decompiled), compiled);
});

test("round-trip formal preserva fórmula e seu espelho acessível", () => {
  const formal = {
    courseId: "course-formula",
    moduleId: "module-formula",
    lessonId: "lesson-formula",
    microsequences: [{
      id: "micro-formula",
      position: 0,
      title: "Fórmula",
      status: "ready",
      dependsOn: [],
      cards: [{
        id: "card-formula",
        position: 0,
        title: "Operador",
        kind: "exercise",
        exercise: "gap",
        resource: "formula",
        after: "O operador completa a expressão.",
        accessibleText: "x {gap:operator} y",
        expression: {
          type: "row",
          children: [
            { type: "identifier", value: "x" },
            { type: "operator", value: "{gap:operator}" },
            { type: "identifier", value: "y" }
          ]
        },
        gaps: [{
          id: "operator",
          response: "choice",
          answer: "+",
          distractors: ["−"]
        }]
      }, {
        id: "card-composite-formula",
        position: 1,
        title: "Fórmula composta",
        kind: "exercise",
        exercise: "gap",
        resource: "composite",
        after: "O índice identifica o elemento.",
        blocks: [{
          id: "block-formula",
          kind: "formula",
          accessibleText: "a {gap:index}",
          expression: {
            type: "row",
            children: [
              { type: "identifier", value: "a" },
              { type: "number", value: "{gap:index}" }
            ]
          }
        }],
        gaps: [{
          id: "index",
          response: "text",
          answer: "1",
          acceptedAnswers: ["um"]
        }]
      }]
    }]
  };

  const compiled = compileAuthoringFragmentGaps(formal);
  const decompiled = decompileCourseRevisionFragment(compiled);
  const formula = decompiled.microsequences[0].cards[0];
  const compositeFormula = decompiled.microsequences[0].cards[1].blocks[0];

  assert.equal(formula.accessibleText, "x {gap:gap-1} y");
  assert.equal(formula.expression.children[1].value, "{gap:gap-1}");
  assert.equal(compositeFormula.accessibleText, "a {gap:gap-2}");
  assert.equal(compositeFormula.expression.children[1].value, "{gap:gap-2}");
  assert.doesNotMatch(JSON.stringify(decompiled), /\[\[/u);
  assert.deepEqual(compileAuthoringFragmentGaps(decompiled), compiled);
});

test("alteração de texto produz diferença de uma linha de bloco e preserva UUIDs dos cards", async () => {
  const { rows, payload, exposed } = await revisionFixture();
  const formalFragment = structuredClone(exposed.authoringFragment);
  formalFragment.microsequences[0].cards[0].text += " A ordem das proposições não altera a regra.";
  const compiledFragment = compileAuthoringFragmentGaps(formalFragment);

  const prepared = await prepareCourseContentRevision({
    formalFragment,
    compiledFragment,
    currentFragmentPayload: payload,
    fullDocumentRows: rows
  });

  assert.equal(prepared.diff.changedEntityCount, 1);
  assert.match(prepared.diff.changes[0].entity, /^blocks:/u);
  assert.equal(prepared.diff.changes[0].operation, "update");
  assert.deepEqual(
    prepared.relationalPatch.cards.map((row) => row.id),
    rows.cards.map((row) => row.id)
  );
  assert.match(prepared.expectedContentHash, /^[a-f0-9]{64}$/u);
});

test("correção pontual rejeita metadado da microssequência e mais de uma microssequência", async () => {
  const { payload, exposed, rows } = await revisionFixture();
  const changed = structuredClone(exposed.authoringFragment);
  changed.microsequences[0].title = "Outro recorte";

  await assert.rejects(
    prepareCourseContentRevision({
      formalFragment: changed,
      compiledFragment: compileAuthoringFragmentGaps(changed),
      currentFragmentPayload: payload,
      fullDocumentRows: rows
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "revision_scope_violation"
  );

  const duplicated = structuredClone(exposed.authoringFragment);
  duplicated.microsequences.push(structuredClone(duplicated.microsequences[0]));
  assert.throws(
    () => validateCourseRevisionFragment(duplicated),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_payload"
  );
});

test("envelopes da revisão exigem recorte, hash e requestId formais", async () => {
  const { exposed } = await revisionFixture();
  assert.deepEqual(
    validateOpenCourseRevisionPayload({
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      microsequenceId: MICROSEQUENCE_ID
    }),
    {
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      microsequenceId: MICROSEQUENCE_ID,
      cardId: null
    }
  );
  assert.equal(validateSaveCourseRevisionPayload({
    requestId: REQUEST_ID,
    baseContentHash: "a".repeat(64),
    fragment: exposed.authoringFragment
  }).compiledFragment.microsequences.length, 1);
  assert.equal(validateApplyCourseRevisionPayload({
    requestId: REQUEST_ID,
    baseContentHash: "b".repeat(64)
  }).baseContentHash, "b".repeat(64));
  assert.throws(
    () => validateOpenCourseRevisionPayload({
      requestId: REQUEST_ID,
      courseId: COURSE_ID
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_payload"
  );
});

test("MCP mapeia a correção formal para catálogo e biblioteca sem documento completo", () => {
  const open = mapAuthoringMcpToolCall("abrirCorrecaoPontual", {
    requestId: REQUEST_ID,
    target: "catalog",
    courseId: COURSE_ID,
    cardId: CARD_ID
  });
  assert.equal(open.method, "POST");
  assert.equal(open.path, "/v1/catalog/revisions");
  assert.equal(open.body.target, undefined);
  assert.equal(open.body.cardId, CARD_ID);

  const read = mapAuthoringMcpToolCall("consultarCorrecaoPontual", {
    target: "private",
    revisionId: REVISION_ID
  });
  assert.equal(read.method, "GET");
  assert.equal(
    read.path,
    `/v1/library/revisions/${REVISION_ID}/fragment`
  );
  assert.equal(read.body, null);

  const apply = mapAuthoringMcpToolCall("aplicarCorrecaoPontual", {
    requestId: REQUEST_ID,
    target: "catalog",
    revisionId: REVISION_ID,
    baseContentHash: "c".repeat(64)
  });
  assert.equal(
    apply.path,
    `/v1/catalog/revisions/${REVISION_ID}/apply`
  );
  assert.equal(apply.body.revisionId, undefined);
  assert.equal(
    AUTHORING_MCP_TOOLS.some((tool) =>
      JSON.stringify(tool.inputSchema).includes("document")
      && tool.name.includes("Correcao")
    ),
    false
  );
});

test("ferramentas de correção respeitam os escopos editorial e pessoal", () => {
  const names = (scopes) => new Set(authoringMcpToolsForPrincipal({
    actorId: COURSE_ID,
    authenticationKind: "api_key",
    scopes
  }).map((tool) => tool.name));

  assert.equal(names(["catalog:publish"]).has("abrirCorrecaoPontual"), true);
  assert.equal(names(["authoring:private:write"]).has("abrirCorrecaoPontual"), true);
  assert.equal(names(["authoring:private:read"]).has("abrirCorrecaoPontual"), false);
});

test("abertura da revisão serializa replays concorrentes antes de consultar o recibo", async () => {
  const migration = await fs.readFile(
    new URL(
      "../../supabase/migrations/20260723017000_scoped_course_content_revisions.sql",
      import.meta.url
    ),
    "utf8"
  );
  const functionStart = migration.indexOf(
    "create or replace function public.open_course_content_revision("
  );
  const functionEnd = migration.indexOf(
    "create or replace function public.get_course_content_revision(",
    functionStart
  );
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const source = migration.slice(functionStart, functionEnd);
  const lockIndex = source.indexOf("pg_advisory_xact_lock");
  const receiptReadIndex = source.indexOf(
    "select * into v_existing from private.course_content_revisions"
  );
  assert.ok(lockIndex >= 0);
  assert.ok(receiptReadIndex > lockIndex);
  assert.match(source, /hashtextextended\(p_revision_id::text,0\)/u);
});
