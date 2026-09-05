import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { createCourseCopyRequestIdentity } from "../../src/domain/courseCopy.js";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { createSyntheticWave, createAudioCourseRows, AUDIO_UNIT_ID } from "../fixtures/package/course-audio.js";

const enabled = process.env.ARALEARN_TEST_REAL_LOCAL_COPY_FILES === "1";
const sha256 = bytes => createHash("sha256").update(new Uint8Array(bytes)).digest("hex");

function syntheticPdf(marker) {
  const stream = `BT /F1 12 Tf 30 60 Td (Synthetic copy ${marker}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(document)); document += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  document += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(document);
}

test("API local: cópia conserva PDF e WAV após exclusão da origem e remove a última referência", {
  skip: !enabled && "Exige ARALEARN_TEST_REAL_LOCAL_COPY_FILES=1; usa somente stack local e fixtures próprias.", timeout: 180000
}, async () => {
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  const statusCommand = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npx";
  const statusArguments = process.platform === "win32"
    ? ["/d", "/s", "/c", "npx --yes supabase@2.115.0 status --output json"]
    : ["--yes", "supabase@2.115.0", "status", "--output", "json"];
  const status = JSON.parse(execFileSync(statusCommand, statusArguments,
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  assert.equal(new URL(status.API_URL).origin, "http://127.0.0.1:54321");
  const origin = "http://127.0.0.1:4182";
  const marker = randomUUID();
  const proof = { marker, type: "API e Storage locais reais; fixture sintética", checks: [], courseIds: [], userIds: [], cleanup: [] };
  const courses = new Set();
  let ownerId, api, primaryError, phase = "readiness";
  const auth = async (path, { body, admin = false, method = "POST" } = {}) => {
    const response = await fetch(`${status.API_URL}/auth/v1/${path}`, { method, redirect: "manual",
      headers: { apikey: admin ? status.SERVICE_ROLE_KEY : status.ANON_KEY,
        ...(admin ? { Authorization: `Bearer ${status.SERVICE_ROLE_KEY}` } : {}), "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, `Auth da fixture: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  const removeCourse = async courseId => {
    const receipt = await api.maintainCourse({ courseId, operation: "delete_owned_course", confirmed: true, requestId: randomUUID() });
    assert.equal(receipt.status, "completed"); courses.delete(courseId);
    proof.cleanup.push({ courseId, status: "completed" });
  };
  try {
    const health = await fetch(`${status.API_URL}/functions/v1/aralearn-course-api/v1/courses`, { headers: { Origin: origin, apikey: status.ANON_KEY } });
    assert.equal(health.status, 401, "A stack local deve ter Edge ativo e JWT obrigatório.");
    phase = "own account";
    const email = `copy-files-${marker}@example.test`, password = `Synthetic-306-${randomUUID()}-A9!`;
    const owner = await auth("admin/users", { admin: true, body: { email, password, email_confirm: true } });
    ownerId = owner.id; proof.userIds.push(ownerId);
    const session = await auth("token?grant_type=password", { body: { email, password } });
    api = new CourseApiClient({ projectUrl: status.API_URL, publishableKey: status.ANON_KEY,
      authClient: { getAccessToken: async () => session.access_token },
      fetchImpl: (url, options) => {
        assert.equal(new URL(url).origin, status.API_URL);
        const headers = new Headers(options.headers); headers.set("Origin", origin);
        return fetch(url, { ...options, headers, redirect: "manual" });
      } });
    const sourceId = "source-copy-files", anchorId = "page-copy-files", linkId = "link-copy-files";
    const original = await api.createCourse({ title: `Arquivos sintéticos ${marker}`, objective: "Conferir cópia independente de arquivos.", requestId: randomUUID() });
    const courseId = original.courseId; courses.add(courseId); proof.courseIds.push(courseId);
    let revision = 1;
    const wave = createSyntheticWave({ frequency: 400 + Number.parseInt(marker.slice(0, 4), 16) / 100, seconds: 0.15 });
    const pdf = syntheticPdf(marker);
    const media = { contentHash: sha256(wave), byteSize: wave.byteLength, mediaType: "audio/wav" };
    const pdfHash = sha256(pdf);
    proof.files = [{ kind: "wav", ...media }, { kind: "pdf", contentHash: pdfHash, byteSize: pdf.length }];
    phase = "audio ingestion";
    revision = (await api.uploadCourseAudio({ courseId, expectedCourseRevision: revision, requestId: randomUUID(),
      file: new File([wave], "sinal-sintetico.wav", { type: "audio/wav" }) })).courseRevision;
    phase = "source and PDF";
    revision = (await api.mutateCourseSources({ courseId, expectedRevision: revision, requestId: randomUUID(), sourceCommand: {
      type: "save_source", sourceId, expectedSourceRevision: 0, source: {
        kind: "document", defaultRoles: ["technical_conceptual"], title: "Documento sintético da cópia", authors: [],
        publicationDate: null, identifier: null, language: "pt-BR", citationMode: "manual", citationText: "Documento sintético para a prova local.",
        bibliographic: createEmptyCourseSourceBibliographicMetadata(), url: null, editionOrVersion: null,
        origin: "author_provided", availability: "private", verificationStatus: "author_verified", studyVisibility: "citation"
      }
    } })).courseRevision;
    revision = (await api.uploadCourseSourcePdf({ courseId, expectedRevision: revision, sourceId, sourceRevision: 1,
      requestId: randomUUID(), file: new File([pdf], "fonte-sintetica.pdf", { type: "application/pdf" }) })).courseRevision;
    revision = (await api.mutateCourseSources({ courseId, expectedRevision: revision, requestId: randomUUID(), sourceCommand: {
      type: "save_anchor", sourceId, sourceRevision: 1, anchorId, expectedAnchorRevision: 0, contentHash: pdfHash,
      selector: { kind: "page_range", startPage: 1, endPage: 1 }, humanLocator: "Página 1", verificationExcerpt: null
    } })).courseRevision;
    phase = "unit with audio and source link";
    const rows = createAudioCourseRows(courseId, media, media);
    const audio = rows.find(row => row.entityId === AUDIO_UNIT_ID).content.content.find(instance => instance.package === "aralearn.resource.audio");
    audio.data.tracks = audio.data.tracks.filter(track => track.id === "tone-wave");
    const sourceLinks = [{ linkId, sourceId, relation: "informed_by", roles: ["technical_conceptual"], anchors: [{ anchorId }], occurrences: [] }];
    revision = (await api.commitCourseStructuralComposition({ courseId, expectedRevision: revision, requestId: randomUUID(), upserts: rows, deletes: [],
      sourceAttributionApplications: rows.filter(row => row.entityType === "study_unit")
        .map(row => ({ studyUnitId: row.entityId, sourceLinks: row.entityId === AUDIO_UNIT_ID ? sourceLinks : [] })) })).courseRevision;
    const download = async (id, expectedRevision) => {
      const pdfResult = await api.getCourseSourceAttachmentDownload({ courseId: id, expectedRevision, sourceId, sourceRevision: 1, contentHash: pdfHash });
      const audioResult = await api.getCourseMediaDownload({ courseId: id, expectedRevision, studyUnitId: AUDIO_UNIT_ID, contentHash: media.contentHash });
      for (const [result, expected] of [[pdfResult, pdfHash], [audioResult, media.contentHash]]) {
        assert.equal(new URL(result.signedUrl).origin, status.API_URL);
        const response = await fetch(result.signedUrl, { cache: "no-store", redirect: "manual" });
        assert.equal(response.status, 200); assert.equal(sha256(await response.arrayBuffer()), expected);
      }
      return [pdfResult.signedUrl, audioResult.signedUrl];
    };
    const storageRead = async signed => {
      const url = new URL(signed); assert.equal(url.origin, status.API_URL);
      assert.match(url.pathname, /^\/storage\/v1\/object\/sign\/(?:course-source-pdfs|course-media)\//u);
      url.pathname = url.pathname.replace("/object/sign/", "/object/authenticated/"); url.search = "";
      return fetch(url, { headers: { apikey: status.SERVICE_ROLE_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}` }, cache: "no-store", redirect: "manual" });
    };
    phase = "copy and independent read";
    const originalUrls = await download(courseId, revision);
    const request = { sourceCourseId: courseId, expectedSourceRevision: revision, title: `Cópia de arquivos ${marker}`, confirmed: true, ...createCourseCopyRequestIdentity() };
    const copied = await api.copyCourse(request); const copyId = copied.targetCourseId;
    courses.add(copyId); proof.courseIds.push(copyId);
    assert.equal((await api.copyCourse(request)).targetCourseId, copyId);
    const copiedUrls = await download(copyId, 1);
    const exportCopy = await api.exportCourseAuthoring({ courseId: copyId, expectedRevision: 1, scope: { kind: "course", ref: null } });
    assert.equal(exportCopy.analytics.basis.sources[0].anchors[0].contentHash, pdfHash);
    assert.deepEqual(exportCopy.analytics.basis.studyUnits.find(unit => unit.studyUnitRef === AUDIO_UNIT_ID).sourceLinks, sourceLinks);
    proof.checks.push("Cópia e replay preservam unidade, vínculo, âncora e bytes PDF/WAV por hash.");
    phase = "remove original"; await removeCourse(courseId);
    await download(copyId, 1);
    proof.checks.push("Destino baixa ambos os arquivos após exclusão concluída da origem.");
    phase = "remove last reference"; await removeCourse(copyId);
    for (const url of new Set([...originalUrls, ...copiedUrls])) {
      const response = await storageRead(url);
      assert.ok([400, 404].includes(response.status), `Objeto sintético permaneceu: HTTP ${response.status}`);
      const body = await response.json(); assert.match(String(body.error ?? body.message ?? ""), /not.?found|does not exist|object.*missing/iu);
    }
    proof.checks.push("Após a última referência, Storage autenticado confirma ausência de ambos os objetos próprios.");
  } catch (error) {
    primaryError = error; proof.failure = { phase, name: error.name, code: error.code ?? null, status: error.status ?? null };
  } finally {
    for (const courseId of [...courses]) {
      try { await removeCourse(courseId); }
      catch (error) { primaryError ||= error; proof.cleanup.push({ courseId, status: "pending", code: error.code ?? null }); }
    }
    if (ownerId && courses.size === 0) {
      try { await auth(`admin/users/${ownerId}`, { admin: true, method: "DELETE" }); proof.cleanup.push({ userId: ownerId, status: "deleted" }); }
      catch (error) { primaryError ||= error; }
    }
    proof.ok = !primaryError;
    if (process.env.ARALEARN_LOCAL_COPY_PROOF_PATH) await writeFile(process.env.ARALEARN_LOCAL_COPY_PROOF_PATH, JSON.stringify(proof, null, 2));
  }
  if (primaryError) throw new Error(`Prova local de arquivos falhou em ${phase}: ${primaryError.code ?? primaryError.name}; consulte o ledger privado sem credenciais.`);
});
