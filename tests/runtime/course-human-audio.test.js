import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { COURSE_HUMAN_TASKS, executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { createAuthoringActionHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import { ARALEARN_MCP_PROTOCOL_VERSION, createAuthoringMcpHandler } from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { createDefaultCourseAudioConfig, COURSE_MEDIA_COURSE_MAX_BYTES } from "../../src/domain/courseMedia.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = { actorId: "20000000-0000-4000-8000-000000000001", scopes: ["authoring:read", "authoring:write"] };
const ORIGIN = "https://chatgpt.com";
const BASE = "https://project.example/functions/v1/aralearn-authoring-action";
const MCP = "https://project.example/functions/v1/aralearn-authoring-mcp";
function wave() {
  const bytes = new Uint8Array(524); const view = new DataView(bytes.buffer);
  for (const [offset, text] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]]) bytes.set(new TextEncoder().encode(text), offset);
  for (const [offset, value] of [[4, 516], [16, 16], [24, 24000], [28, 48000], [40, 480]]) view.setUint32(offset, value, true);
  for (const [offset, value] of [[20, 1], [22, 1], [32, 2], [34, 16]]) view.setUint16(offset, value, true);
  return bytes;
}
const MEDIA = { contentHash: createHash("sha256").update(wave()).digest("hex"), byteSize: 524, mediaType: "audio/wav" };
const descriptor = { download_url: "https://files.oaiusercontent.com/som?sig=hidden-fixture", file_id: "file-synthetic-audio", mime_type: "audio/wav", file_name: "som.wav" };
function fixture(overrides = {}) {
  const calls = []; let downloads = 0;
  const adapter = {
    calls, get downloads() { return downloads; }, publicAppUrl: "https://app.example/",
    async resolvePrincipal() { return { ...PRINCIPAL, authenticationKind: "oauth" }; },
    async resolveActionPrincipal() { return { ...PRINCIPAL, authenticationKind: "action" }; },
    async listCourses() { return { items: [{ courseId: COURSE_ID, title: "Fonética" }], hasMore: false, nextCursor: null }; },
    async getCourse() { return { courseId: COURSE_ID, revision: 7, title: "Fonética" }; },
    async fetchImpl() { downloads++; return new Response(wave(), { headers: { "content-type": "audio/wav" } }); },
    async ingestCourseAudio(input) {
      calls.push(input);
      return { contract: "aralearn.course-media-ingestion.v1", courseId: COURSE_ID, courseRevision: 8,
        requestId: input.requestId, idempotent: false, changed: true, operation: "ingest_audio", media: MEDIA, fileName: "som.wav" };
    },
    async getCourseMedia(input) {
      calls.push(input);
      return { contract: "aralearn.course-media.v1", courseId: COURSE_ID, courseRevision: 7, mode: "catalog",
        audioConfig: createDefaultCourseAudioConfig(), storage: { uniqueBytes: 524, maxUniqueBytes: COURSE_MEDIA_COURSE_MAX_BYTES },
        items: [{ ...MEDIA, fileName: "som.wav" }], nextCursor: null };
    }, ...overrides
  };
  return adapter;
}
const call = (adapter, name = "guardar_audio", args = { curso: "Fonética", audio: descriptor }, principal = PRINCIPAL) =>
  executeHumanCourseTask({ adapter, principal, name, rawArguments: args });

test("guardar áudio verifica recibo e transmite bytes mantendo somente referência lógica no contexto", async () => {
  const adapter = fixture(); const result = await call(adapter);
  assert.deepEqual(adapter.calls[0].bytes, wave()); assert.equal(adapter.calls[0].expectedCourseRevision, 7);
  assert.equal(adapter.calls[0].principal.actorId, PRINCIPAL.actorId); assert.equal(adapter.downloads, 1);
  assert.deepEqual(result.context.storedAudio, { ...MEDIA, fileName: "som.wav" });
  assert.doesNotMatch(JSON.stringify(result), /hidden-fixture|file-synthetic|oaiusercontent|storage\/|requestId|courseRevision/u);
  assert.match(result.nextDecision, /alternativa textual/u);
});

test("áudio usa mesmo requestId/bytes no replay; CAS conhecido relê a revisão com identidade nova", async () => {
  const adapter = fixture(); const commit = adapter.ingestCourseAudio;
  let attempts = 0;
  adapter.ingestCourseAudio = async input => {
    const receipt = await commit(input); attempts++;
    if (attempts === 1) throw new AuthoringApiError(503, "course_media_unavailable", "temporário");
    return { ...receipt, idempotent: true };
  };
  await call(adapter);
  assert.equal(adapter.calls.length, 2); assert.equal(adapter.calls[0].requestId, adapter.calls[1].requestId);
  assert.equal(adapter.calls[0].bytes, adapter.calls[1].bytes); assert.equal(adapter.downloads, 1);

  const stale = fixture(); const save = stale.ingestCourseAudio; let revision = 7;
  stale.getCourse = async () => ({ courseId: COURSE_ID, title: "Fonética", revision });
  stale.ingestCourseAudio = async input => {
    const receipt = await save(input);
    if (revision === 7) { revision = 8; throw new AuthoringApiError(409, "stale_course_state", "mudou"); }
    return { ...receipt, courseRevision: 9 };
  };
  await call(stale);
  assert.deepEqual(stale.calls.map(input => input.expectedCourseRevision), [7, 8]);
  assert.notEqual(stale.calls[0].requestId, stale.calls[1].requestId); assert.equal(stale.downloads, 1);
});

test("recibo divergente mantém erro incerto após replay e não troca intenção", async () => {
  for (const invalid of [{ courseId: PRINCIPAL.actorId }, { requestId: "outro-request" }, { courseRevision: 1 },
    { media: { ...MEDIA, contentHash: "f".repeat(64) } }, { extra: true }]) {
    const adapter = fixture(); const commit = adapter.ingestCourseAudio;
    adapter.ingestCourseAudio = async input => ({ ...await commit(input), ...invalid });
    await assert.rejects(() => call(adapter), error => error.code === "course_media_write_uncertain");
    assert.equal(adapter.calls.length, 2); assert.equal(adapter.calls[0].requestId, adapter.calls[1].requestId);
    assert.equal(adapter.downloads, 1);
  }
});

test("sem escopo de escrita ou sem acesso ao curso nenhum arquivo é baixado", async () => {
  const adapter = fixture();
  await assert.rejects(() => call(adapter, "guardar_audio", undefined, { ...PRINCIPAL, scopes: ["authoring:read"] }));
  assert.equal(adapter.downloads, 0);
  adapter.getCourse = async () => { throw new AuthoringApiError(403, "forbidden", "sem acesso"); };
  await assert.rejects(() => call(adapter), error => error.status === 403); assert.equal(adapter.downloads, 0);
});

test("biblioteca usa página humana, revisão estável e não baixa gravações", async () => {
  const adapter = fixture(); const get = adapter.getCourseMedia;
  adapter.getCourseMedia = async input => ({ ...await get(input), nextCursor: input.cursor ? null : MEDIA.contentHash });
  const result = await call(adapter, "consultar_audios", { curso: "Fonética", pagina: 2 });
  assert.deepEqual(adapter.calls.map(input => input.expectedRevision), [7, 7]);
  assert.deepEqual(adapter.calls.map(input => input.cursor), [null, MEDIA.contentHash]);
  assert.equal(result.context.pagina, 2); assert.equal(result.context.temMais, false);
  assert.deepEqual(result.context.audios[0].storedAudio, { ...MEDIA, fileName: "som.wav" });
  assert.equal(adapter.downloads, 0);
  adapter.getCourseMedia = async input => ({ ...await get(input), courseRevision: 8 });
  await assert.rejects(() => call(adapter, "consultar_audios", { curso: "Fonética" }), error => error.code === "stale_course_state");
});

test("Actions e MCP aceitam o descritor do cliente sem confundir áudio com PDF", async () => {
  for (const channel of ["action", "mcp"]) {
    const adapter = fixture();
    const handler = channel === "action" ? createAuthoringActionHandler({ adapter, allowedOrigins: new Set([ORIGIN]), actionBaseUrl: BASE, publicAppUrl: adapter.publicAppUrl })
      : createAuthoringMcpHandler({ adapter, allowedOrigins: new Set([ORIGIN]), resourceUrl: MCP, authorizationServer: "https://project.example/auth/v1" });
    const args = channel === "action" ? { curso: "Fonética", openaiFileIdRefs: [{ id: descriptor.file_id, name: descriptor.file_name,
      mime_type: descriptor.mime_type, download_link: descriptor.download_url }] } : { curso: "Fonética", audio: descriptor };
    const body = channel === "action" ? args : { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "guardar_audio", arguments: args } };
    const response = await handler(new Request(channel === "action" ? `${BASE}/guardar_audio` : MCP, { method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-token", "Content-Type": "application/json",
        Accept: "application/json, text/event-stream", "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION }, body: JSON.stringify(body) }));
    assert.equal(response.status, 200, `${channel}: ${await response.clone().text()}`);
    const payload = await response.json();
    const result = channel === "action" ? payload : payload.result.structuredContent;
    assert.deepEqual(result.context.storedAudio, { ...MEDIA, fileName: "som.wav" });
    assert.equal(adapter.calls.length, 1); assert.equal(adapter.downloads, 1);
    assert.doesNotMatch(JSON.stringify(payload), /hidden-fixture|file-synthetic|oaiusercontent/u);
  }
  assert.deepEqual(COURSE_HUMAN_TASKS.find(t => t.name === "guardar_audio")._meta["openai/fileParams"], ["audio"]);
  assert.deepEqual(COURSE_HUMAN_TASKS.find(t => t.name === "incorporar_pdf_como_fonte")._meta["openai/fileParams"], ["pdf"]);
});

test("descoberta dos5 pacotes ferramenta traz um contrato focal por chamada, sem enum por canal", async () => {
  const adapter = fixture();
  for (const id of ["calculator", "grammar", "dictionary", "reading", "audio"]) {
    const result = await call(adapter, "consultar_componentes", { componente: `aralearn.resource.${id}@1.0.0` });
    const contract = result.context.componentAuthoringContract;
    assert.equal(contract.referencia, `aralearn.resource.${id}@1.0.0`);
    assert.equal(typeof contract.ferramenta.label, "string");
    assert.equal(contract.modeloDeInstancia.package, `aralearn.resource.${id}`);
    assert.deepEqual(contract.slots, ["content"]);
    assert.equal(Object.hasOwn(result.context, "components"), false);
    assert.ok(JSON.stringify(result).length < 16000);
  }
});

test("fonte focal fornece alvos PDF lógicos para conteúdo sem expor caminho Storage", async () => {
  const source = { sourceId: "source-pronunciation", revision: 3, title: "Guia de pronúncia",
    attachments: [{ contentHash: MEDIA.contentHash, byteSize: 123, mediaType: "application/pdf",
      storagePath: `${COURSE_ID}/${MEDIA.contentHash}.pdf`, createdAt: "2026-09-05T12:00:00Z", publicFileAccess: "inherit" }] };
  const adapter = fixture({ async getCourseSources() { return { items: [source], nextCursor: null }; } });
  const result = await call(adapter, "consultar_fontes", { curso: "Fonética", fonte: "Guia de pronúncia" });
  assert.deepEqual(result.context.arquivosParaConteudo, [{ rotulo: "PDF 1", sourceAttachmentTarget: {
    kind: "source_attachment", sourceId: source.sourceId, sourceRevision: 3, contentHash: MEDIA.contentHash } }]);
  assert.doesNotMatch(JSON.stringify(result), /storagePath|storage_path|\.pdf|\/object\/|signedUrl/u);
  assert.equal(adapter.downloads, 0);
});

test("MCP e Actions orientam reler biblioteca depois de confirmação incerta, sem nova escrita cega", async () => {
  for (const channel of ["action", "mcp"]) {
    const adapter = fixture(); const commit = adapter.ingestCourseAudio;
    adapter.ingestCourseAudio = async input => ({ ...await commit(input), media: { ...MEDIA, contentHash: "f".repeat(64) } });
    const handler = channel === "action" ? createAuthoringActionHandler({ adapter, allowedOrigins: new Set([ORIGIN]), actionBaseUrl: BASE, publicAppUrl: adapter.publicAppUrl })
      : createAuthoringMcpHandler({ adapter, allowedOrigins: new Set([ORIGIN]), resourceUrl: MCP, authorizationServer: "https://project.example/auth/v1" });
    const args = channel === "action" ? { curso: "Fonética", openaiFileIdRefs: [{ id: descriptor.file_id, name: descriptor.file_name,
      mime_type: descriptor.mime_type, download_link: descriptor.download_url }] } : { curso: "Fonética", audio: descriptor };
    const body = channel === "action" ? args : { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "guardar_audio", arguments: args } };
    const response = await handler(new Request(channel === "action" ? `${BASE}/guardar_audio` : MCP, { method: "POST",
      headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-token", "Content-Type": "application/json",
        Accept: "application/json, text/event-stream", "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION }, body: JSON.stringify(body) }));
    const payload = await response.json();
    const failure = channel === "action" ? payload : payload.result.structuredContent;
    assert.equal(failure.error.code, "course_media_write_uncertain");
    assert.equal(failure.error.retryable, false); assert.match(failure.nextDecision, /Consulte os áudios/u);
    assert.equal(adapter.calls.length, 2); assert.equal(adapter.calls[0].requestId, adapter.calls[1].requestId);
  }
});
