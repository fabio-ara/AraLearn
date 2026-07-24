import test from "node:test";
import assert from "node:assert/strict";
import { RemoteCourseCatalog } from "../../src/supabase/RemoteCourseCatalog.js";

const userId = "11111111-1111-4111-8111-111111111111";
const courseId = "22222222-2222-4222-8222-222222222222";
const submissionId = "33333333-3333-4333-8333-333333333333";
const collectionId = "44444444-4444-4444-8444-444444444444";

function response(status, body) {
  return new Response(body == null ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function sessionStore() {
  const values = new Map();
  return {
    async getSyncState(key) { return values.get(key) ?? null; },
    async putSyncState(key, value) {
      if (value == null) values.delete(key);
      else values.set(key, value);
    }
  };
}

function auth({ token = "access-token", events = [], store = sessionStore() } = {}) {
  let accessToken = token;
  return {
    sessionStore: store,
    getSession() { return accessToken ? { user: { id: userId } } : null; },
    async getAccessToken() { return accessToken; },
    async clearSession() { accessToken = null; },
    setAccessToken(value) { accessToken = value; },
    emit(event) { events.push(event); }
  };
}

function catalog(fetchImpl, authClient = auth()) {
  return new RemoteCourseCatalog({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    authClient,
    fetchImpl
  });
}

test("cliente usa somente as sete RPCs editoriais e preserva os tipos do contrato", async () => {
  const requests = [];
  const remote = catalog(async (url, options) => {
    requests.push({
      operation: String(url).split("/").at(-1),
      body: JSON.parse(options.body)
    });
    return response(200, { items: [] });
  });

  await remote.listCatalogSubmissionCandidates();
  await remote.listMyCatalogSubmissions();
  await remote.submitPersonalCourseToCatalog({
    submissionId,
    courseId,
    consent: true,
    licenseCode: "CC-BY-4.0",
    attribution: "Pessoa autora",
    provenance: "Produzido a partir de materiais próprios."
  });
  await remote.withdrawCatalogSubmission(submissionId);
  await remote.listCatalogSubmissionQueue();
  await remote.startCatalogSubmissionReview(submissionId);
  await remote.decideCatalogSubmission({
    submissionId,
    decision: "accept",
    collectionId,
    officialContractKey: "curso-publico",
    note: "Aprovado."
  });
  await remote.decideCatalogSubmission({
    submissionId,
    decision: "reject",
    note: "Requer revisão das fontes."
  });

  assert.deepEqual(requests.map(({ operation }) => operation), [
    "list_my_catalog_submission_candidates",
    "list_my_catalog_submissions",
    "submit_personal_course_to_catalog",
    "withdraw_catalog_submission",
    "list_catalog_submission_queue",
    "start_catalog_submission_review",
    "decide_catalog_submission",
    "decide_catalog_submission"
  ]);
  assert.deepEqual(requests[2].body, {
    p_submission_id: submissionId,
    p_course_id: courseId,
    p_consent: true,
    p_license_code: "CC-BY-4.0",
    p_attribution_text: "Pessoa autora",
    p_provenance_text: "Produzido a partir de materiais próprios."
  });
  assert.deepEqual(requests[6].body, {
    p_submission_id: submissionId,
    p_decision: "accept",
    p_collection_id: collectionId,
    p_official_contract_key: "curso-publico",
    p_note: "Aprovado."
  });
  assert.deepEqual(requests[7].body, {
    p_submission_id: submissionId,
    p_decision: "reject",
    p_collection_id: null,
    p_official_contract_key: null,
    p_note: "Requer revisão das fontes."
  });
  assert.equal(JSON.stringify(requests).includes("modules"), false);
  assert.equal(JSON.stringify(requests).includes("cards"), false);
});

test("consentimento falso e decisões incompletas são recusados antes da rede", async () => {
  const remote = catalog(async () => assert.fail("A rede não deveria ser acessada."));
  await assert.rejects(() => remote.submitPersonalCourseToCatalog({
    courseId,
    consent: false,
    licenseCode: "CC-BY-4.0",
    attribution: "Pessoa autora",
    provenance: "Materiais próprios."
  }), /autorização explícita/u);
  assert.throws(() => remote.decideCatalogSubmission({
    submissionId,
    decision: "reject",
    note: ""
  }), /Justificativa editorial/u);
  assert.throws(() => remote.decideCatalogSubmission({
    submissionId,
    decision: "accept",
    collectionId,
    officialContractKey: "Inválido com espaços"
  }), /Identificador público inválido/u);
});

test("resposta perdida reutiliza o mesmo submissionId e o limpa após confirmação", async () => {
  const store = sessionStore();
  const identifiers = [];
  let attempt = 0;
  const remote = catalog(async (_url, options) => {
    attempt += 1;
    identifiers.push(JSON.parse(options.body).p_submission_id);
    if (attempt === 1) throw new TypeError("resposta perdida");
    return response(200, { status: "submitted", submissionId: identifiers[0], idempotent: true });
  }, auth({ store }));
  const payload = {
    courseId,
    consent: true,
    licenseCode: "CC-BY-4.0",
    attribution: "Pessoa autora",
    provenance: "Materiais próprios."
  };

  await assert.rejects(() => remote.submitPersonalCourseToCatalog(payload), /resposta perdida/u);
  await remote.submitPersonalCourseToCatalog(payload);

  assert.equal(identifiers.length, 2);
  assert.equal(identifiers[0], identifiers[1]);
  assert.equal(await store.getSyncState(
    `rpc.pending.${userId}:submit_personal_course_to_catalog:${courseId}`
  ), null);
});

test("sessão ausente e HTTP 401 pedem nova autenticação sem virar autorização negada", async () => {
  const missingEvents = [];
  const missingAuth = auth({
    token: null,
    events: missingEvents
  });
  let restoredRequests = 0;
  const missing = catalog(async () => {
    restoredRequests += 1;
    return response(200, []);
  }, missingAuth);
  await assert.rejects(
    () => missing.submitPersonalCourseToCatalog({
      courseId,
      consent: true,
      licenseCode: "CC-BY-4.0",
      attribution: "Pessoa autora",
      provenance: "Materiais próprios."
    }),
    (error) => error?.authRequired === true && error?.status === 401
  );
  await assert.rejects(
    () => missing.listCatalogSubmissionCandidates(),
    (error) => error?.authRequired === true && error?.status === 401
  );
  assert.deepEqual(missingEvents, ["SESSION_INVALID"]);

  missingAuth.setAccessToken("nova-sessao");
  await missing.listCatalogSubmissionCandidates();
  assert.equal(restoredRequests, 1);
  missingAuth.setAccessToken(null);
  await assert.rejects(
    () => missing.listCatalogSubmissionCandidates(),
    (error) => error?.authRequired === true && error?.status === 401
  );
  assert.deepEqual(missingEvents, ["SESSION_INVALID", "SESSION_INVALID"]);

  const expiredEvents = [];
  const expired = catalog(async () => response(401, {
    code: "JWT_EXPIRED",
    message: "JWT expired"
  }), auth({ events: expiredEvents }));
  await assert.rejects(
    () => expired.listMyCatalogSubmissions(),
    (error) => error?.authRequired === true && error?.status === 401
  );
  assert.deepEqual(expiredEvents, ["SESSION_INVALID"]);
});

test("HTTP 403 editorial não invalida a sessão", async () => {
  const events = [];
  const remote = catalog(async () => response(403, {
    code: "42501",
    message: "Revisão editorial não autorizada."
  }), auth({ events }));
  await assert.rejects(
    () => remote.listCatalogSubmissionQueue(),
    (error) => error?.status === 403 && error?.authRequired !== true
  );
  assert.deepEqual(events, []);
});
