import test from "node:test";
import assert from "node:assert/strict";

import { UUID_PATTERN } from
  "../../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import { withTrustedCreationIdentities } from
  "../../supabase/functions/_shared/aralearn-authoring/trustedCreationIdentity.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";

const change = (requestId, operation, property, command) => ({
  requestId,
  courseId: COURSE_ID,
  operation,
  [property]: command
});

test("camada confiável gera IDs estáveis para Parte e itens formais sem tocar refs existentes", async () => {
  const cases = [
    ["add_part", { position: 0, title: "Fundamentos de Linux", intent: "Introduzir terminal." }, "id"],
    ["add_plan_item", {
      kind: "intended_learning_outcome", position: 0,
      statement: "Operar arquivos e permissões.", sourceLinks: []
    }, "id"],
    ["add_plan_item", {
      kind: "instructional_analysis_unit", position: 0,
      statement: "Distinguir caminhos, usuários e permissões.", sourceLinks: []
    }, "id"],
    ["add_plan_item", {
      kind: "evidence_requirement", position: 0,
      statement: "Resolver uma tarefa de permissões no terminal.", sourceLinks: []
    }, "id"],
    ["split_part", {
      partId: "20000000-0000-4000-8000-000000000002",
      newPartPosition: 1, title: "Prática", intent: "Aplicar.", microsequenceIds: []
    }, "newPartId"]
  ];

  for (const [index, [type, body, field]] of cases.entries()) {
    const input = change(
      `trusted-plan-creation-000${index}`,
      "update_instructional_plan",
      "planCommand",
      { type, ...body }
    );
    const first = await withTrustedCreationIdentities("alterarCurso", input);
    const replay = await withTrustedCreationIdentities("alterarCurso", input);
    assert.match(first.planCommand[field], UUID_PATTERN);
    assert.deepEqual(replay, first);
    assert.equal(Object.hasOwn(input.planCommand, field), false);
  }

  const existing = "30000000-0000-4000-8000-000000000003";
  const supplied = await withTrustedCreationIdentities("alterarCurso", change(
    "trusted-plan-existing-0001",
    "update_instructional_plan",
    "planCommand",
    { type: "add_part", id: existing, position: 0, title: "Compatível", intent: "Preservar." }
  ));
  assert.equal(supplied.planCommand.id, existing);
});

test("Fonte, Âncora, Observação, auditoria e variantes recebem IDs por slot idempotente", async () => {
  const source = await withTrustedCreationIdentities("alterarCurso", change(
    "trusted-source-creation-0001",
    "update_course_sources",
    "sourceCommand",
    { type: "save_source", expectedSourceRevision: 0, source: { title: "Edital" } }
  ));
  assert.match(source.sourceCommand.sourceId, UUID_PATTERN);

  const anchor = await withTrustedCreationIdentities("alterarCurso", change(
    "trusted-anchor-creation-0001",
    "update_course_sources",
    "sourceCommand",
    { type: "save_anchor", expectedAnchorRevision: 0, sourceId: source.sourceCommand.sourceId }
  ));
  assert.match(anchor.sourceCommand.anchorId, UUID_PATTERN);

  const annotation = await withTrustedCreationIdentities("alterarCurso", change(
    "trusted-annotation-creation-0001",
    "update_anchored_annotations",
    "annotationCommand",
    { type: "create_anchored_annotation", target: { kind: "course", id: COURSE_ID } }
  ));
  assert.match(annotation.annotationCommand.annotationId, UUID_PATTERN);

  const auditInput = change(
    "trusted-audit-creation-0001",
    "update_audit_cycle",
    "auditCommand",
    {
      type: "record_audit",
      checks: [{ dimension: "pedagogical_quality" }, { dimension: "factual_quality" }],
      findings: [{ checkIndex: 1, code: "fact.missing" }]
    }
  );
  const audit = await withTrustedCreationIdentities("alterarCurso", auditInput);
  const auditReplay = await withTrustedCreationIdentities("alterarCurso", auditInput);
  assert.match(audit.auditCommand.auditRunId, UUID_PATTERN);
  assert.match(audit.auditCommand.checks[0].checkId, UUID_PATTERN);
  assert.match(audit.auditCommand.findings[0].findingId, UUID_PATTERN);
  assert.equal(audit.auditCommand.findings[0].checkId, audit.auditCommand.checks[1].checkId);
  assert.equal(Object.hasOwn(audit.auditCommand.findings[0], "checkIndex"), false);
  assert.deepEqual(auditReplay, audit);

  const variants = await withTrustedCreationIdentities("alterarCurso", change(
    "trusted-variant-creation-0001",
    "update_course_variants",
    "variantCommand",
    { type: "create_comparison_variants", variants: [] }
  ));
  assert.match(variants.variantCommand.comparisonSetId, UUID_PATTERN);
});

test("composição gera entidades e resolve relações novas por índices do próprio lote", async () => {
  const input = {
    requestId: "trusted-composition-creation-0001",
    courseId: COURSE_ID,
    operation: "commit_course_composition",
    upserts: [
      { entityType: "module", parentType: null, position: 0, content: {} },
      { entityType: "lesson", parentType: "module", parentUpsertIndex: 0, position: 0, content: {} },
      { entityType: "microsequence", parentType: "lesson", parentUpsertIndex: 1, position: 0, content: {} },
      { entityType: "study_unit", parentType: "microsequence", parentUpsertIndex: 2, position: 1, content: {} }
    ],
    sourceAttributionApplications: [{ studyUnitUpsertIndex: 3, sourceLinks: [] }]
  };
  const result = await withTrustedCreationIdentities("alterarCurso", input);
  const replay = await withTrustedCreationIdentities("alterarCurso", input);
  for (const entity of result.upserts) assert.match(entity.entityId, UUID_PATTERN);
  assert.equal(result.upserts[0].parentId, null);
  assert.equal(result.upserts[1].parentId, result.upserts[0].entityId);
  assert.equal(result.upserts[2].parentId, result.upserts[1].entityId);
  assert.equal(result.upserts[3].parentId, result.upserts[2].entityId);
  assert.equal(
    result.sourceAttributionApplications[0].studyUnitId,
    result.upserts[3].entityId
  );
  assert.deepEqual(replay, result);
});

test("composição resolve ramificação e dependências entre Microssequências novas sem IDs do agente", async () => {
  const input = {
    requestId: "trusted-microsequence-relations-0001",
    courseId: COURSE_ID,
    operation: "commit_course_composition",
    upserts: [
      { entityType: "module", parentType: null, position: 0, content: {} },
      { entityType: "lesson", parentType: "module", parentUpsertIndex: 0, position: 0, content: {} },
      {
        entityType: "microsequence",
        parentType: "lesson",
        parentUpsertIndex: 1,
        position: 0,
        content: { dependsOn: [] }
      },
      {
        entityType: "microsequence",
        parentType: "lesson",
        parentUpsertIndex: 1,
        position: 1,
        content: {
          branchOf: null,
          branchOfUpsertIndex: 2,
          dependsOn: ["microsequence-existing"],
          dependsOnUpsertIndexes: [2]
        }
      }
    ],
    sourceAttributionApplications: []
  };
  const result = await withTrustedCreationIdentities("alterarCurso", input);
  const replay = await withTrustedCreationIdentities("alterarCurso", input);
  assert.equal(result.upserts[3].content.branchOf, result.upserts[2].entityId);
  assert.deepEqual(result.upserts[3].content.dependsOn, [
    "microsequence-existing",
    result.upserts[2].entityId
  ]);
  assert.equal(Object.hasOwn(result.upserts[3].content, "branchOfUpsertIndex"), false);
  assert.equal(Object.hasOwn(result.upserts[3].content, "dependsOnUpsertIndexes"), false);
  assert.deepEqual(replay, result);
});

test("relações novas entre Microssequências rejeitam ambiguidade, tipo e ordem incompatíveis", async () => {
  const composition = (content, target = {
    entityType: "microsequence",
    parentType: "lesson",
    parentId: "lesson-existing",
    position: 0,
    content: { dependsOn: [] }
  }) => ({
    requestId: "trusted-microsequence-invalid-0001",
    courseId: COURSE_ID,
    operation: "commit_course_composition",
    upserts: [target, {
      entityType: "microsequence",
      parentType: "lesson",
      parentId: "lesson-existing",
      position: 1,
      content
    }],
    sourceAttributionApplications: []
  });
  await assert.rejects(
    withTrustedCreationIdentities("alterarCurso", composition({
      branchOf: "microsequence-existing",
      branchOfUpsertIndex: 0,
      dependsOn: []
    })),
    /branchOf existente ou branchOfUpsertIndex/u
  );
  await assert.rejects(
    withTrustedCreationIdentities("alterarCurso", composition({
      dependsOn: [],
      dependsOnUpsertIndexes: [0]
    }, {
      entityType: "topic",
      parentType: "lesson",
      parentId: "lesson-existing",
      position: 0,
      content: {}
    })),
    /Microssequência compatível/u
  );
  await assert.rejects(
    withTrustedCreationIdentities("alterarCurso", {
      ...composition({ dependsOn: [] }),
      upserts: [
        {
          entityType: "microsequence",
          parentType: "lesson",
          parentId: "lesson-existing",
          position: 0,
          content: { dependsOn: [], dependsOnUpsertIndexes: [1] }
        },
        {
          entityType: "microsequence",
          parentType: "lesson",
          parentId: "lesson-existing",
          position: 1,
          content: { dependsOn: [] }
        }
      ]
    }),
    /Microssequência compatível/u
  );
  await assert.rejects(
    withTrustedCreationIdentities("alterarCurso", composition({
      dependsOn: Array.from({ length: 256 }, (_, index) => `existing-${index}`),
      dependsOnUpsertIndexes: [0]
    })),
    /excede o limite de 256/u
  );
});

test("início de materialização gera materialização e etapas, mas replay mantém o payload", async () => {
  const input = change(
    "trusted-materialization-creation-0001",
    "advance_part_materialization",
    "materializationCommand",
    {
      operation: "start",
      authoringPartId: "40000000-0000-4000-8000-000000000004",
      expectedMaterializationVersion: 0,
      authoringPartVersion: 1,
      steps: [
        { position: 0, kind: "context_load", targetDidacticMicrosequenceId: null, productionPosition: null },
        { position: 1, kind: "validation", targetDidacticMicrosequenceId: null, productionPosition: null }
      ]
    }
  );
  const result = await withTrustedCreationIdentities("alterarCurso", input);
  const replay = await withTrustedCreationIdentities("alterarCurso", input);
  assert.match(result.materializationCommand.materializationId, UUID_PATTERN);
  result.materializationCommand.steps.forEach((step) => assert.match(step.id, UUID_PATTERN));
  assert.notEqual(
    result.materializationCommand.steps[0].id,
    result.materializationCommand.steps[1].id
  );
  assert.deepEqual(replay, result);
});

test("atualizações preservam identidades existentes e nunca geram uma nova por engano", async () => {
  const cases = [
    change(
      "trusted-source-update-0001",
      "update_course_sources",
      "sourceCommand",
      { type: "save_source", expectedSourceRevision: 2, source: { title: "Edital" } }
    ),
    change(
      "trusted-anchor-update-0001",
      "update_course_sources",
      "sourceCommand",
      { type: "save_anchor", expectedAnchorRevision: 3, sourceId: "source-existing" }
    ),
    change(
      "trusted-correction-update-0001",
      "update_audit_cycle",
      "auditCommand",
      { type: "propose_authoring_correction", expectedCorrectionVersion: 1 }
    ),
    change(
      "trusted-materialization-record-0001",
      "advance_part_materialization",
      "materializationCommand",
      { operation: "record_step" }
    ),
    change(
      "trusted-materialization-finish-0001",
      "advance_part_materialization",
      "materializationCommand",
      { operation: "finish" }
    )
  ];
  for (const input of cases) {
    await assert.rejects(
      withTrustedCreationIdentities("alterarCurso", input),
      /precisa preservar a identidade lida/u
    );
  }

  const correction = await withTrustedCreationIdentities("alterarCurso", change(
    "trusted-correction-creation-0001",
    "update_audit_cycle",
    "auditCommand",
    { type: "propose_authoring_correction", expectedCorrectionVersion: 0 }
  ));
  assert.match(correction.auditCommand.correctionId, UUID_PATTERN);
});

test("relações do mesmo lote exigem exatamente identidade existente ou índice novo", async () => {
  const existingId = "50000000-0000-4000-8000-000000000005";
  const auditBase = {
    type: "record_audit",
    checks: [{ dimension: "pedagogical_quality" }]
  };
  for (const finding of [
    { code: "missing.reference" },
    { code: "duplicate.reference", checkId: existingId, checkIndex: 0 }
  ]) {
    await assert.rejects(
      withTrustedCreationIdentities("alterarCurso", change(
        "trusted-audit-reference-0001",
        "update_audit_cycle",
        "auditCommand",
        { ...auditBase, findings: [finding] }
      )),
      /exatamente uma referência/u
    );
  }

  const child = (references) => ({
    entityType: "lesson",
    parentType: "module",
    position: 0,
    content: {},
    ...references
  });
  for (const references of [{}, { parentId: existingId, parentUpsertIndex: 0 }]) {
    await assert.rejects(
      withTrustedCreationIdentities("alterarCurso", {
        requestId: "trusted-parent-reference-0001",
        courseId: COURSE_ID,
        operation: "commit_course_composition",
        upserts: [child(references)],
        sourceAttributionApplications: []
      }),
      /exatamente uma referência/u
    );
  }

  for (const references of [{}, { studyUnitId: existingId, studyUnitUpsertIndex: 0 }]) {
    await assert.rejects(
      withTrustedCreationIdentities("alterarCurso", {
        requestId: "trusted-study-unit-reference-0001",
        courseId: COURSE_ID,
        operation: "commit_course_composition",
        upserts: [],
        sourceAttributionApplications: [{ sourceLinks: [], ...references }]
      }),
      /exatamente uma referência/u
    );
  }
});

test("limites executáveis são verificados antes de derivar identidades em lote", async () => {
  const oversizedCases = [
    change(
      "trusted-audit-bound-0001",
      "update_audit_cycle",
      "auditCommand",
      { type: "record_audit", checks: Array.from({ length: 32 }, () => ({})) }
    ),
    {
      requestId: "trusted-composition-bound-0001",
      courseId: COURSE_ID,
      operation: "commit_course_composition",
      upserts: Array.from({ length: 201 }, () => ({}))
    },
    change(
      "trusted-materialization-bound-0001",
      "advance_part_materialization",
      "materializationCommand",
      { operation: "start", steps: Array.from({ length: 65 }, () => ({})) }
    )
  ];
  for (const input of oversizedCases) {
    await assert.rejects(
      withTrustedCreationIdentities("alterarCurso", input),
      /excede o limite/u
    );
  }

  await assert.rejects(
    withTrustedCreationIdentities("alterarCurso", {
      requestId: `trusted-${"x".repeat(129)}`,
      courseId: COURSE_ID,
      operation: "update_instructional_plan",
      planCommand: { type: "add_part" }
    }),
    /requestId excede/u
  );
});
