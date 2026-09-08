import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { COURSE_HUMAN_TASKS, executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";

const COURSE_ID = "99270000-0000-4000-8000-000000000101";
const PRINCIPAL = { actorId: "99270000-0000-4000-8000-000000000001", scopes: ["authoring:read", "authoring:write"] };
const explanation = { title: "Quadros e interfaces", content: [{ id: "shared-p", package: "aralearn.resource.paragraph", version: "1.0.0",
  data: { text: "Um quadro transporta dados entre interfaces." } }] };
const binding = { explicacao: "Quadros", relacao: "supported_by", papeis: ["tecnica_conceitual"],
  ocorrencias: [{ lugar: "conteudo", recurso: 1, folha: "text", trecho: "Um quadro", sufixo: " transporta" }] };

function fixture({ content = explanation } = {}) {
  let revision = 7;
  const reads = [], writes = [];
  const source = { sourceId: "source", revision: 1, title: "Fonte sintética", anchors: [], attachments: [] };
  const retainedLink = { linkId: "another", sourceId: "another-source", relation: "informed_by", roles: ["technical_conceptual"], anchors: [], occurrences: [] };
  const adapter = {
    publicAppUrl: "https://app.example/", reads, writes,
    async listCourses() { return { items: [{ courseId: COURSE_ID, title: "Redes sintéticas" }], hasMore: false, nextCursor: null }; },
    async getCourse() { return { courseId: COURSE_ID, title: "Redes sintéticas", revision }; },
    async getCourseInstructionalPlan() { return { courseRevision: revision, plan: { id: "plan", title: "Redes sintéticas",
      parts: [{ id: "part", position: 0, title: "Parte", microsequences: [{ id: "ms", title: "Quadros", productionPosition: 0 }] }] } }; },
    async listCourseStudyUnits() { assert.fail("Fonte da Explicação não resolve nem duplica unidade."); },
    async listCourseEntities(input) {
      assert.equal(input.expectedRevision, revision);
      return { items: [{ entityType: "microsequence", entityId: "ms", version: 9, content: { title: "Quadros", explanation: content } }], hasMore: false, nextCursor: null };
    },
    async getCourseSources(input) {
      reads.push(structuredClone(input));
      if (input.mode === "source") return { source, items: input.sourceId === source.sourceId ? [source] : [], nextCursor: null };
      if (input.mode === "target") return { items: [{ targetKind: input.targetKind, targetId: input.targetId, sourceLinks: [retainedLink] }], nextCursor: null };
      return { items: [source], nextCursor: null };
    },
    async executeCourseSourceCommand(input) {
      writes.push(structuredClone(input)); revision += 1;
      return { changed: true, courseRevision: revision };
    }
  };
  return adapter;
}
const call = (adapter, name, args) => executeHumanCourseTask({ adapter, principal: PRINCIPAL, name,
  rawArguments: { curso: "Redes sintéticas", ...args } });

test("schema de vínculo escolhe uma única superfície e não expõe aprovação", () => {
  const schema = COURSE_HUMAN_TASKS.find(({ name }) => name === "manter_fonte").inputSchema;
  const validate = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validate({ curso: "Redes sintéticas", fonte: "Fonte sintética", vinculos: [binding] }), true, JSON.stringify(validate.errors));
  assert.equal(validate({ curso: "Redes sintéticas", fonte: "Fonte sintética", vinculos: [{ ...binding, unidade: 1 }] }), false);
  assert.equal(validate({ curso: "Redes sintéticas", fonte: "Fonte sintética", vinculos: [{ ...binding, aprovado: true }] }), false);
});

test("consulta de fonte do apoio usa identidade MS, inclusive contexto de uma Fonte", async () => {
  for (const args of [{ explicacao: "Quadros" }, { explicacao: 1, fonte: "Fonte sintética" }]) {
    const adapter = fixture();
    await call(adapter, "consultar_fontes", args);
    const read = adapter.reads.find(input => input.mode === (args.fonte ? "source" : "target"));
    assert.equal(read.targetKind, "microsequence_explanation");
    assert.equal(read.targetId, "ms");
    assert.equal(read.mode, args.fonte ? "source" : "target");
    assert.equal(adapter.writes.length, 0);
  }
  await assert.rejects(() => call(fixture(), "consultar_fontes", { unidade: 1, explicacao: "Quadros" }),
    { code: "invalid_human_task_argument" });
});

test("leitura do apoio identifica vínculos e âncoras pela ficha corrente sem IDs técnicos", async () => {
  const adapter = fixture();
  const sourceA = "10000000-0000-4000-8000-000000000001";
  const sourceB = "10000000-0000-4000-8000-000000000002";
  const anchorA = "20000000-0000-4000-8000-000000000001";
  const anchorB = "20000000-0000-4000-8000-000000000002";
  const links = [sourceA, sourceB, sourceB].map((sourceId, index) => ({ sourceId,
    linkId: `30000000-0000-4000-8000-00000000000${index + 1}`, relation: "quoted_from",
    roles: ["recommended_reading"], anchors: [{ anchorId: index === 0 ? anchorA : anchorB }],
    occurrences: [{ occurrenceId: "40000000-0000-4000-8000-000000000001",
      resourceId: "private-resource", slot: "content", path: "text", quote: "Um quadro", prefix: null, suffix: null }] }));
  const details = [
    { sourceId: sourceA, title: "Fonte de interfaces", citationText: "Autoria A. Interfaces.", status: "active",
      anchors: [{ anchorId: anchorA, status: "active", humanLocator: "seção 1",
        verificationExcerpt: "Uma interface liga sistemas.", selector: { kind: "whole_source" }, needsReverification: false }] },
    { sourceId: sourceB, title: "Fonte de comparação", citationText: "Autoria B. Comparação.", status: "retired",
      anchors: [{ anchorId: "unrelated" }, { anchorId: anchorB, status: "retired", humanLocator: "página 1, seção 2",
        verificationExcerpt: "Um quadro permite a comparação.", selector: { kind: "whole_source" }, needsReverification: true }],
      attachments: [{ storagePath: "private-pdf-path", contentHash: "a".repeat(64) }] }
  ];
  const reads = [];
  adapter.getCourseSources = async input => {
    reads.push(input);
    return { items: input.mode === "target" ? [{ sourceLinks: links }] : details.filter(item => item.sourceId === input.sourceId), nextCursor: null };
  };
  const deadlineAt = Date.now() + 30_000;
  const result = await executeHumanCourseTask({ adapter, principal: PRINCIPAL, deadlineAt,
    name: "consultar_fontes", rawArguments: { curso: "Redes sintéticas", explicacao: "Quadros" } });
  const actual = result.context.sources.items[0].sourceLinks;
  assert.deepEqual(actual.map(link => [link.posicao, link.fonte.titulo, link.fonte.status, link.anchors[0].posicao]),
    [[1, "Fonte de interfaces", "active", 1], [2, "Fonte de comparação", "retired", 2], [3, "Fonte de comparação", "retired", 2]]);
  assert.equal(actual[1].anchors[0].humanLocator, "página 1, seção 2");
  assert.equal(actual[1].anchors[0].verificationExcerpt, "Um quadro permite a comparação.");
  assert.equal(actual[1].anchors[0].needsReverification, true);
  assert.equal(actual[1].occurrences[0].quote, "Um quadro");
  assert.equal(reads.filter(input => input.mode === "source").length, 2, "a mesma Fonte é lida uma vez");
  assert.ok(reads.every(input => input.expectedRevision === 7 && input.deadlineAt === deadlineAt && input.limit === 1));
  assert.doesNotMatch(JSON.stringify(result.context), /[0-9a-f]{8}-[0-9a-f-]{27}|sourceId|linkId|anchorId|requestId|storagePath|private-pdf-path|private-resource/u);
  assert.equal(adapter.writes.length, 0);
});

test("leitura do apoio registra Fonte ou Âncora ausente sem inventar rótulo", async () => {
  const adapter = fixture();
  adapter.getCourseSources = async input => ({ items: input.mode === "target" ? [{ sourceLinks: [
    { sourceId: "missing", anchors: [{ anchorId: "missing" }], occurrences: [] },
    { sourceId: "available", anchors: [{ anchorId: "missing" }], occurrences: [] }
  ] }] : input.sourceId === "available" ? [{ sourceId: "available", title: null, citationText: "Citação sem título", status: "active", anchors: [] }] : [], nextCursor: null });
  const result = await call(adapter, "consultar_fontes", { explicacao: "Quadros" });
  const links = result.context.sources.items[0].sourceLinks;
  assert.deepEqual(links[0].fonte, { localizada: false });
  assert.deepEqual(links[0].anchors, [{ localizada: false }]);
  assert.deepEqual(links[1].fonte, { localizada: true, titulo: null, citacao: "Citação sem título", status: "active" });
  assert.deepEqual(links[1].anchors, [{ localizada: false }]);
});

test("leitura do apoio recusa ficha de outra Fonte e não disfarça conflito, recusa ou timeout como ausência", async () => {
  for (const errorCode of [null, "stale_course_state", "access_denied", "request_timeout"]) {
    const adapter = fixture();
    adapter.getCourseSources = async input => {
      if (input.mode === "target") return { items: [{ sourceLinks: [{ sourceId: "expected", anchors: [] }] }], nextCursor: null };
      if (errorCode) throw Object.assign(new Error("A leitura falhou."), { code: errorCode });
      return { items: [{ sourceId: "wrong", title: "Não divulgar" }], nextCursor: null };
    };
    await assert.rejects(() => call(adapter, "consultar_fontes", { explicacao: "Quadros" }),
      { code: errorCode ?? "course_service_unavailable" });
  }
});

test("vínculo do apoio relê versão da entidade, preserva outras fontes e localiza bloco salvo", async () => {
  const adapter = fixture();
  await call(adapter, "manter_fonte", { fonte: "Fonte sintética", vinculos: [binding] });
  assert.equal(adapter.writes.length, 1);
  const command = adapter.writes[0].command;
  assert.equal(command.targetKind, "microsequence_explanation");
  assert.equal(command.targetId, "ms");
  assert.equal(command.expectedTargetVersion, 9);
  assert.equal(command.sourceLinks.length, 2);
  assert.equal(command.sourceLinks[0].linkId, "another");
  assert.equal(command.sourceLinks[1].occurrences[0].resourceId, "shared-p");
  assert.equal(command.sourceLinks[1].occurrences[0].slot, "content");
  assert.equal(command.sourceLinks[1].occurrences[0].quote, "Um quadro");
  assert.equal(Object.hasOwn(command, "contentReview"), false);
});

test("apoio ausente e ocorrência fora de conteúdo falham antes de qualquer escrita", async () => {
  const absent = fixture({ content: null });
  await assert.rejects(() => call(absent, "manter_fonte", { fonte: "Fonte sintética", vinculos: [binding] }), { code: "explanation_not_materialized" });
  assert.equal(absent.writes.length, 0);
  const adapter = fixture();
  await assert.rejects(() => call(adapter, "manter_fonte", { fonte: "Fonte sintética",
    vinculos: [{ ...binding, ocorrencias: [{ ...binding.ocorrencias[0], lugar: "feedback" }] }] }), { code: "invalid_human_source_occurrence" });
  assert.equal(adapter.writes.length, 0);
});
