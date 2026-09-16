import test from "node:test";
import assert from "node:assert/strict";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";

const origin = "https://app.example";
const courseId = "10000000-0000-4000-8000-000000000001";
const base = `/v1/courses/${courseId}`;
const message = "Atualize o AraLearn para continuar a autoria. Seus dados e progresso estão preservados.";
const principal = { actorId: courseId, authenticationKind: "application", scopes: ["authoring:write"] };
function request(path, method = "GET", contract = null) {
  return new Request(`https://edge.example/functions/v1/aralearn-course-api${path}`, {
    method, headers: { Origin: origin, Authorization: "Bearer session",
      ...(contract === null ? {} : { "X-AraLearn-App-Contract": contract }),
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
    ...(method === "GET" ? {} : { body: "{}" })
  });
}

test("contratos autorais substituídos exigem atualização antes de ler ou escrever o novo DTO", async () => {
  const calls = [];
  const adapter = new Proxy({ resolveApplicationPrincipal: async () => principal }, {
    get(target, key) { return target[key] ?? (() => { calls.push(key); throw new Error("Não deve acessar dados."); }); }
  });
  const handler = createCourseApiHandler({ adapter, allowedOrigins: new Set([origin]) });
  const routes = [
    ["GET", `/v2/courses/${courseId}/study-units`], ["GET", `${base}/research`],
    ["GET", `${base}/instructional-plan`], ["GET", `${base}/course-design`],
    ["GET", `${base}/curricular-map`], ["GET", `${base}/sources`],
    ["GET", `${base}/anchored-annotations`], ["GET", `${base}/anchored-annotations/${courseId}/comparison`],
    ["POST", `${base}/authoring-parts`], ["PATCH", `${base}/curricular-map`],
    ["POST", `${base}/curricular-map/approval`], ["POST", `${base}/course-design/changes`],
    ["POST", `${base}/sources/changes`], ["POST", `${base}/anchored-annotations/changes`],
    ["POST", `${base}/composition`], ["POST", `${base}/authoring-profile/applications`]
  ];
  for (const [method, path] of routes) {
    for (const contract of [null, "authoring-v2"]) {
      const response = await handler(request(path, method, contract));
      assert.equal(response.status, 426, `${method} ${path}`);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      const payload = await response.json();
      assert.equal(payload.error.code, "app_update_required");
      assert.equal(payload.error.message, message);
    }
  }
  assert.deepEqual(calls, []);
});

test("atualização não substitui autenticação e CORS permite o sinal do cliente atual", async () => {
  const handler = createCourseApiHandler({ allowedOrigins: new Set([origin]), adapter: {
    async resolveApplicationPrincipal() { throw new AuthoringApiError(401, "invalid_session", "Entre novamente."); }
  } });
  const response = await handler(request(`${base}/course-design`));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "invalid_session");
  const preflight = await handler(new Request(`https://edge.example/functions/v1/aralearn-course-api${base}/course-design`, {
    method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,x-aralearn-app-contract" }
  }));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers"), /X-AraLearn-App-Contract/u);
});

test("cliente atual passa o contrato; erro de atualização preserva sessão, rascunho e cache sem retry", async () => {
  let dataReads = 0, transportCalls = 0, legacy = false;
  const session = { access_token: "session", user: { id: courseId } };
  const events = [], storageWrites = [];
  const draft = { text: "Revisão local ainda não enviada", response: "resposta offline" };
  const cache = new Map([["draft", structuredClone(draft)]]);
  const handler = createCourseApiHandler({ allowedOrigins: new Set([origin]), adapter: {
    resolveApplicationPrincipal: async () => principal,
    async listCourseStudyUnits() { dataReads += 1; return { current: true }; }
  } });
  const api = new CourseApiClient({ projectUrl: "https://edge.example", publishableKey: "synthetic-public",
    authClient: { getSession: () => session, getAccessToken: async () => session.access_token,
      clearSession: () => { session.access_token = null; }, emit: event => events.push(event) },
    fetchImpl: (url, init) => {
      transportCalls += 1;
      const headers = new Headers(init.headers);
      assert.equal(headers.get("X-AraLearn-App-Contract"), "authoring-v3");
      if (legacy) headers.delete("X-AraLearn-App-Contract");
      headers.set("Origin", origin);
      return handler(new Request(url, { ...init, headers }));
    }
  });
  assert.deepEqual(await api.loadAuthoringStudyUnits(courseId, { expectedRevision: 1 }), { current: true });
  assert.equal(dataReads, 1);
  const controller = new CourseController({ api, ownerOnly: true, navigatorValue: { onLine: true },
    store: { getCache: async key => cache.get(key), putCache: async (...args) => storageWrites.push(args),
      deleteCachePrefix: async (...args) => storageWrites.push(args) } });
  legacy = true;
  const before = transportCalls;
  await assert.rejects(controller.loadAuthoringStudyUnits(courseId, { expectedRevision: 1 }), error =>
    error.status === 426 && error.code === "app_update_required" && error.message === message);
  assert.equal(transportCalls, before + 1);
  assert.equal(dataReads, 1);
  assert.equal(session.access_token, "session");
  assert.deepEqual(events, []);
  assert.deepEqual(storageWrites, []);
  assert.deepEqual(cache.get("draft"), draft);
});

test("listagem pessoal permanece acessível ao cliente sem o novo contrato", async () => {
  const fixture = { items: [], hasMore: false, nextCursor: null };
  const handler = createCourseApiHandler({ allowedOrigins: new Set([origin]), adapter: {
    resolveApplicationPrincipal: async () => principal, listCourses: async () => fixture
  } });
  const response = await handler(request("/v1/courses"));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, fixture);
});
