import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  projectConversationalAuthoringConfirmation,
  projectConversationalAuthoringError,
  projectConversationalAuthoringResumption,
  projectConversationalAuthoringSuccess,
  projectConversationalAuthoringToolSuccess,
  resolveConversationalCourseTitle
} from "../../supabase/functions/_shared/aralearn-authoring/conversationalAuthoringProjection.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ID = "request-conversation-technical-0001";
const HASH = "a".repeat(64);
const FORBIDDEN_DEFAULT = [
  COURSE_ID,
  REQUEST_ID,
  HASH,
  "expectedRevision",
  "expectedPlanVersion",
  "requestId",
  "storagePath",
  "payload",
  "update_instructional_plan",
  "stale_course_state"
];

function assertHumanProjection(projection) {
  const visible = JSON.stringify(projection);
  for (const value of FORBIDDEN_DEFAULT) {
    assert.equal(visible.includes(value), false, `A projeção padrão expôs ${value}.`);
  }
  assert.equal(Object.hasOwn(projection, "technicalDetails"), false);
}

const fixtureUrl = new URL(
  "../fixtures/conversational-authoring-resumption.v1.json",
  import.meta.url
);

test("A — retomada percorre descoberta e plano vivo por título humano sem ID", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const courses = [{
    courseId: COURSE_ID,
    revision: 19,
    title: fixture.course.title,
    objective: fixture.course.objective
  }];

  const resolution = resolveConversationalCourseTitle(
    courses,
    "dataprev gestao de servidores"
  );
  assert.equal(resolution.status, "matched");
  assert.equal(resolution.match, courses[0]);

  const discovery = projectConversationalAuthoringToolSuccess({
    toolName: "listarCursos",
    rawArguments: { query: "dataprev gestao de servidores" },
    envelope: {
      ok: true,
      requestId: null,
      data: { items: courses }
    }
  });
  assert.match(discovery.message, /Localizei/u);
  assertHumanProjection(discovery);

  const projected = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: { view: "instructional_plan", courseId: COURSE_ID },
    envelope: {
      ok: true,
      requestId: null,
      data: {
        courseId: COURSE_ID,
        courseRevision: 19,
        plan: {
          id: "plan-dataprev",
          version: 3,
          title: fixture.course.title,
          intendedLearningOutcomes: [],
          instructionalAnalysisUnits: [],
          evidenceRequirements: [],
          parts: fixture.course.plan.parts.map(() => ({
            progress: { materializations: [] }
          })),
          counts: {
            intendedLearningOutcomeCount: 0,
            instructionalAnalysisUnitCount: 0,
            evidenceRequirementCount: 0,
            authoringPartCount: fixture.course.plan.partCount,
            studyUnitCount: 0
          }
        }
      }
    }
  });
  assert.match(projected.message, /Planejamento incompleto/u);
  assert.match(projected.message, /12 Partes/u);
  assert.match(projected.message, /Nenhum conteúdo foi produzido/u);
  assert.match(projected.message, /Próxima decisão/u);
  assert.match(projected.message, /resultados de aprendizagem/u);
  assert.equal(projected.level, "standard");
  assertHumanProjection(projected);
});

test("B/C — proposta e confirmação descrevem efeito pedagógico sem payload", () => {
  const command = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 19,
    expectedPlanVersion: 3,
    operation: "update_instructional_plan",
    payload: { hidden: true }
  };
  const projected = projectConversationalAuthoringConfirmation({
    change: "Vou acrescentar 9 resultados de aprendizagem, 30 elementos fundamentais e 12 formas de evidência",
    reason: "Isso fecha o planejamento necessário para orientar a produção posterior",
    preserved: "As 12 Partes permanecem como estão",
    materialization: "Nenhuma aula será criada",
    command
  });

  assert.equal(projected.kind, "confirmation");
  assert.match(projected.message, /9 resultados de aprendizagem/u);
  assert.match(projected.message, /As 12 Partes permanecem como estão/u);
  assert.match(projected.message, /Nenhuma aula será criada/u);
  assert.match(projected.message, /Confirmo\?/u);
  assert.equal(projected.level, "standard");
  assertHumanProjection(projected);
});

test("D — sucesso usa o envelope sem mostrar seu estado de máquina", () => {
  const envelope = {
    ok: true,
    requestId: REQUEST_ID,
    data: {
      courseId: COURSE_ID,
      courseRevision: 20,
      expectedRevision: 19,
      expectedPlanVersion: 3,
      changed: true,
      contentHash: HASH,
      storagePath: `${COURSE_ID}/${HASH}.pdf`,
      deepLink: `https://example.test/#/authoring/courses/${COURSE_ID}`
    }
  };
  const before = structuredClone(envelope);
  const projected = projectConversationalAuthoringSuccess({
    envelope,
    summary: {
      change: "O planejamento agora inclui os resultados e as evidências aprovados",
      preserved: "As Partes e o conteúdo existente permaneceram intactos",
      nextDecision: "revisar a distribuição dos elementos fundamentais"
    }
  });

  assert.match(projected.message, /A alteração foi gravada e validada/u);
  assert.match(projected.message, /conteúdo existente permaneceram intactos/u);
  assert.equal(projected.level, "operational");
  assertHumanProjection(projected);
  assert.deepEqual(envelope, before);
});

test("E — conflito não sobrescreve estado novo e orienta releitura sem CAS", () => {
  const projected = projectConversationalAuthoringError({
    envelope: {
      ok: false,
      requestId: REQUEST_ID,
      error: {
        code: "stale_course_state",
        details: { expectedRevision: 19, currentRevision: 20 },
        recovery: { strategy: "reread_and_retry", requestIdMode: "new" }
      }
    }
  });

  assert.equal(projected.classification, "conflict");
  assert.equal(projected.writeState, "none");
  assert.equal(projected.level, "diagnostic");
  assert.equal(projected.retrySafe, true);
  assert.equal(projected.reloadRequired, true);
  assert.equal(projected.concurrencyConflict, true);
  assert.match(projected.message, /Curso mudou desde a última leitura/u);
  assert.match(projected.message, /Nada foi sobrescrito/u);
  assert.match(projected.message, /reler o estado atual/u);
  assertHumanProjection(projected);
});

test("F — falha incerta nunca vira sucesso e conserva a dúvida sobre a escrita", () => {
  const envelope = {
    ok: false,
    requestId: REQUEST_ID,
    error: {
      code: "internal_error",
      message: "rpc failed at private.course_plan_write_v1",
      recovery: { strategy: "repeat_identical", requestIdMode: "same" }
    }
  };
  const projected = projectConversationalAuthoringError({ envelope });

  assert.equal(projected.success, false);
  assert.equal(projected.classification, "uncertain");
  assert.equal(projected.writeState, "unknown");
  assert.equal(projected.level, "diagnostic");
  assert.equal(projected.retrySafe, true);
  assert.equal(projected.reloadRequired, false);
  assert.equal(projected.concurrencyConflict, false);
  assert.match(projected.message, /Não foi possível confirmar/u);
  assert.match(projected.message, /Não vou tratá-la como concluída/u);
  assert.doesNotMatch(projected.message, /foi gravada|foi concluída\./u);
  assertHumanProjection(projected);
});

test("diagnóstico distingue reconexão de falta de permissão", () => {
  const disconnected = projectConversationalAuthoringError({
    envelope: {
      ok: false,
      requestId: null,
      error: {
        code: "authentication_required",
        recovery: { strategy: "reconnect", retryable: true }
      }
    }
  });
  assert.equal(disconnected.classification, "access");
  assert.equal(disconnected.retrySafe, true);
  assert.match(disconnected.message, /Reconecte a conta/u);

  const forbidden = projectConversationalAuthoringError({
    envelope: {
      ok: false,
      requestId: null,
      error: {
        code: "insufficient_scope",
        recovery: { strategy: "stop", retryable: false }
      }
    }
  });
  assert.equal(forbidden.classification, "access");
  assert.equal(forbidden.retrySafe, false);
  assert.match(forbidden.message, /não possui a permissão necessária/iu);
  assert.doesNotMatch(forbidden.message, /Reconecte/u);
});

test("G — pedido técnico explícito recupera envelope e chamada literais", () => {
  const envelope = {
    ok: false,
    requestId: REQUEST_ID,
    error: {
      code: "stale_course_state",
      details: { expectedRevision: 19, currentRevision: 20 }
    }
  };
  const failedCall = {
    operation: "update_instructional_plan",
    courseId: COURSE_ID,
    expectedRevision: 19,
    requestId: REQUEST_ID,
    payload: { planCommand: { type: "update_plan" } }
  };
  const projected = projectConversationalAuthoringError({
    envelope,
    failedCall,
    includeTechnicalDetails: true
  });

  assert.equal(projected.level, "technical");
  assert.deepEqual(projected.technicalDetails, { envelope, failedCall });
  assert.match(JSON.stringify(projected.technicalDetails), new RegExp(COURSE_ID, "u"));
  assert.match(JSON.stringify(projected.technicalDetails), /expectedRevision/u);
  assert.match(JSON.stringify(projected.technicalDetails), /update_instructional_plan/u);
});

test("H — títulos duplicados pedem desambiguação humana sem UUID", () => {
  const courses = [{
    courseId: COURSE_ID,
    revision: 7,
    title: "Dataprev: Gestão de Servidores",
    goal: "Preparação para servidores",
    updatedAt: "2026-08-28T10:00:00Z"
  }, {
    courseId: "20000000-0000-4000-8000-000000000002",
    revision: 3,
    title: "Dataprev: Gestão de Servidores",
    goal: "Preparação para servidores",
    updatedAt: "2026-08-29T10:00:00Z"
  }];
  const resolution = resolveConversationalCourseTitle(courses, courses[0].title);
  const projected = projectConversationalAuthoringResumption({ resolution });

  assert.equal(resolution.status, "ambiguous");
  assert.equal(resolution.matches.length, 2);
  assert.equal(projected.kind, "resumption_disambiguation");
  assert.match(projected.message, /Qual deles você quer continuar\?/u);
  assert.match(projected.message, /28\/08\/2026/u);
  assert.match(projected.message, /29\/08\/2026/u);
  assert.equal(projected.message.includes(COURSE_ID), false);
  assert.equal(projected.message.includes(courses[1].courseId), false);
  assert.doesNotMatch(projected.message, /revisão|revision/iu);
});
