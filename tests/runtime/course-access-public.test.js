import test from "node:test";
import assert from "node:assert/strict";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";
import { executeCourseRoute } from "../../supabase/functions/_shared/aralearn-authoring/courseRouter.js";
import { routeCourseRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseProtocol.js";

const COURSE = "10000000-0000-4000-8000-000000000001";
const PERSON = "20000000-0000-4000-8000-000000000002";
const REQUEST = "30000000-0000-4000-8000-000000000003";
const ORIGIN = "https://example.com";
const json = (data) => new Response(JSON.stringify(data), {
  headers: { "content-type": "application/json" }
});

function clientOptions(fetchImpl, extra = {}) {
  return { projectUrl: "https://project.supabase.co", publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => "session" }, fetchImpl, ...extra };
}

test("visitante usa somente RPCs públicos sem ler sessão nem emitir sessão inválida", async () => {
  const calls = [];
  const client = new CourseApiClient(clientOptions(async (url, init) => {
    calls.push({ url, init });
    return json({});
  }, { visitor: true, authClient: {
    getAccessToken() { assert.fail("Visitante não deve aproveitar uma sessão privada."); },
    clearSession() { assert.fail("Sem invalidação de sessão esperada."); },
    emit() { assert.fail("Sem evento de logout por ausência esperada de login."); }
  } }));
  await client.listCourses();
  await client.getCourse(COURSE);
  await client.getCourseEntities(COURSE, { revision: 1 });
  await client.rpc("get_course_study_citations_v1", {});
  for (const name of ["list_owned_courses_v1", "get_owned_course_v1", "save_course_personal_state_v2", "unknown"]) {
    await assert.rejects(client.rpc(name), { code: "AUTH_REQUIRED" });
  }
  for (const path of ["/v2/profile", `/v1/courses/${COURSE}/sources`, `/v1/courses/${COURSE}/composition`]) {
    await assert.rejects(client.requestCourseApi(path), { code: "AUTH_REQUIRED" });
  }
  assert.equal(calls.length, 4);
  assert.equal(calls.every(({ init }) => !new Headers(init.headers).has("authorization")), true);
});

test("erro de leitura pública não invalida a conta e escrita permanece autenticada", async () => {
  const client = new CourseApiClient(clientOptions(async () => json({}), { visitor: true }));
  await assert.rejects(client.requestCourseApi(`/v1/courses/${COURSE}/source-pdf/download`, {
    method: "POST", body: {}
  }), { code: "AUTH_REQUIRED" });
  const authenticated = new CourseApiClient(clientOptions(async () => assert.fail("Sem rede"), {
    authClient: { getAccessToken: async () => null }
  }));
  await assert.rejects(authenticated.listCourses(), { code: "AUTH_REQUIRED" });
});

test("caminhos HTTP de upload e avatar também recusam instância visitante com sessão residual", async () => {
  const client = new CourseApiClient(clientOptions(async () => assert.fail("Sem requisição de escrita"), {
    visitor: true, authClient: { getAccessToken() { assert.fail("Sem consultar token residual"); },
      getSession: () => ({ user: { id: PERSON } }), emit() { assert.fail("Sem logout por visitante"); } }
  }));
  await assert.rejects(client.uploadCourseSourcePdf({ courseId: COURSE, expectedRevision: 1,
    sourceId: "source-a", sourceRevision: 1, file: new Blob(["%PDF-1.4"], { type: "application/pdf" }) }),
  { code: "AUTH_REQUIRED" });
  await assert.rejects(client.uploadAvatar(new Blob(["image"], { type: "image/png" })), { code: "AUTH_REQUIRED" });
  await assert.rejects(client.loadAvatar(`${PERSON}/${REQUEST}.png`), { code: "AUTH_REQUIRED" });
  await assert.rejects(client.deleteOwnAvatar(`${PERSON}/${REQUEST}.png`), { code: "AUTH_REQUIRED" });
});

test("perfil aceita handle ASCII normalizado e rejeita nome anterior ou forma ambígua", async () => {
  const bodies = [];
  const client = new CourseApiClient(clientOptions(async (url, init) => {
    assert.match(url, /\/v2\/profile$/u);
    bodies.push(JSON.parse(init.body));
    return json({ ok: true, data: {} });
  }));
  await client.updatePersonProfile({ handle: "  @Abc._-9  " });
  assert.deepEqual(bodies, [{ handle: "abc._-9" }]);
  for (const handle of ["ab", ".abc", "abc-", "a".repeat(31), "ábcd", "Kelvin", "a b", "@@abc", null]) {
    assert.throws(() => client.updatePersonProfile({ handle }), TypeError);
  }
  assert.throws(() => client.updatePersonProfile({ displayName: "Nome" }), TypeError);
});

test("busca limita prefixo e grant confirma UUID com handle sem campo e-mail", async () => {
  const calls = [];
  const client = new CourseApiClient(clientOptions(async (url, init) => {
    calls.push({ url: new URL(url), body: init.body && JSON.parse(init.body) });
    return json({ ok: true, data: { contract: "aralearn.course-people-search.v1", courseId: COURSE,
      items: [], rateLimited: false } });
  }));
  await client.searchCourseAccessPeople(COURSE, { query: " @AB.", limit: 10 });
  await client.grantCourseAccess({ courseId: COURSE, userId: PERSON, handle: "@Abc", canCopy: false, confirmed: true, requestId: REQUEST });
  assert.equal(calls[0].url.searchParams.get("query"), "ab.");
  assert.deepEqual(calls[1].body, { userId: PERSON, handle: "abc", canCopy: false, confirmed: true, requestId: REQUEST });
  await assert.rejects(client.searchCourseAccessPeople(COURSE, { query: "a" }), TypeError);
  await assert.rejects(client.searchCourseAccessPeople(COURSE, { query: "ab", limit: 11 }), TypeError);
  assert.throws(() => client.grantCourseAccess({ courseId: COURSE, handle: "abc", confirmed: true }), TypeError);
});

test("política de publicação exige confirmação, arquivo exige revisão da fonte", async () => {
  const client = new CourseApiClient(clientOptions(async () => json({ ok: true, data: {} })));
  for (const values of [{ visibility: "public", confirmed: true }, { visibility: "public", publicFileAccess: "available" }]) {
    assert.throws(() => client.setCourseVisibility({ courseId: COURSE, expectedRevision: 1, ...values }), TypeError);
  }
  await client.setCourseVisibility({ courseId: COURSE, expectedRevision: 1, visibility: "public", publicFileAccess: "restricted", confirmed: true });
  assert.throws(() => client.setCourseSourceFileAccess({ courseId: COURSE, expectedRevision: 1,
    sourceId: "source-a", publicFileAccess: "available" }), TypeError);
});

test("Edge aceita anônimo só no download público e nunca rebaixa credencial inválida", async () => {
  let resolutions = 0;
  const downloads = [];
  const handler = createCourseApiHandler({ allowedOrigins: new Set([ORIGIN]), adapter: {
    async resolveApplicationPrincipal() { resolutions += 1; throw new Error("Credencial rejeitada"); },
    async getCourseSourcePdfDownload(value) { downloads.push(value); return {}; }
  } });
  const path = `/functions/v1/aralearn-course-api/v1/courses/${COURSE}/source-pdf/download` +
    `?expectedRevision=1&sourceId=source-a&sourceRevision=1&contentHash=${"a".repeat(64)}`;
  const request = (pathname, headers = {}) => new Request(`https://project.supabase.co${pathname}`, {
    headers: { Origin: ORIGIN, ...headers }
  });
  assert.equal((await handler(request(path))).status, 200);
  assert.equal(downloads[0].principal.actorId, null);
  assert.equal(resolutions, 0);
  assert.notEqual((await handler(request(path, { Authorization: "Bearer bad" }))).status, 200);
  assert.equal(downloads.length, 1);
  assert.equal((await handler(request(`/functions/v1/aralearn-course-api/v1/courses/${COURSE}/sources`))).status, 401);
});

test("rotas rejeitam dados de diretório e estudante não ganha autoridade de escrita por payload", async () => {
  const principal = { actorId: PERSON, authenticationKind: "application", scopes: ["authoring:read"] };
  const path = `/v1/courses/${COURSE}/access`;
  const request = new Request(`${ORIGIN}${path}`, { method: "POST", headers: {
    "content-type": "application/json", "Idempotency-Key": REQUEST
  }, body: JSON.stringify({ requestId: REQUEST, userId: PERSON, handle: "abc", confirmed: true, owner: true }) });
  await assert.rejects(executeCourseRoute({ request, route: routeCourseRequest("POST", path),
    principal, adapter: { manageCourseAccess() { assert.fail("Sem chamada de escrita."); } }
  }), { status: 403 });
  assert.throws(() => routeCourseRequest("POST", `/v1/courses/${COURSE}/personal-copy/composition`), { status: 404 });
});


test("avatar de busca só aceita URL assinada do objeto e projeto autorizados", async () => {
  const key = `${PERSON}/${REQUEST}.webp`;
  const allowed = `https://project.supabase.co/storage/v1/object/sign/person-avatars/${key}?token=proof`;
  const data = { contract: "aralearn.course-people-search.v1", courseId: COURSE,
    items: [{ userId: PERSON, handle: "abc", avatarObjectKey: key, avatarUrl: allowed }], rateLimited: false };
  const client = new CourseApiClient(clientOptions(async () => json({ ok: true, data })));
  assert.equal((await client.searchCourseAccessPeople(COURSE, { query: "ab" })).items[0].avatarUrl, allowed);
  for (const url of [allowed.replace("project.supabase.co", "evil.example"),
    allowed.replace(REQUEST, COURSE), allowed.replace("?token=proof", ""), "javascript:alert(1)"]) {
    data.items[0].avatarUrl = url;
    await assert.rejects(client.searchCourseAccessPeople(COURSE, { query: "ab" }), TypeError);
  }
});
