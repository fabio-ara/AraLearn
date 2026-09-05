import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { createSyntheticWave, createSyntheticMp3, createAudioCourseRows, audioStudyPath,
  AUDIO_COURSE_TITLE, AUDIO_UNIT_ID, CALCULATOR_UNIT_ID, AUDIO_ALTERNATIVE } from "../fixtures/package/course-audio.js";

const ENABLED = process.env.ARALEARN_E2E_REAL_SUPABASE === "1";
const PROJECT_URL = String(process.env.ARALEARN_SUPABASE_URL || "").replace(/\/+$/u, "");
const PUBLIC_KEY = String(process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "");
const ADMIN_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const ORIGIN = `http://127.0.0.1:${process.env.ARALEARN_E2E_PORT || "4182"}`;
const PASSWORD = "Synthetic-audio-303-A9!";
const digest = async bytes => Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
const reference = value => ({ contentHash: value.contentHash, byteSize: value.byteSize, mediaType: value.mediaType });

async function authRequest(path, { method = "POST", admin = false, body } = {}) {
  const response = await fetch(`${PROJECT_URL}/auth/v1/${path}`, { method,
    headers: { apikey: admin ? ADMIN_KEY : PUBLIC_KEY, ...(admin ? { Authorization: `Bearer ${ADMIN_KEY}` } : {}), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  expect(response.ok, `Auth local: HTTP ${response.status}`).toBe(true);
  return response.status === 204 ? null : response.json();
}
async function person(role, createdUsers) {
  const email = `audio303-${role}-${Date.now()}-${process.pid}@aralearn.local`;
  const user = await authRequest("admin/users", { admin: true, body: { email, password: PASSWORD, email_confirm: true,
    user_metadata: { test: "course-audio-local-303" } } });
  createdUsers.push({ id: user.id, email });
  const session = await authRequest("token?grant_type=password", { body: { email, password: PASSWORD } });
  const handle = `audio-${role}-${user.id.slice(0, 8)}`;
  const client = new CourseApiClient({ projectUrl: PROJECT_URL, publishableKey: PUBLIC_KEY,
    authClient: { getAccessToken: async () => session.access_token } });
  await client.updatePersonProfile({ handle });
  return { id: user.id, email, handle, client };
}
async function configureBrowser(page) {
  await page.route(url => url.origin === ORIGIN && url.pathname === "/", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("connect-src 'self' ", `connect-src 'self' ${PROJECT_URL} `) });
  });
  await page.route("**/runtime-config.js", route => route.fulfill({ status: 200, contentType: "text/javascript",
    body: `globalThis.__ARALEARN_ENV__=Object.freeze(${JSON.stringify({ supabaseUrl: PROJECT_URL, supabasePublishableKey: PUBLIC_KEY, developmentRuntime: true })});` }));
}
async function signInBrowser(page, user) {
  await configureBrowser(page); await page.goto("/?acesso=entrar");
  await page.getByLabel("E-mail").fill(user.email); await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Conta e aparência" })).toBeVisible();
}
const contextOptions = { viewport: { width: 390, height: 844 }, serviceWorkers: "block", permissions: ["local-network-access"] };
function failures(page) {
  const values = [];
  page.on("pageerror", error => values.push(`page: ${error.message}`));
  page.on("console", value => { if (value.type() === "error") values.push(`console: ${value.text()}`); });
  return values;
}
async function assertDownloaded(client, request, bytes) {
  const result = await client.getCourseMediaDownload(request);
  expect(result.contract).toBe("aralearn.course-media-download.v1");
  expect(result).not.toHaveProperty("storagePath");
  expect(result.media).toEqual({ contentHash: await digest(bytes), byteSize: bytes.length,
    mediaType: bytes[0] === 82 ? "audio/wav" : "audio/mpeg" });
  const response = await fetch(result.signedUrl);
  expect(response.status).toBe(200);
  expect(await digest(await response.arrayBuffer())).toBe(result.media.contentHash);
  return result;
}

test.describe("áudio persistido no Supabase local", () => {
  test.skip(!ENABLED, "Exige stack local explícita e migration de áudio aplicada.");
  test.setTimeout(180000);
  test("autoria guarda e relê, estudante escuta, público respeita arquivo e revogação encerra novo acesso", async ({ browser }, info) => {
    expect(PROJECT_URL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u);
    expect(PUBLIC_KEY).not.toBe(""); expect(ADMIN_KEY).not.toBe("");
    let owner, student, courseId, primaryError, cleanupError;
    const contexts = [];
    const createdUsers = [];
    try {
      owner = await person("owner", createdUsers); student = await person("student", createdUsers);
      const created = await owner.client.createCourse({ title: AUDIO_COURSE_TITLE, objective: "Exercitar recursos sintéticos sem dados de terceiros.", requestId: crypto.randomUUID() });
      courseId = created.courseId;
      const revision = async () => (await owner.client.getCourse(courseId)).revision;
      const catalog = async () => owner.client.loadCourseMedia(courseId, { expectedRevision: await revision(), mode: "catalog", limit: 20 });
      const wave = createSyntheticWave(), mp3 = createSyntheticMp3(), orphan = createSyntheticWave({ frequency: 660 });
      const waveHash = await digest(wave), mp3Hash = await digest(mp3), orphanHash = await digest(orphan);
      await writeFile(info.outputPath("fixture-identities.json"), JSON.stringify({ courseId, ownerId: owner.id, studentId: student.id,
        waveHash, mp3Hash, orphanHash }, null, 2));
      const ownerContext = await browser.newContext(contextOptions); contexts.push(ownerContext);
      const page = await ownerContext.newPage(); page.setDefaultTimeout(15000);
      const ownerFailures = failures(page);
      await signInBrowser(page, owner);
      const audioRoute = `/#/authoring/courses/${courseId}?section=audio`;
      await page.goto(audioRoute);
      const panel = page.locator(".course-audio-panel");
      await expect(panel.getByRole("heading", { name: "Áudio", exact: true })).toBeVisible();
      await expect(panel.getByLabel("Idioma padrão")).toBeEnabled();
      await panel.getByLabel("Idioma padrão").fill("zh-CN");
      await panel.getByLabel("Velocidade de reprodução").selectOption("1.25");
      await panel.getByRole("button", { name: "Salvar configuração de áudio" }).click();
      await expect(panel.getByText("Áudio atualizado.", { exact: true })).toBeVisible();
      expect((await catalog()).audioConfig).toMatchObject({ locale: "zh-CN", rate: 1.25, nativeVoiceURI: null, service: null, allowRemoteNativeVoice: false });
      await panel.getByRole("button", { name: "Arquivos", exact: true }).click();
      await panel.getByLabel("Arquivo de áudio", { exact: true }).setInputFiles({ name: "invalid.wav", mimeType: "audio/wav", buffer: Buffer.from("<html>synthetic invalid audio</html>") });
      await panel.getByRole("button", { name: "Guardar áudio" }).click();
      await expect(panel.getByRole("alert")).toBeVisible(); expect((await catalog()).items).toHaveLength(0);
      await panel.getByLabel("Arquivo de áudio", { exact: true }).setInputFiles({ name: "tom-sintetico.wav", mimeType: "audio/wav", buffer: Buffer.from(wave) });
      await panel.getByRole("button", { name: "Guardar áudio" }).click();
      await expect(panel.getByText("Áudio atualizado.", { exact: true })).toBeVisible();
      const waveItem = (await catalog()).items.find(item => item.contentHash === waveHash);
      expect(waveItem).toMatchObject({ byteSize: wave.length, mediaType: "audio/wav", fileName: "tom-sintetico.wav" });
      await page.reload();
      await expect(panel.getByLabel("Idioma padrão")).toBeEnabled();
      await panel.getByRole("button", { name: "Arquivos", exact: true }).click();
      await panel.locator(`[data-audio-action="preview"][data-media-hash="${waveHash}"]`).click();
      const preview = panel.getByLabel("Prévia do áudio");
      await expect(preview).toBeVisible();
      await preview.evaluate(audio => audio.play());
      await expect.poll(() => preview.evaluate(audio => audio.readyState)).toBeGreaterThanOrEqual(2);
      expect(await preview.evaluate(audio => ({ duration: audio.duration, error: audio.error }))).toEqual({ duration: 1, error: null });
      const mp3Request = { courseId, expectedCourseRevision: await revision(), requestId: crypto.randomUUID(),
        file: new File([mp3], "silencio-sintetico.mp3", { type: "audio/mpeg" }) };
      const uploadedMp3 = await owner.client.uploadCourseAudio(mp3Request);
      expect(uploadedMp3.media).toEqual({ contentHash: mp3Hash, byteSize: mp3.length, mediaType: "audio/mpeg" });
      expect((await owner.client.uploadCourseAudio(mp3Request)).idempotent).toBe(true);
      await owner.client.uploadCourseAudio({ courseId, expectedCourseRevision: await revision(), requestId: crypto.randomUUID(), file: new File([orphan], "orfao-sintetico.wav", { type: "audio/wav" }) });
      const rows = createAudioCourseRows(courseId, reference(waveItem), uploadedMp3.media);
      await owner.client.requestCourseApi(`/v1/courses/${courseId}/composition`, { method: "POST", body: {
        expectedRevision: await revision(), requestId: crypto.randomUUID(), upserts: rows, deletes: [],
        sourceAttributionApplications: [AUDIO_UNIT_ID, CALCULATOR_UNIT_ID].map(studyUnitId => ({ studyUnitId, sourceLinks: [] }))
      } });
      await owner.client.grantCourseAccess({ courseId, userId: student.id, handle: student.handle, confirmed: true });
      let currentRevision = await revision();
      await assertDownloaded(owner.client, { courseId, expectedRevision: currentRevision, studyUnitId: null, contentHash: orphanHash }, orphan);
      await assertDownloaded(student.client, { courseId, expectedRevision: currentRevision, studyUnitId: AUDIO_UNIT_ID, contentHash: waveHash }, wave);
      await assertDownloaded(student.client, { courseId, expectedRevision: currentRevision, studyUnitId: AUDIO_UNIT_ID, contentHash: mp3Hash }, mp3);
      await expect(student.client.getCourseMediaDownload({ courseId, expectedRevision: currentRevision, studyUnitId: AUDIO_UNIT_ID, contentHash: orphanHash })).rejects.toMatchObject({ status: 403 });
      await expect(student.client.getCourseMediaDownload({ courseId, expectedRevision: currentRevision, studyUnitId: null, contentHash: waveHash })).rejects.toMatchObject({ status: 403 });
      const studentContext = await browser.newContext(contextOptions); contexts.push(studentContext);
      const study = await studentContext.newPage(); study.setDefaultTimeout(15000);
      const studentFailures = failures(study);
      await signInBrowser(study, student); await study.goto(audioStudyPath(courseId));
      await expect(study.locator("ruby").first()).toBeVisible();
      await study.getByRole("button", { name: "Áudio", exact: true }).click();
      const tool = study.getByRole("dialog", { name: "Áudio", exact: true });
      await expect(tool).toBeVisible();
      expect(await tool.textContent()).not.toContain(AUDIO_ALTERNATIVE);
      await expect(tool.locator("[data-audio-configuration-status]")).toContainText("1.25×");
      for (const id of ["tone-wave", "silence-mp3"]) {
        const row = tool.locator(`[data-audio-track="${id}"]`);
        await row.locator('[data-audio-action="play"]').click();
        await expect.poll(() => row.locator("audio").evaluate(audio => audio.readyState)).toBeGreaterThanOrEqual(2);
        expect(await row.locator("audio").evaluate(audio => audio.error)).toBeNull();
        expect(await row.locator("audio").evaluate(audio => audio.playbackRate)).toBe(1.25);
      }
      expect(await study.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await study.screenshot({ path: info.outputPath("study-audio-real-390.png"), fullPage: true });
      await tool.getByRole("button", { name: "Fechar ferramenta" }).click();
      await expect(study.getByRole("button", { name: "Áudio", exact: true })).toBeFocused();
      await study.getByRole("button", { name: "Gramática", exact: true }).click();
      await expect(study.getByRole("dialog", { name: "Gramática", exact: true }).locator("[data-tool-link-index]")).toHaveCount(2);
      await study.getByRole("button", { name: "Fechar ferramenta" }).click();
      await study.getByRole("radio", { name: "A altura permanece constante." }).click();
      await study.locator('[data-action="next-study-unit"]').click();
      await expect(study.locator(".study-continue-popup")).toBeVisible();
      await study.locator(".study-reader-context").click();
      await expect(study.locator(".study-continue-popup")).toBeHidden();
      await study.getByRole("button", { name: "Áudio", exact: true }).click();
      await expect(tool).toContainText(AUDIO_ALTERNATIVE);
      await study.getByRole("button", { name: "Fechar ferramenta" }).click();
      await study.goto(audioStudyPath(courseId, CALCULATOR_UNIT_ID));
      await expect(study.locator("math")).toBeVisible();
      await study.getByRole("button", { name: "Calculadora", exact: true }).click();
      await study.getByRole("button", { name: "Calcular", exact: true }).click();
      await expect(study.locator("[data-calculator-output]")).toContainText("5");
      await study.getByRole("button", { name: "Fechar ferramenta" }).click();
      expect(ownerFailures).toEqual([]); expect(studentFailures).toEqual([]);
      const guest = new CourseApiClient({ projectUrl: PROJECT_URL, publishableKey: PUBLIC_KEY, visitor: true,
        authClient: { getAccessToken() { throw new Error("Visitante não usa conta."); } },
        fetchImpl: (url, init) => { const headers = new Headers(init.headers); headers.set("Origin", ORIGIN); return fetch(url, { ...init, headers }); } });
      await owner.client.setCourseVisibility({ courseId, expectedRevision: await revision(), visibility: "public", publicFileAccess: "restricted", confirmed: true });
      currentRevision = await revision();
      await expect(guest.getCourseMediaDownload({ courseId, expectedRevision: currentRevision, studyUnitId: AUDIO_UNIT_ID, contentHash: waveHash })).rejects.toMatchObject({ status: 403 });
      await owner.client.setCourseVisibility({ courseId, expectedRevision: currentRevision, visibility: "public", publicFileAccess: "available", confirmed: true });
      currentRevision = await revision();
      await assertDownloaded(guest, { courseId, expectedRevision: currentRevision, studyUnitId: AUDIO_UNIT_ID, contentHash: waveHash }, wave);
      await expect(guest.getCourseMediaDownload({ courseId, expectedRevision: currentRevision, studyUnitId: AUDIO_UNIT_ID, contentHash: orphanHash })).rejects.toMatchObject({ status: 403 });
      await expect(guest.loadCourseMedia(courseId, { expectedRevision: currentRevision, mode: "catalog" })).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
      const publicConfig = await guest.loadCourseMedia(courseId, { expectedRevision: currentRevision, mode: "configuration" });
      expect(publicConfig.items).toEqual([]); expect(publicConfig.storage).toBeNull();
      await owner.client.setCourseVisibility({ courseId, expectedRevision: currentRevision, visibility: "private", publicFileAccess: "restricted", confirmed: true });
      await owner.client.revokeCourseAccess({ courseId, userId: student.id, confirmed: true });
      currentRevision = await revision();
      await expect(student.client.getCourseMediaDownload({ courseId, expectedRevision: currentRevision, studyUnitId: AUDIO_UNIT_ID, contentHash: waveHash })).rejects.toMatchObject({ status: 404 });
      await expect(guest.getCourseMediaDownload({ courseId, expectedRevision: currentRevision, studyUnitId: AUDIO_UNIT_ID, contentHash: waveHash })).rejects.toMatchObject({ status: 404 });
    } catch (error) {
      primaryError = error;
      await info.attach("primary-failure.txt", { body: String(error.message), contentType: "text/plain" });
    } finally {
      await Promise.all(contexts.map(context => context.close()));
      let cleanupCompleted = !courseId;
      if (courseId && owner) {
        try {
          const removed = await owner.client.maintainCourse({ courseId, operation: "delete_owned_course", confirmed: true, requestId: crypto.randomUUID() });
          expect(removed.fileCleanupPending, "A conta proprietária deve permanecer até concluir a limpeza dos arquivos.").toBe(false);
          cleanupCompleted = true;
        } catch (error) {
          cleanupError = error;
          await info.attach("cleanup-failure.txt", { body: String(error.message), contentType: "text/plain" });
        }
      }
      if (cleanupCompleted) for (const user of createdUsers.toReversed()) await authRequest(`admin/users/${user.id}`, { method: "DELETE", admin: true });
    }
    if (primaryError) throw primaryError;
    if (cleanupError) throw cleanupError;
  });
});
