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
  assert.doesNotMatch(
    visible,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu
  );
  assert.doesNotMatch(visible, /\b[0-9a-f]{64}\b/iu);
  assert.doesNotMatch(
    visible,
    /\b(?:courseId|sourceId|sourceRevision|anchorId|anchorRevision|revision|planVersion|expectedRevision|expectedPlanVersion|requestId|storagePath|contentHash|CAS|payload|schema|sourceLinks)\b/iu
  );
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

test("#223 — retomada mínima integra plano vivo, Fontes persistentes e próxima decisão", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const { machineState } = fixture;
  const courses = [{
    courseId: machineState.courseId,
    revision: machineState.courseRevision,
    title: fixture.course.title,
    objective: fixture.course.objective
  }];
  const resolution = resolveConversationalCourseTitle(courses, fixture.course.title);
  const discovery = projectConversationalAuthoringResumption({ resolution });
  const plan = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: { view: "instructional_plan", courseId: machineState.courseId },
    envelope: {
      ok: true,
      requestId: null,
      data: {
        courseId: machineState.courseId,
        courseRevision: machineState.courseRevision,
        plan: {
          id: machineState.planId,
          version: machineState.planVersion,
          title: fixture.course.title,
          intendedLearningOutcomes: [],
          instructionalAnalysisUnits: [],
          evidenceRequirements: [],
          parts: machineState.partIds.map(() => ({
            progress: { materializations: [] }
          })),
          counts: {
            intendedLearningOutcomeCount: 0,
            instructionalAnalysisUnitCount: 0,
            evidenceRequirementCount: 0,
            authoringPartCount: fixture.course.plan.partCount,
            studyUnitCount: fixture.course.materializationCount
          }
        }
      }
    }
  });
  const catalog = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: {
      view: "course_sources",
      mode: "catalog",
      courseId: machineState.courseId,
      expectedRevision: machineState.courseRevision
    },
    envelope: {
      ok: true,
      requestId: null,
      data: {
        contract: "aralearn.mcp-course-sources.v1",
        mode: "catalog",
        items: fixture.sources.map(({ sourceId, source, status }) => ({
          sourceId,
          citationText: source.citationText,
          status
        })),
        nextCursor: null
      }
    }
  });
  const edital = fixture.sources.find(({ key }) => key === "edital");
  const focalSource = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: {
      view: "course_sources",
      mode: "source",
      sourceId: edital.sourceId,
      courseId: machineState.courseId,
      expectedRevision: machineState.courseRevision
    },
    envelope: {
      ok: true,
      requestId: null,
      data: {
        contract: "aralearn.mcp-course-sources.v1",
        mode: "source",
        items: [{
          sourceId: edital.sourceId,
          revision: edital.revision,
          status: edital.status,
          citationText: edital.source.citationText,
          anchors: edital.anchors,
          attachments: [edital.attachment]
        }],
        nextCursor: null
      }
    }
  });

  assert.equal(resolution.status, "matched");
  assertHumanProjection(discovery);
  assertHumanProjection(plan);
  assertHumanProjection(catalog);
  assertHumanProjection(focalSource);
  assert.match(plan.message, /12 Partes/u);
  assert.match(plan.message, /Nenhum conteúdo foi produzido/u);
  assert.match(plan.message, /resultados de aprendizagem/u);
  assert.match(plan.message, /unidades de análise/u);
  assert.match(plan.message, /requisitos de evidência/u);
  assert.match(plan.message, /Próxima decisão/u);
  assert.match(catalog.message, /4 Fontes/u);
  assert.match(catalog.message, /Edital Dataprev 2026/u);
  assert.match(catalog.message, /Prova FGV 2024/u);
  assert.match(catalog.message, /Gabarito FGV 2024/u);
  assert.match(catalog.message, /PPC do TADS\/IFSP/u);
  assert.match(focalSource.message, /p\. 44 do arquivo/u);
  assert.equal(fixture.sources.every(({ attachment }) => attachment.stored), true);
  assert.equal(fixture.resumption.requiresPdfReupload, false);
  assert.doesNotMatch(
    fixture.resumption.semanticResponse,
    /\b(?:courseId|expectedRevision|expectedPlanVersion|requestId|storagePath|contentHash|CAS)\b/iu
  );
  assert.match(fixture.resumption.semanticResponse, /requisitos de evidência/u);
});

test("#222 — nova sessão resume o catálogo de Fontes em linguagem humana", () => {
  const projected = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: {
      courseId: COURSE_ID,
      view: "course_sources",
      expectedRevision: 19,
      mode: "catalog"
    },
    envelope: {
      ok: true,
      requestId: null,
      data: {
        contract: "aralearn.mcp-course-sources.v1",
        mode: "catalog",
        items: [
          { sourceId: "source-edital", citationText: "Edital Dataprev 2026", status: "active" },
          { sourceId: "source-prova", citationText: "Prova FGV 2024", status: "active" },
          { sourceId: "source-gabarito", citationText: "Gabarito FGV 2024", status: "active" },
          { sourceId: "source-ppc", citationText: "PPC TADS IFSP", status: "retired" }
        ],
        nextCursor: null
      }
    }
  });

  assert.equal(projected.kind, "resumption");
  assert.match(projected.message, /4 Fontes/u);
  assert.match(projected.message, /Edital Dataprev 2026 \(ativa\)/u);
  assert.match(projected.message, /PPC TADS IFSP \(aposentada\)/u);
  assert.match(projected.message, /Abra somente a Fonte relevante/u);
  assert.doesNotMatch(projected.message, /source-edital|revision|hash|path/iu);
  assertHumanProjection(projected);
});

test("#222 — detalhe focal cita a Fonte e os locais sem vazar controles", () => {
  const signedHash = "a".repeat(64);
  const sourceId = "source-edital-interno";
  const anchorId = "anchor-perfil-interno";
  const projected = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: {
      courseId: COURSE_ID,
      view: "course_sources",
      expectedRevision: 19,
      mode: "source",
      sourceId
    },
    envelope: {
      ok: true,
      requestId: null,
      data: {
        contract: "aralearn.mcp-course-sources.v1",
        mode: "source",
        items: [{
          sourceId,
          revision: 2,
          status: "active",
          citationText: "Edital Dataprev 2026",
          anchors: [{
            anchorId,
            revision: 1,
            status: "active",
            humanLocator: "Perfil 13 — Analista de Processamento → Gestão de Servidores, p. 44 do arquivo",
            selector: { kind: "page_range", startPage: 44, endPage: 44 },
            verificationExcerpt: "Trecho privado que não pertence ao resumo."
          }],
          attachments: [{ contentHash: signedHash, byteSize: 1_024, mediaType: "application/pdf" }]
        }, {
          sourceId,
          revision: 1,
          status: "retired",
          citationText: "Edital Dataprev 2025",
          anchors: [],
          attachments: []
        }],
        nextCursor: null
      }
    }
  });

  assert.match(projected.message, /Edital Dataprev 2026/u);
  assert.match(projected.message, /1 PDF permanece mantido/u);
  assert.match(projected.message, /Perfil 13.*p\. 44 do arquivo/u);
  assert.match(projected.message, /2 estados documentais/u);
  assert.doesNotMatch(projected.message, /Trecho privado|source-edital|anchor-perfil/iu);
  assert.equal(projected.message.includes(signedHash), false);
  assert.doesNotMatch(projected.message, /revis[aã]o|contentHash|storagePath/iu);
  assertHumanProjection(projected);
});

test("#222 — detalhe contextual não atribui Âncora alheia nem promete novo uso", () => {
  const linkedAnchorId = "anchor-linked-internal";
  const unrelatedAnchorId = "anchor-unrelated-internal";
  const projected = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: {
      courseId: COURSE_ID,
      view: "course_sources",
      expectedRevision: 19,
      mode: "source",
      sourceId: "source-historical-internal",
      targetKind: "plan_item",
      targetId: "20000000-0000-4000-8000-000000000002"
    },
    envelope: {
      ok: true,
      requestId: null,
      data: {
        contract: "aralearn.mcp-course-sources.v1",
        mode: "source",
        query: { targetKind: "plan_item" },
        items: [{
          status: "active",
          citationText: "Edital Dataprev 2026",
          anchors: [{
            anchorId: linkedAnchorId,
            status: "active",
            humanLocator: "p. 44",
            selector: { kind: "page_range", startPage: 44, endPage: 44 }
          }, {
            anchorId: unrelatedAnchorId,
            status: "active",
            humanLocator: "Anexo sem vínculo, p. 90",
            selector: { kind: "page_range", startPage: 90, endPage: 90 }
          }],
          attachments: []
        }],
        nextCursor: null
      }
    }
  });

  assert.match(projected.message, /edição historicamente atribuída/u);
  assert.match(projected.message, /somente os locais que também constam no vínculo/u);
  assert.match(projected.message, /consulte o catálogo antes de atribuí-la novamente/u);
  assert.doesNotMatch(projected.message, /p\. 44|p\. 90|esta edição está ativa/u);
  assert.equal(projected.message.includes(linkedAnchorId), false);
  assert.equal(projected.message.includes(unrelatedAnchorId), false);
  assertHumanProjection(projected);
});

test("#222 — catálogo compacto informa as referências omitidas na própria página", () => {
  const items = Array.from({ length: 8 }, (_, index) => ({
    sourceId: `source-${index}`,
    citationText: `Fonte sintética ${index + 1}`,
    status: "active"
  }));
  const projected = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: { view: "course_sources", mode: "catalog" },
    envelope: {
      ok: true,
      requestId: null,
      data: {
        contract: "aralearn.mcp-course-sources.v1",
        mode: "catalog",
        items,
        nextCursor: null
      }
    }
  });

  assert.match(projected.message, /8 Fontes/u);
  assert.match(projected.message, /e outras 2 nesta página/u);
  assert.doesNotMatch(projected.message, /Fonte sintética 7|Fonte sintética 8/u);
  assertHumanProjection(projected);
});

test("#222 — atribuição e PDF focal são retomados sem expor identidades ou URL", () => {
  const sourceId = "source-prova-interno";
  const targetId = "study-unit-interna";
  const target = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: {
      courseId: COURSE_ID,
      view: "course_sources",
      expectedRevision: 19,
      mode: "target",
      targetKind: "study_unit",
      targetId
    },
    envelope: {
      ok: true,
      requestId: null,
      data: {
        contract: "aralearn.mcp-course-sources.v1",
        mode: "target",
        query: { targetKind: "study_unit" },
        items: [{
          targetId,
          effective: true,
          sourceLinks: [{
            sourceId,
            sourceRevision: 1,
            anchors: [
              { anchorId: "anchor-a", anchorRevision: 1 },
              { anchorId: "anchor-b", anchorRevision: 1 }
            ]
          }]
        }],
        nextCursor: null
      }
    }
  });
  assert.match(target.message, /conteúdo.*1 Fonte.*2 Âncoras/u);
  assert.match(target.message, /Abra apenas as Fontes necessárias/u);
  assert.equal(target.message.includes(sourceId), false);
  assert.equal(target.message.includes(targetId), false);
  assertHumanProjection(target);

  const signedUrl = "https://storage.example.test/signed/private.pdf?token=secret";
  const attachment = projectConversationalAuthoringToolSuccess({
    toolName: "lerCurso",
    rawArguments: {
      courseId: COURSE_ID,
      view: "course_source_attachment",
      expectedRevision: 19,
      attachmentOperation: "download",
      sourceId,
      sourceRevision: 1,
      contentHash: HASH,
      includeAttachmentDownloadUrl: true
    },
    envelope: {
      ok: true,
      requestId: null,
      data: {
        contract: "aralearn.mcp-course-source-attachment-access.v1",
        operation: "download",
        sourceId,
        sourceRevision: 1,
        signedUrl,
        expiresAt: "2026-08-29T12:01:00Z"
      }
    }
  });
  assert.match(attachment.message, /autorizado temporariamente/u);
  assert.match(attachment.message, /resultado estruturado/u);
  assert.equal(attachment.message.includes(signedUrl), false);
  assert.equal(attachment.message.includes(sourceId), false);
  assertHumanProjection(attachment);
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

test("checkpoints devolvem ações humanas específicas sem expor o deep link", () => {
  const deepLink = `https://example.test/#/authoring/courses/${COURSE_ID}`;
  const planning = projectConversationalAuthoringToolSuccess({
    toolName: "alterarCurso",
    rawArguments: { operation: "update_instructional_plan" },
    envelope: {
      ok: true,
      requestId: REQUEST_ID,
      data: { changed: true, deepLink: `${deepLink}?section=planning` }
    }
  });
  const inspection = projectConversationalAuthoringToolSuccess({
    toolName: "alterarCurso",
    rawArguments: { operation: "create_inspection_focus" },
    envelope: {
      ok: true,
      requestId: REQUEST_ID,
      data: { changed: true, deepLink: `${deepLink}?section=content&inspectionFocusId=foco` }
    }
  });

  assert.equal(planning.action?.label, "Abrir o planejamento no AraLearn");
  assert.equal(inspection.action?.label, "Abrir as Unidades no AraLearn");
  assert.equal(planning.message.includes(deepLink), false);
  assert.equal(inspection.message.includes(deepLink), false);
  assertHumanProjection(planning);
  assertHumanProjection(inspection);
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
  assert.match(projected.message, /recuperar o recibo/iu);
  assert.doesNotMatch(projected.message, /foi gravada|foi concluída\./u);
  assertHumanProjection(projected);
});

test("falhas mecânicas recuperáveis ficam com o agente, não com a pessoa", () => {
  const invalid = projectConversationalAuthoringError({
    envelope: {
      ok: false,
      requestId: REQUEST_ID,
      error: {
        code: "invalid_tool_argument",
        recovery: { strategy: "correct_and_retry", retryable: true }
      }
    }
  });
  const oversized = projectConversationalAuthoringError({
    envelope: {
      ok: false,
      requestId: REQUEST_ID,
      error: {
        code: "request_too_large",
        recovery: { strategy: "split_and_retry", retryable: true }
      }
    }
  });

  assert.match(invalid.message, /Vou corrigir a chamada e tentar novamente/iu);
  assert.match(oversized.message, /Vou dividir a operação e repetir os lotes/iu);
  assert.doesNotMatch(invalid.message, /Revise|Corrija|Tente/iu);
  assert.doesNotMatch(oversized.message, /Reduza|Divida|Tente/iu);
  assertHumanProjection(invalid);
  assertHumanProjection(oversized);
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
  assertHumanProjection(disconnected);

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
  assertHumanProjection(forbidden);
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
  assertHumanProjection(projected);
});
