import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";

const projectUrl = String(
  process.env.SUPABASE_URL || process.env.API_URL || "http://127.0.0.1:54321"
).replace(/\/+$/u, "");
const publishableKey = String(
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.ANON_KEY || ""
).trim();
const serviceRoleKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || ""
).trim();
const edgeUrl = `${projectUrl}/functions/v1/aralearn-authoring-api`;
const origin = "http://127.0.0.1:4182";
const projectHost = new URL(projectUrl).hostname;

assert(
  new Set(["127.0.0.1", "localhost"]).has(projectHost),
  "O smoke de autoria publica cursos temporários e só pode ser executado no Supabase local."
);
assert(publishableKey, "Publishable/anon key ausente para o smoke de autoria.");
assert(serviceRoleKey, "Service role ausente para preparar o smoke de autoria local.");

async function readBody(response) {
  const source = await response.text();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return source;
  }
}

async function request(url, {
  label = "requisição",
  expectedStatus = 200,
  withResponse = false,
  transientRetryLimit = 0,
  ...options
} = {}) {
  const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  for (let transientAttempt = 0;; transientAttempt += 1) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      if (transientAttempt >= transientRetryLimit) throw error;
      await wait(Math.min(5_000, 500 * (2 ** transientAttempt)));
      continue;
    }
    const body = await readBody(response);
    if (expectedStatuses.includes(response.status)) {
      return withResponse ? { body, status: response.status } : body;
    }
    const transient = response.status === 429 || response.status >= 500;
    if (transient && transientAttempt < transientRetryLimit) {
      await wait(Math.min(5_000, 500 * (2 ** transientAttempt)));
      continue;
    }
    assert.fail(
      `${label}: HTTP ${response.status}: ${body?.error?.message || body?.message || body || "sem detalhes"}`
    );
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertCompactResponse(envelope, label) {
  const serialized = JSON.stringify(envelope);
  assert.ok(serialized.length < 16 * 1024, `${label}: resposta excedeu 16 KiB.`);
  assert.equal(
    Object.hasOwn(envelope?.data || {}, "document"),
    false,
    `${label}: a resposta não deve repetir o documento integral.`
  );
  assert.equal(
    Object.hasOwn(envelope?.data || {}, "assembledDocument"),
    false,
    `${label}: a resposta não deve expor o documento montado.`
  );
}

async function publishUntilComplete(url, {
  headers,
  label,
  maxAttempts = 240,
  requestId = randomUUID()
}) {
  let publication = null;
  let courseId = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    const response = await request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ requestId }),
      expectedStatus: [200, 202],
      withResponse: true,
      transientRetryLimit: 3,
      label: `${label}, consulta ${attempt + 1}`
    });
    const elapsedMs = Date.now() - startedAt;
    assertCompactResponse(response.body, label);
    publication = unwrap(response.body);

    if (attempt === 0) {
      assert.ok(
        elapsedMs < 45_000,
        `${label}: a primeira resposta levou ${elapsedMs} ms e excedeu o limite da Action.`
      );
      assert.equal(response.status, 202, `${label}: a primeira resposta deve confirmar o trabalho assíncrono.`);
      assert.equal(publication.status, "publishing");
    }

    if (response.status === 200) {
      assert.equal(publication.status, "published", `${label}: HTTP 200 exige estado published.`);
      assert.match(publication.courseId, /^[0-9a-f-]{36}$/u);
      courseId = publication.courseId;
      break;
    }

    assert.equal(publication.status, "publishing", `${label}: HTTP 202 exige estado publishing.`);
    assert.ok(
      ["staging", "finalizing"].includes(publication.phase),
      `${label}: fase assíncrona desconhecida.`
    );
    assert.ok(Number(publication.pollAfterSeconds) > 0, `${label}: pollAfterSeconds ausente.`);
    const requestedDelayMs = Number(publication.pollAfterSeconds) * 1000;
    await wait(Math.min(Math.max(requestedDelayMs, 250), 5000));
  }

  assert.equal(publication?.status, "published", `${label}: publicação não terminou no prazo do smoke.`);

  const replay = await request(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ requestId }),
    expectedStatus: 200,
    withResponse: true,
    label: `${label}, repetição idempotente`
  });
  assertCompactResponse(replay.body, `${label}, repetição idempotente`);
  const replayedPublication = unwrap(replay.body);
  assert.equal(replayedPublication.status, "published");
  assert.equal(replayedPublication.courseId, courseId);
  return { publication, requestId };
}

function adminHeaders() {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function userHeaders(accessToken) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Origin: origin
  };
}

function apiKeyHeaders(apiKey) {
  return {
    "X-AraLearn-API-Key": apiKey,
    "Content-Type": "application/json",
    Origin: origin
  };
}

async function rpc(name, payload) {
  return request(`${projectUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
    label: name
  });
}

async function listAuthorizedCatalog(accessToken, query, label) {
  return request(`${projectUrl}/rest/v1/rpc/list_catalog_collections`, {
    method: "POST",
    headers: userHeaders(accessToken),
    body: JSON.stringify({ p_query: query }),
    label
  });
}

function unwrap(envelope) {
  assert.equal(envelope?.ok, true, envelope?.error?.message || "Envelope de sucesso inválido.");
  return envelope.data;
}

function uniqueDocument(document, suffix) {
  const result = structuredClone(document);
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value.identityKey === "string") value.identityKey = `${value.identityKey}:${suffix}`;
    Object.values(value).forEach(visit);
  };
  visit(result);
  result.courses[0].id = `course-authoring-smoke-${suffix}`;
  result.courses[0].title = `Smoke de autoria ${suffix}`;
  return result;
}

function authoringArtifacts(document, runId) {
  const project = structuredClone(document);
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequences = structuredClone(lesson.microsequences);
  const practiceCard = microsequences[0]?.cards?.find((card) => card.kind === "exercise");
  if (practiceCard?.exercise === "gap") {
    practiceCard.text = "A conjunção é verdadeira quando {gap:condicao-verdadeira}.";
    practiceCard.gaps = [{
      id: "condicao-verdadeira",
      response: "choice",
      answer: "as duas são verdadeiras",
      distractors: ["só P é verdadeira", "só Q é verdadeira"]
    }];
  }
  lesson.microsequences = [];
  const partKey = "lesson-01";
  const fragment = {
    courseId: course.id,
    moduleId: moduleValue.id,
    lessonId: lesson.id,
    microsequences
  };
  const firstCardId = microsequences[0].cards[0].id;
  const secondCardId = microsequences[0].cards[1].id;
  const ledger = {
    sources: [{
      sourceId: "source-smoke",
      title: "Fonte de verificação do fluxo de autoria",
      author: "Equipe AraLearn",
      kind: "documentation",
      locator: "smoke-local://fonte-principal",
      publishedOn: "2026-07-01",
      publishedVersion: "1.0",
      accessedOn: "2026-07-22",
      excerpt: "O material apresenta a regra usada nos dois cards da parte.",
      stability: "versioned",
      usageTerms: "Uso permitido no teste local da autoria.",
      usageNotes: "Não corresponde a conteúdo publicado no catálogo real."
    }],
    claims: [{
      claimId: "claim-smoke",
      statement: "A regra central fundamenta a explicação e a prática da parte.",
      sourceIds: ["source-smoke"],
      support: "A fonte declara a regra usada nos dois cards.",
      confidence: "high",
      allowedPartKeys: [partKey]
    }],
    terms: [{
      termId: "term-smoke",
      form: "regra central",
      language: "pt-BR",
      explanation: "Regra ensinada no primeiro card e aplicada no segundo.",
      firstTeachingCardId: firstCardId,
      requiredByCardIds: [secondCardId],
      sourceIds: ["source-smoke"]
    }]
  };
  const specification = {
    key: partKey,
    title: lesson.title,
    boundary: "Produzir somente as microssequências desta lição.",
    cutReason: "A parte coincide com o limite da lição.",
    dependsOnPartKeys: [],
    ownership: {
      courseId: course.id,
      moduleId: moduleValue.id,
      lessonId: lesson.id,
      microsequenceIds: microsequences.map((item) => item.id)
    },
    structure: {
      course: { id: course.id, title: course.title, goal: course.goal },
      module: { id: moduleValue.id, title: moduleValue.title, guide: structuredClone(moduleValue.guide) },
      lesson: {
        id: lesson.id,
        title: lesson.title,
        guide: structuredClone(lesson.guide),
        topics: structuredClone(lesson.topics)
      },
      microsequences: microsequences.map((microsequence) => ({
        id: microsequence.id,
        title: microsequence.title,
        goal: microsequence.goal,
        role: microsequence.role,
        status: "planned",
        dependsOn: structuredClone(microsequence.dependsOn || []),
        dependencyRationale: Object.fromEntries(
          (microsequence.dependsOn || []).map((dependency) => [dependency, "Dependência causal planejada."])
        ),
        covers: structuredClone(microsequence.covers || []),
        checks: structuredClone(microsequence.checks || []),
        errors: structuredClone(microsequence.errors || [])
      }))
    },
    cardPlan: microsequences.flatMap((microsequence) => microsequence.cards.map((card, index) => {
      const isExercise = card.kind === "exercise";
      return {
        cardId: card.id,
        microsequenceId: microsequence.id,
        position: index + 1,
        resource: card.resource,
        kind: card.kind,
        exercise: card.exercise,
        purpose: "Cumprir o objetivo da parte.",
        evidence: "Verificação pelo conteúdo do card.",
        outcomeIds: ["outcome-1"],
        operationId: "operation-conjuncao",
        conceptIds: ["concept-1"],
        retrievedConceptIds: isExercise ? ["concept-1"] : [],
        misconceptionIds: isExercise ? ["misconception-1"] : [],
        learningFunction: isExercise ? "guided_practice" : "foundation",
        resourceRationale: "O parágrafo apresenta a regra e comporta a lacuna guiada.",
        contextAnchors: isExercise ? ["as duas são verdadeiras"] : [],
        sourceIds: ["source-smoke"],
        claimIds: ["claim-smoke"],
        introducedTermIds: index === 0 ? ["term-smoke"] : [],
        requiredTermIds: index === 1 ? ["term-smoke"] : [],
        ...(isExercise ? {
          targetError: "Concluir que basta uma proposição verdadeira.",
          variationFocus: "Completar a condição de verdade da conjunção."
        } : {})
      };
    })),
    outcomeIds: ["outcome-1"],
    conceptIds: ["concept-1"],
    operationIds: ["operation-conjuncao"],
    misconceptionIds: ["misconception-1"],
    allowedSourceIds: ["source-smoke"],
    availableTermIds: ["term-smoke"],
    preserve: []
  };
  const plan = {
    artifact: "aralearn.course-plan",
    version: 1,
    runId,
    project,
    ledgerManifest: {
      artifact: "aralearn.course-ledger-manifest",
      version: 1,
      runId,
      sections: {
        sources: { chunkCount: 1, itemCount: 1 },
        claims: { chunkCount: 1, itemCount: 1 },
        terms: { chunkCount: 1, itemCount: 1 }
      },
      openIssues: []
    },
    course: {
      id: course.id,
      title: course.title,
      goal: course.goal,
      audience: "Estudantes do tema.",
      prerequisites: [],
      depth: "Fundamentos com prática guiada.",
      language: "pt-BR",
      include: ["Conteúdo previsto no esqueleto."],
      exclude: ["Conteúdo fora do objetivo."],
      notation: ["Manter a notação do esqueleto."],
      modules: course.modules.map((moduleItem) => ({
        id: moduleItem.id,
        title: moduleItem.title,
        goal: moduleItem.guide.goal,
        lessonIds: moduleItem.lessons.map((lessonItem) => lessonItem.id)
      }))
    },
    learningOutcomes: [{
      id: "outcome-1",
      statement: "Reconhecer a regra central apresentada na parte.",
      evidence: "Concluir o exercício previsto."
    }],
    operations: [{
      id: "operation-conjuncao",
      label: "Determinar quando uma conjunção é verdadeira.",
      evidence: "Completar a condição de verdade com as duas proposições verdadeiras.",
      representation: {
        preferredResources: ["paragraph"],
        allowedResources: ["paragraph"],
        rationale: "A proposição e a lacuna ficam legíveis no mesmo enunciado."
      }
    }],
    misconceptions: [{
      id: "misconception-1",
      statement: "Supor que uma conjunção é verdadeira se apenas uma proposição for verdadeira.",
      correctionEvidence: "A prática exige completar a condição com as duas proposições verdadeiras."
    }],
    conceptMap: {
      concepts: [{ id: "concept-1", label: "Conceito central" }],
      relations: []
    },
    parts: [{
      key: specification.key,
      title: specification.title,
      boundary: specification.boundary,
      cutReason: specification.cutReason,
      dependsOnPartKeys: specification.dependsOnPartKeys,
      ownership: specification.ownership,
      cardIds: specification.cardPlan.map((card) => card.cardId),
      outcomeIds: ["outcome-1"],
      conceptIds: ["concept-1"],
      operationIds: ["operation-conjuncao"],
      misconceptionIds: ["misconception-1"]
    }],
    acceptanceCriteria: ["Todas as partes devem cumprir o contrato e o plano."]
  };
  return { fragment, ledger, partKey, plan, specification };
}

const passingGates = Object.freeze({
  planAlignment: true,
  contract: true,
  outcomeCoverage: true,
  sources: true,
  continuity: true,
  interactionCoherence: true,
  language: true,
  fieldPreservation: true,
  structuredElements: true,
  feedback: true
});

const suffix = randomBytes(4).toString("hex");
const email = `authoring-smoke-${suffix}@aralearn.local`;
const password = `Arl!${randomBytes(18).toString("base64url")}`;
const privateEmail = `authoring-private-${suffix}@aralearn.local`;
const privatePassword = `Arl!${randomBytes(18).toString("base64url")}`;
let userId = "";
let privateUserId = "";

try {
  const created = await request(`${projectUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
    label: "criação do usuário temporário"
  });
  userId = created.id;
  assert.match(userId, /^[0-9a-f-]{36}$/u);

  const session = await request(`${projectUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    label: "login do usuário temporário"
  });
  const accessToken = session.access_token;
  assert(accessToken, "Auth não devolveu access_token.");

  const source = JSON.parse(await fs.readFile(
    new URL("../../tests/fixtures/v3/project-minimal.json", import.meta.url),
    "utf8"
  ));
  const document = uniqueDocument(source, suffix);

  const anonymous = await request(`${edgeUrl}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ requestId: randomUUID(), target: "catalog", title: "Negado" }),
    expectedStatus: 401,
    label: "autoria anônima"
  });
  assert.equal(anonymous.error.code, "authentication_required");

  const forbidden = await request(`${edgeUrl}/v1/imports`, {
    method: "POST",
    headers: userHeaders(accessToken),
    body: JSON.stringify({ requestId: randomUUID(), target: "catalog", document }),
    expectedStatus: 403,
    label: "publicação sem papel"
  });
  assert.equal(forbidden.error.code, "insufficient_scope");

  await rpc("set_app_role", {
    p_actor_user_id: null,
    p_target_user_id: userId,
    p_role: "owner",
    p_active: true,
    p_reason: "Smoke local da API de autoria"
  });

  const capabilities = await request(`${projectUrl}/rest/v1/rpc/current_user_capabilities`, {
    method: "POST",
    headers: userHeaders(accessToken),
    body: "{}",
    label: "capacidades do proprietário"
  });
  assert.equal(capabilities.catalogImport, true);

  const imported = unwrap(await request(`${edgeUrl}/v1/imports`, {
    method: "POST",
    headers: userHeaders(accessToken),
    body: JSON.stringify({
      requestId: randomUUID(),
      target: "catalog",
      publicationIntent: { mode: "create" },
      document
    }),
    label: "importação autorizada"
  }));
  assert.equal(imported.status, "validated");
  assert.match(imported.runId, /^[0-9a-f-]{36}$/u);

  assertCompactResponse({ ok: true, data: imported }, "importação autorizada");
  const { publication } = await publishUntilComplete(
    `${edgeUrl}/v1/runs/${imported.runId}/publish`,
    {
      headers: userHeaders(accessToken),
      label: "publicação da importação manual"
    }
  );
  assert.equal(publication.status, "published");
  assert.match(publication.courseId, /^[0-9a-f-]{36}$/u);

  const catalogApiKey = `arl_${randomBytes(36).toString("base64url")}`;
  const keyPrefix = catalogApiKey.slice(0, 16);
  const keyHash = createHash("sha256").update(catalogApiKey).digest("hex");
  await rpc("create_authoring_api_client", {
    p_actor_user_id: userId,
    p_owner_user_id: userId,
    p_name: "Smoke local",
    p_key_prefix: keyPrefix,
    p_api_key_hash: keyHash,
    p_scopes: ["authoring:read", "authoring:write", "authoring:audit", "catalog:publish"],
    p_rate_limit_per_minute: 120,
    p_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });

  const runByApiKey = unwrap(await request(`${edgeUrl}/v1/runs/${imported.runId}`, {
    method: "GET",
    headers: apiKeyHeaders(catalogApiKey),
    label: "consulta com chave restrita"
  }));
  assert.equal(runByApiKey.status, "published");

  const privateUser = await request(`${projectUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email: privateEmail,
      password: privatePassword,
      email_confirm: true
    }),
    label: "criação do autor privado temporário"
  });
  privateUserId = privateUser.id;
  assert.match(privateUserId, /^[0-9a-f-]{36}$/u);
  const privateSession = await request(
    `${projectUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: privateEmail, password: privatePassword }),
      label: "login do autor privado temporário"
    }
  );
  const privateAccessToken = privateSession.access_token;
  assert(privateAccessToken, "Auth não devolveu access_token para o autor privado.");

  const integrationRequestId = randomUUID();
  const issuedIntegration = unwrap(await request(`${edgeUrl}/v1/integrations`, {
    method: "POST",
    headers: userHeaders(privateAccessToken),
    body: JSON.stringify({
      requestId: integrationRequestId,
      name: "Smoke privado",
      expiresInDays: 30
    }),
    label: "emissão pessoal da chave privada"
  }));
  assert.match(issuedIntegration.clientId, /^[0-9a-f-]{36}$/u);
  assert.match(issuedIntegration.apiKey, /^arl_[A-Za-z0-9_-]{24,192}$/u);
  assert.equal(issuedIntegration.secretAvailable, true);
  assert.deepEqual(issuedIntegration.scopes, [
    "authoring:private:audit",
    "authoring:private:read",
    "authoring:private:write"
  ]);
  assert.equal(Object.hasOwn(issuedIntegration, "apiKeyHash"), false);

  const issuanceReplay = unwrap(await request(`${edgeUrl}/v1/integrations`, {
    method: "POST",
    headers: userHeaders(privateAccessToken),
    body: JSON.stringify({
      requestId: integrationRequestId,
      name: "Smoke privado",
      expiresInDays: 30
    }),
    label: "repetição da emissão pessoal"
  }));
  assert.equal(issuanceReplay.clientId, issuedIntegration.clientId);
  assert.equal(issuanceReplay.secretAvailable, false);
  assert.equal(Object.hasOwn(issuanceReplay, "apiKey"), false);
  const incompatibleIssuance = await request(`${edgeUrl}/v1/integrations`, {
    method: "POST",
    headers: userHeaders(privateAccessToken),
    body: JSON.stringify({
      requestId: integrationRequestId,
      name: "Outra integração",
      expiresInDays: 30
    }),
    expectedStatus: 409,
    label: "conflito de requestId na emissão pessoal"
  });
  assert.equal(incompatibleIssuance.error.code, "conflict");

  const integrations = unwrap(await request(`${edgeUrl}/v1/integrations`, {
    method: "GET",
    headers: userHeaders(privateAccessToken),
    label: "listagem das integrações pessoais"
  }));
  assert.equal(integrations.activeCount, 1);
  assert.equal(integrations.activeLimit, 5);
  const listedIntegration = integrations.items.find(
    (item) => item.clientId === issuedIntegration.clientId
  );
  assert.ok(listedIntegration, "A integração emitida não apareceu na conta do autor.");
  for (const forbiddenField of [
    "apiKey", "apiKeyHash", "issuanceRequestId", "issuanceRequestHash"
  ]) {
    assert.equal(Object.hasOwn(listedIntegration, forbiddenField), false);
  }

  const managementByApiKey = await request(`${edgeUrl}/v1/integrations`, {
    method: "GET",
    headers: apiKeyHeaders(issuedIntegration.apiKey),
    expectedStatus: 403,
    label: "gestão de integração por chave de API"
  });
  assert.equal(managementByApiKey.error.code, "session_required");

  const crossAccountRevoke = await request(
    `${edgeUrl}/v1/integrations/${issuedIntegration.clientId}`,
    {
      method: "DELETE",
      headers: userHeaders(accessToken),
      expectedStatus: 404,
      label: "isolamento A/B das integrações pessoais"
    }
  );
  assert.equal(crossAccountRevoke.error.code, "not_found");

  const rotationRequestId = randomUUID();
  const rotatedIntegration = unwrap(await request(
    `${edgeUrl}/v1/integrations/${issuedIntegration.clientId}/rotate`,
    {
      method: "POST",
      headers: userHeaders(privateAccessToken),
      body: JSON.stringify({ requestId: rotationRequestId, expiresInDays: 30 }),
      label: "renovação da integração pessoal"
    }
  ));
  assert.match(rotatedIntegration.apiKey, /^arl_[A-Za-z0-9_-]{24,192}$/u);
  assert.notEqual(rotatedIntegration.clientId, issuedIntegration.clientId);
  assert.equal(rotatedIntegration.rotatedFromClientId, issuedIntegration.clientId);
  const incompatibleRotation = await request(
    `${edgeUrl}/v1/integrations/${issuedIntegration.clientId}/rotate`,
    {
      method: "POST",
      headers: userHeaders(privateAccessToken),
      body: JSON.stringify({ requestId: rotationRequestId, expiresInDays: 31 }),
      expectedStatus: 409,
      label: "conflito de requestId na renovação pessoal"
    }
  );
  assert.equal(incompatibleRotation.error.code, "conflict");
  const revokedOldKey = await request(`${edgeUrl}/v1/runs`, {
    method: "GET",
    headers: apiKeyHeaders(issuedIntegration.apiKey),
    expectedStatus: 401,
    label: "invalidação atômica da chave anterior"
  });
  assert.equal(revokedOldKey.error.code, "invalid_client");
  let apiKey = rotatedIntegration.apiKey;
  let activeIntegrationId = rotatedIntegration.clientId;

  const disposableIntegration = unwrap(await request(`${edgeUrl}/v1/integrations`, {
    method: "POST",
    headers: userHeaders(privateAccessToken),
    body: JSON.stringify({
      requestId: randomUUID(),
      name: "Smoke revogável",
      expiresInDays: 30
    }),
    label: "emissão da integração revogável"
  }));
  const revokedIntegration = unwrap(await request(
    `${edgeUrl}/v1/integrations/${disposableIntegration.clientId}`,
    {
      method: "DELETE",
      headers: userHeaders(privateAccessToken),
      label: "revogação da integração pessoal"
    }
  ));
  assert.equal(revokedIntegration.active, false);
  const revokedDisposableKey = await request(`${edgeUrl}/v1/runs`, {
    method: "GET",
    headers: apiKeyHeaders(disposableIntegration.apiKey),
    expectedStatus: 401,
    label: "rejeição da integração revogada"
  });
  assert.equal(revokedDisposableKey.error.code, "invalid_client");

  for (let number = 2; number <= 5; number += 1) {
    const extra = unwrap(await request(`${edgeUrl}/v1/integrations`, {
      method: "POST",
      headers: userHeaders(privateAccessToken),
      body: JSON.stringify({
        requestId: randomUUID(),
        name: `Smoke auxiliar ${number}`,
        expiresInDays: 30
      }),
      label: `emissão da integração auxiliar ${number}`
    }));
    assert.equal(extra.secretAvailable, true);
  }
  const integrationLimit = await request(`${edgeUrl}/v1/integrations`, {
    method: "POST",
    headers: userHeaders(privateAccessToken),
    body: JSON.stringify({
      requestId: randomUUID(),
      name: "Smoke acima do limite",
      expiresInDays: 30
    }),
    expectedStatus: 409,
    label: "limite de integrações pessoais"
  });
  assert.equal(integrationLimit.error.code, "integration_limit_reached");
  const catalogThroughPrivateKey = await request(`${edgeUrl}/v1/runs`, {
    method: "POST",
    headers: apiKeyHeaders(apiKey),
    body: JSON.stringify({
      requestId: randomUUID(),
      target: "catalog",
      title: "Tentativa de catálogo com chave privada",
      contractKey: `course-private-key-catalog-${suffix}`,
      publicationIntent: { mode: "create" }
    }),
    expectedStatus: 403,
    label: "isolamento da chave privada"
  });
  assert.equal(catalogThroughPrivateKey.error.code, "insufficient_scope");

  const workflowDocument = uniqueDocument(source, `${suffix}-workflow`);
  const createdRun = unwrap(await request(`${edgeUrl}/v1/runs`, {
    method: "POST",
    headers: apiKeyHeaders(apiKey),
    body: JSON.stringify({
      requestId: randomUUID(),
      target: "private",
      title: workflowDocument.courses[0].title,
      contractKey: workflowDocument.courses[0].id,
      publicationIntent: { mode: "create" }
    }),
    label: "criação da execução privada em partes"
  }));
  const privateRunThroughCatalogKey = await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}`,
    {
      method: "GET",
      headers: apiKeyHeaders(catalogApiKey),
      expectedStatus: 403,
      label: "isolamento da execução privada"
    }
  );
  assert.equal(privateRunThroughCatalogKey.error.code, "insufficient_scope");
  const blocked = unwrap(await request(`${edgeUrl}/v1/runs/${createdRun.runId}/block`, {
    method: "POST",
    headers: apiKeyHeaders(apiKey),
    body: JSON.stringify({
      requestId: randomUUID(),
      reason: "Confirmação editorial necessária.",
      questions: ["Continuar com o recorte planejado?"]
    }),
    label: "bloqueio explícito"
  }));
  assert.equal(blocked.status, "blocked");
  const resumed = unwrap(await request(`${edgeUrl}/v1/runs/${createdRun.runId}/resume`, {
    method: "POST",
    headers: apiKeyHeaders(apiKey),
    body: JSON.stringify({
      requestId: randomUUID(),
      resolution: { answer: "Sim, manter o recorte." }
    }),
    label: "retomada explícita"
  }));
  assert.equal(resumed.status, "planning");
  const artifacts = authoringArtifacts(workflowDocument, createdRun.runId);
  const planned = unwrap(await request(`${edgeUrl}/v1/runs/${createdRun.runId}/plan`, {
    method: "PUT",
    headers: apiKeyHeaders(apiKey),
    body: JSON.stringify({ requestId: randomUUID(), plan: artifacts.plan }),
    label: "planejamento persistido"
  }));
  assert.equal(planned.status, "building");

  const ledgerState = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/next-part`,
    { method: "GET", headers: apiKeyHeaders(apiKey), label: "estado inicial do ledger" }
  ));
  assert.equal(ledgerState.action, "upload_ledger");
  assert.equal(ledgerState.ledgerProgress.sources.receivedChunks, 0);
  const emptyChunk = await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/ledger/sources/0`,
    {
      method: "PUT",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify({
        requestId: randomUUID(),
        planHash: ledgerState.planHash,
        items: []
      }),
      expectedStatus: 422,
      label: "rejeição de trecho vazio do registro"
    }
  );
  assert.equal(emptyChunk.error.code, "invalid_payload");
  for (const section of ["sources", "claims", "terms"]) {
    const storedChunk = unwrap(await request(
      `${edgeUrl}/v1/runs/${createdRun.runId}/ledger/${section}/0`,
      {
        method: "PUT",
        headers: apiKeyHeaders(apiKey),
        body: JSON.stringify({
          requestId: randomUUID(),
          planHash: ledgerState.planHash,
          items: artifacts.ledger[section]
        }),
        label: `registro de ${section}`
      }
    ));
    assert.equal(storedChunk.itemCount, 1);
    assert.match(storedChunk.contentHash, /^[0-9a-f]{64}$/u);
  }
  unwrap(await request(`${edgeUrl}/v1/runs/${createdRun.runId}/plan/finalize`, {
    method: "POST",
    headers: apiKeyHeaders(apiKey),
    body: JSON.stringify({ requestId: randomUUID(), planHash: ledgerState.planHash }),
    label: "finalização do registro de autoria"
  }));

  const incomplete = await request(`${edgeUrl}/v1/runs/${createdRun.runId}/publish`, {
    method: "POST",
    headers: apiKeyHeaders(apiKey),
    body: JSON.stringify({ requestId: randomUUID() }),
    expectedStatus: 409,
    label: "bloqueio da publicação incompleta"
  });
  assert.equal(incomplete.error.code, "course_incomplete");

  const outline = unwrap(await request(`${edgeUrl}/v1/runs/${createdRun.runId}/next-part`, {
    method: "GET",
    headers: apiKeyHeaders(apiKey),
    label: "contorno causal da próxima parte"
  }));
  assert.equal(outline.action, "specify_part");
  assert.equal(outline.ledger.sources[0].publishedVersion, "1.0");
  assert.equal(outline.ledger.sources[0].usageTerms, "Uso permitido no teste local da autoria.");
  assert.equal(outline.ledger.claims[0].claimId, "claim-smoke");
  assert.equal(outline.ledger.terms[0].termId, "term-smoke");
  unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}/specification`,
    {
      method: "PUT",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify({
        requestId: randomUUID(),
        planHash: outline.planHash,
        specification: { ...artifacts.specification, outcomeIds: outline.outcomeIds }
      }),
      label: "especificação da parte"
    }
  ));
  const specification = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/next-part`,
    { method: "GET", headers: apiKeyHeaders(apiKey), label: "reserva causal da próxima parte" }
  ));
  assert.equal(specification.action, "build_part");
  const submission = {
    artifact: "aralearn.part-submission",
    version: 1,
    runId: createdRun.runId,
    partKey: artifacts.partKey,
    requestId: randomUUID(),
    mode: specification.mode,
    attempt: specification.attempt,
    baseLedgerSha256: specification.baseLedgerSha256,
    fragment: artifacts.fragment,
    evidence: [{
      sourceId: "source-smoke",
      claimId: "claim-smoke",
      cardIds: artifacts.specification.cardPlan.map((card) => card.cardId)
    }],
    stateDelta: {
      introducedTermIds: ["term-smoke"],
      usedClaimIds: ["claim-smoke"],
      coveredOutcomeIds: ["outcome-1"],
      resolvedErrorIds: [],
      notes: []
    }
  };
  const stalePart = await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}`,
    {
      method: "PUT",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify({ ...submission, requestId: randomUUID(), baseLedgerSha256: "0".repeat(64) }),
      expectedStatus: 409,
      label: "rejeição de especificação causal vencida"
    }
  );
  assert.equal(stalePart.error.code, "stale_part_spec");

  const submitted = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}`,
    {
      method: "PUT",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify(submission),
      label: "gravação da parte"
    }
  ));
  assert.equal(submitted.partStatus, "awaiting_audit");
  const persisted = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}/submission`,
    {
      method: "GET",
      headers: apiKeyHeaders(apiKey),
      label: "releitura da parte persistida"
    }
  ));
  assert.equal(persisted.attempt, submitted.attempt);
  assert.equal(persisted.submissionSha256, submitted.fragmentHash);
  assert.deepEqual(persisted.fragment, artifacts.fragment);

  const invalidApproval = await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}/audit`,
    {
      method: "POST",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify({
        artifact: "aralearn.part-audit",
        version: 1,
        runId: createdRun.runId,
        partKey: artifacts.partKey,
        requestId: randomUUID(),
        attempt: persisted.attempt,
        submissionSha256: persisted.submissionSha256,
        submissionReadReceipt: persisted.submissionReadReceipt,
        decision: "approve",
        gates: { ...passingGates, interactionCoherence: false },
        findings: []
      }),
      expectedStatus: 422,
      label: "rejeição de aprovação com critério reprovado"
    }
  );
  assert.equal(invalidApproval.error.code, "audit_not_approvable");

  const repairRequested = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}/audit`,
    {
      method: "POST",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify({
        artifact: "aralearn.part-audit",
        version: 1,
        runId: createdRun.runId,
        partKey: artifacts.partKey,
        requestId: randomUUID(),
        attempt: persisted.attempt,
        submissionSha256: persisted.submissionSha256,
        submissionReadReceipt: persisted.submissionReadReceipt,
        decision: "repair",
        gates: { ...passingGates, interactionCoherence: false },
        findings: [{
          issueId: "smoke-interaction-repair",
          severity: "error",
          gate: "interactionCoherence",
          pointer: "/microsequences/0/cards/0",
          observed: "O exemplo ainda não explicita o erro que deve prevenir.",
          requiredChange: "Explicitar a prevenção do erro sem ampliar a parte.",
          preserveFields: ["/courseId", "/moduleId", "/lessonId"],
          acceptanceTest: "O card previne o erro e preserva o recorte planejado."
        }]
      }),
      label: "pedido de reparo da parte"
    }
  ));
  assert.equal(repairRequested.decision, "repair");

  const repairSpecification = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/next-part`,
    { method: "GET", headers: apiKeyHeaders(apiKey), label: "reserva do reparo" }
  ));
  assert.equal(repairSpecification.action, "build_part");
  assert.equal(repairSpecification.mode, "repair");
  const repaired = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}`,
    {
      method: "PUT",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify({
        ...submission,
        requestId: randomUUID(),
        mode: repairSpecification.mode,
        attempt: repairSpecification.attempt,
        baseLedgerSha256: repairSpecification.baseLedgerSha256
      }),
      label: "reparo da parte"
    }
  ));
  assert.equal(repaired.partStatus, "awaiting_audit");

  const repairedPersisted = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}/submission`,
    {
      method: "GET",
      headers: apiKeyHeaders(apiKey),
      label: "releitura da parte reparada"
    }
  ));
  assert.equal(repairedPersisted.attempt, repaired.attempt);
  assert.equal(repairedPersisted.submissionSha256, repaired.fragmentHash);

  const approved = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}/audit`,
    {
      method: "POST",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify({
        artifact: "aralearn.part-audit",
        version: 1,
        runId: createdRun.runId,
        partKey: artifacts.partKey,
        requestId: randomUUID(),
        attempt: repairedPersisted.attempt,
        submissionSha256: repairedPersisted.submissionSha256,
        submissionReadReceipt: repairedPersisted.submissionReadReceipt,
        decision: "approve",
        gates: passingGates,
        findings: []
      }),
      label: "aprovação causal da parte"
    }
  ));
  assert.equal(approved.decision, "approve");

  const continuedIntegration = unwrap(await request(
    `${edgeUrl}/v1/integrations/${activeIntegrationId}/rotate`,
    {
      method: "POST",
      headers: userHeaders(privateAccessToken),
      body: JSON.stringify({ requestId: randomUUID(), expiresInDays: 30 }),
      label: "renovação durante uma execução privada"
    }
  ));
  apiKey = continuedIntegration.apiKey;
  activeIntegrationId = continuedIntegration.clientId;
  assert.match(activeIntegrationId, /^[0-9a-f-]{36}$/u);

  const reopened = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}/reopen`,
    {
      method: "POST",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify({
        artifact: "aralearn.final-validation-repair",
        version: 1,
        runId: createdRun.runId,
        partKey: artifacts.partKey,
        requestId: randomUUID(),
        attempt: repaired.attempt,
        submissionSha256: repaired.fragmentHash,
        decision: "repair",
        findings: [{
          issueId: "smoke-final-reopen",
          severity: "warning",
          gate: "continuity",
          pointer: "/microsequences/0",
          observed: "A revisão integral pediu uma última conferência de continuidade.",
          requiredChange: "Conferir a continuidade sem alterar a estrutura aprovada.",
          preserveFields: ["/courseId", "/moduleId", "/lessonId"],
          acceptanceTest: "A continuidade é confirmada e a estrutura permanece igual."
        }]
      }),
      label: "reabertura após a aprovação"
    }
  ));
  assert.equal(reopened.status, "repair");

  const reopenedSpecification = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/next-part`,
    { method: "GET", headers: apiKeyHeaders(apiKey), label: "reserva da parte reaberta" }
  ));
  assert.equal(reopenedSpecification.action, "build_part");
  assert.equal(reopenedSpecification.mode, "repair");
  const resubmitted = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}`,
    {
      method: "PUT",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify({
        ...submission,
        requestId: randomUUID(),
        mode: reopenedSpecification.mode,
        attempt: reopenedSpecification.attempt,
        baseLedgerSha256: reopenedSpecification.baseLedgerSha256
      }),
      label: "nova entrega da parte reaberta"
    }
  ));
  assert.equal(resubmitted.partStatus, "awaiting_audit");
  const resubmittedPersisted = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}/submission`,
    {
      method: "GET",
      headers: apiKeyHeaders(apiKey),
      label: "releitura da parte reaberta"
    }
  ));
  assert.equal(resubmittedPersisted.attempt, resubmitted.attempt);
  assert.equal(resubmittedPersisted.submissionSha256, resubmitted.fragmentHash);
  const reapproved = unwrap(await request(
    `${edgeUrl}/v1/runs/${createdRun.runId}/parts/${artifacts.partKey}/audit`,
    {
      method: "POST",
      headers: apiKeyHeaders(apiKey),
      body: JSON.stringify({
        artifact: "aralearn.part-audit",
        version: 1,
        runId: createdRun.runId,
        partKey: artifacts.partKey,
        requestId: randomUUID(),
        attempt: resubmittedPersisted.attempt,
        submissionSha256: resubmittedPersisted.submissionSha256,
        submissionReadReceipt: resubmittedPersisted.submissionReadReceipt,
        decision: "approve",
        gates: passingGates,
        findings: []
      }),
      label: "aprovação da parte reaberta"
    }
  ));
  assert.equal(reapproved.decision, "approve");

  const validated = unwrap(await request(`${edgeUrl}/v1/runs/${createdRun.runId}/validate`, {
    method: "POST",
    headers: apiKeyHeaders(apiKey),
    body: JSON.stringify({ requestId: randomUUID() }),
    label: "validação integral da execução"
  }));
  assert.equal(validated.status, "validated");

  const { publication: workflowPublication } = await publishUntilComplete(
    `${edgeUrl}/v1/runs/${createdRun.runId}/publish`,
    {
      headers: apiKeyHeaders(apiKey),
      label: "materialização privada da execução em partes"
    }
  );
  assert.equal(workflowPublication.status, "published");
  assert.equal(workflowPublication.visibility, "private");
  const privateRoot = await request(
    `${projectUrl}/rest/v1/courses?id=eq.${workflowPublication.courseId}`
      + "&select=id,owner_id,status,contract_key,content_hash",
    {
      method: "GET",
      headers: adminHeaders(),
      label: "raiz privada materializada"
    }
  );
  assert.equal(privateRoot.length, 1);
  assert.equal(privateRoot[0].owner_id, privateUserId);
  assert.equal(privateRoot[0].status, "published");
  assert.equal(privateRoot[0].contract_key, workflowDocument.courses[0].id);
  assert.match(privateRoot[0].content_hash, /^[0-9a-f]{64}$/u);
  const privateSelection = await request(
    `${projectUrl}/rest/v1/user_course_selections?course_id=eq.${workflowPublication.courseId}`
      + "&select=id,user_id,course_id",
    {
      method: "GET",
      headers: userHeaders(privateAccessToken),
      label: "seleção privada materializada"
    }
  );
  assert.equal(privateSelection.length, 1);
  assert.equal(privateSelection[0].user_id, privateUserId);
  const privateRootFromCatalogOwner = await request(
    `${projectUrl}/rest/v1/courses?id=eq.${workflowPublication.courseId}&select=id`,
    {
      method: "GET",
      headers: userHeaders(accessToken),
      label: "isolamento da árvore privada entre contas"
    }
  );
  assert.deepEqual(privateRootFromCatalogOwner, []);
  const catalogWithoutPrivate = await listAuthorizedCatalog(
    accessToken,
    workflowDocument.courses[0].title,
    "isolamento do curso privado no catálogo"
  );
  assert.equal(
    catalogWithoutPrivate.some((row) => row.course_id === workflowPublication.courseId),
    false,
    "Um curso privado nunca deve aparecer nas coleções oficiais."
  );

  const disposableRun = unwrap(await request(`${edgeUrl}/v1/runs`, {
    method: "POST",
    headers: apiKeyHeaders(catalogApiKey),
    body: JSON.stringify({
      requestId: randomUUID(),
      target: "catalog",
      title: `Execução descartável ${suffix}`,
      contractKey: `course-authoring-cancel-${suffix}`,
      publicationIntent: { mode: "create" }
    }),
    label: "criação da execução descartável"
  }));
  const cancelled = unwrap(await request(`${edgeUrl}/v1/runs/${disposableRun.runId}/cancel`, {
    method: "POST",
    headers: apiKeyHeaders(catalogApiKey),
    body: JSON.stringify({
      requestId: randomUUID(),
      reason: "Verificação do encerramento explícito no smoke local."
    }),
    label: "cancelamento da execução"
  }));
  assert.equal(cancelled.status, "cancelled");

  const catalogAfterImport = await listAuthorizedCatalog(
    accessToken,
    document.courses[0].title,
    "curso publicado no catálogo autorizado"
  );
  const stored = catalogAfterImport.find((row) => row.course_id === publication.courseId);
  assert.ok(stored, "O curso publicado deve estar visível pela RPC autorizada do catálogo.");
  assert.equal(stored.contract_key, document.courses[0].id);
  assert.equal(stored.title, document.courses[0].title);

  const dataprevCourse = JSON.parse(await fs.readFile(
    new URL("../fixtures/catalog/dataprev-analista-processamento-seed-course.json", import.meta.url),
    "utf8"
  ));
  const dataprevSource = {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [dataprevCourse]
  };
  const dataprevDocument = uniqueDocument(dataprevSource, `${suffix}-dataprev`);
  const dataprevImportEnvelope = await request(`${edgeUrl}/v1/imports`, {
    method: "POST",
    headers: userHeaders(accessToken),
    body: JSON.stringify({
      requestId: randomUUID(),
      target: "catalog",
      publicationIntent: { mode: "create" },
      document: dataprevDocument
    }),
    label: "importação real da fixture Dataprev"
  });
  assertCompactResponse(dataprevImportEnvelope, "importação real da fixture Dataprev");
  const dataprevImported = unwrap(dataprevImportEnvelope);
  assert.equal(dataprevImported.status, "validated");
  assert.match(dataprevImported.runId, /^[0-9a-f-]{36}$/u);

  const { publication: dataprevPublication } = await publishUntilComplete(
    `${edgeUrl}/v1/runs/${dataprevImported.runId}/publish`,
    {
      headers: userHeaders(accessToken),
      label: "materialização relacional da fixture Dataprev",
      maxAttempts: 300
    }
  );
  assert.equal(dataprevPublication.status, "published");

  const dataprevRun = unwrap(await request(`${edgeUrl}/v1/runs/${dataprevImported.runId}`, {
    method: "GET",
    headers: userHeaders(accessToken),
    label: "consulta final da execução Dataprev"
  }));
  assert.equal(dataprevRun.status, "published");
  assert.equal(dataprevRun.courseId, dataprevPublication.courseId);
  assert.equal(dataprevRun.documentHash, dataprevPublication.documentHash);
  assertCompactResponse({ ok: true, data: dataprevRun }, "consulta final da execução Dataprev");

  const catalogAfterDataprev = await listAuthorizedCatalog(
    accessToken,
    dataprevDocument.courses[0].title,
    "curso Dataprev no catálogo autorizado"
  );
  const dataprevStored = catalogAfterDataprev.find(
    (row) => row.course_id === dataprevPublication.courseId
  );
  assert.ok(dataprevStored, "A fixture Dataprev deve estar visível pela RPC autorizada do catálogo.");
  assert.equal(dataprevStored.contract_key, dataprevDocument.courses[0].id);
  assert.equal(dataprevStored.title, dataprevDocument.courses[0].title);

  console.log(
    "Smoke da API de autoria: aprovado (Auth, papéis, chaves isoladas, curso privado, reparo, cancelamento e publicação assíncrona da fixture Dataprev)."
  );
} finally {
  if (privateUserId) {
    const response = await fetch(`${projectUrl}/auth/v1/admin/users/${privateUserId}`, {
      method: "DELETE",
      headers: adminHeaders()
    });
    if (!response.ok) {
      const body = await readBody(response);
      console.warn(`Teardown não removeu o autor privado temporário: HTTP ${response.status}: ${body?.message || body}`);
    }
  }
  if (userId) {
    const response = await fetch(`${projectUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: adminHeaders()
    });
    if (!response.ok) {
      const body = await readBody(response);
      console.warn(`Teardown não removeu o usuário temporário: HTTP ${response.status}: ${body?.message || body}`);
    }
  }
}
