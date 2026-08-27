import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import {
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH,
  AUTHORING_PROTOCOL_V1_TOOLS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  applyCourseAuthoringPlanCommand
} from "../../supabase/functions/_shared/aralearn/runtime/domain/courseAuthoringPlan.js";
import {
  forChatGptActionDocumentation,
  projectAuthoringProtocolToolsForActions
} from "../../scripts/projectChatGptActionSchemas.mjs";

const ORIGIN = "https://chatgpt.com";
const BASE_URL = "https://project.example/functions/v1/aralearn-authoring-action";
const APP_URL = "https://app.example/";
const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const ANNOTATION_ID = "20000000-0000-4000-8000-000000000002";
const PLAN_ID = "30000000-0000-4000-8000-000000000003";
const PART_ID = "40000000-0000-4000-8000-000000000004";

function annotation({ state = "open" } = {}) {
  return {
    annotationId: ANNOTATION_ID,
    annotationVersion: state === "open" ? 1 : 2,
    provenance: { origin: "author", channel: "authoring_chat" },
    contributor: { kind: "self", role: "author" },
    target: { kind: "study_unit", id: "unit-a", currentAvailable: true },
    observedRevision: { certainty: "known", courseRevision: 3, targetVersion: 1 },
    rawText: "Rever a explicação antes da publicação.",
    category: "suggestion",
    briefSummary: "Rever a explicação",
    subjectClassification: { status: "unclassified", effective: { subjects: [] } },
    state,
    ownerResponse: null,
    capabilities: {
      canRevise: false,
      canWithdraw: false,
      canConsider: false,
      canRespond: false,
      canResolve: state === "open",
      canReopen: state !== "open",
      canCorrectSubjects: false
    }
  };
}

function createHandler(overrides = {}) {
  return createAuthoringActionHandler({
    adapter: {
      async resolveActionPrincipal(accessTokenHash) {
        assert.match(accessTokenHash, /^[0-9a-f]{64}$/u);
        return {
          actorId: ACTOR_ID,
          authenticationKind: "action",
          scopes: ["authoring:read", "authoring:write"]
        };
      },
      async listCourses() {
        return {
          contract: "aralearn.course-list.v1",
          items: [{
            courseId: ACTOR_ID,
            title: "Curso corrente",
            goal: "Objetivo",
            revision: 3,
            updatedAt: "2026-08-24T12:00:00Z",
            deepLink: "https://app.example/#/authoring"
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      ...overrides
    },
    allowedOrigins: new Set([ORIGIN, "https://app.example"]),
    actionBaseUrl: BASE_URL,
    publicAppUrl: APP_URL
  });
}

function request(path, body = {}, headers = {}) {
  return new Request(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer action-token",
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

test("Actions lista Cursos pelo canal HTTP e pelo principal opaco próprio", async () => {
  let resolved = 0;
  const response = await createHandler({
    async resolveActionPrincipal(hash) {
      resolved += 1;
      assert.match(hash, /^[0-9a-f]{64}$/u);
      return {
        actorId: ACTOR_ID,
        authenticationKind: "action",
        scopes: ["authoring:read", "authoring:write"]
      };
    }
  })(request("listarCursos"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.items[0].title, "Curso corrente");
  assert.equal(resolved, 1);
});

test("Actions lê e altera Observações com destinatário e principal próprios", async () => {
  let mutation = null;
  const handler = createHandler({
    async getCourseAnchoredAnnotations(value) {
      assert.equal(value.principal.authenticationKind, "action");
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId: ACTOR_ID,
        courseRevision: 3,
        annotationSetVersion: 1,
        summary: {
          matchingTotal: 1,
          byOrigin: { author: 1 },
          byChannel: { authoring_chat: 1 },
          byState: { open: 1 },
          unclassifiedTotal: 1
        },
        items: [annotation()],
        hasMore: false,
        nextCursor: null
      };
    },
    async executeCourseAnchoredAnnotationCommand(value) {
      mutation = value;
      return {
        contract: "aralearn.course-anchored-annotation-change.v1",
        courseId: ACTOR_ID,
        courseRevision: 3,
        annotationSetVersion: 2,
        requestId: value.requestId,
        idempotent: false,
        changed: true,
        annotation: annotation({ state: "resolved" })
      };
    }
  });

  const readResponse = await handler(request("lerCurso", {
    courseId: ACTOR_ID,
    view: "anchored_annotations",
    expectedRevision: 3,
    mode: "detail",
    annotationId: ANNOTATION_ID,
    includeObservationText: true
  }));
  assert.equal(readResponse.status, 200);
  const read = await readResponse.json();
  assert.equal(read.data.items[0].rawText, "Rever a explicação antes da publicação.");
  assert.equal(read.data.dataDisclosure.recipient, "connected_actions_gpt");
  assert.equal(read.data.dataDisclosure.rawObservationTextIncluded, true);

  const changeResponse = await handler(request("alterarCurso", {
    requestId: "request-action-observation-0001",
    courseId: ACTOR_ID,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "resolve_anchored_annotation",
      annotationId: ANNOTATION_ID,
      expectedAnnotationVersion: 1
    }
  }));
  assert.equal(changeResponse.status, 200);
  const change = await changeResponse.json();
  assert.equal(mutation.principal.authenticationKind, "action");
  assert.equal(mutation.command.type, "resolve_anchored_annotation");
  assert.equal(change.data.annotation.state, "resolved");
  assert.equal(change.data.dataDisclosure.recipient, "connected_actions_gpt");
});

test("Actions lê, altera e relê o plano com CAS, Parte e deep link preservados", async () => {
  let courseRevision = 1;
  let commitCalls = 0;
  let plan = {
    id: PLAN_ID,
    version: 1,
    title: "Curso corrente",
    objective: "Objetivo inicial",
    audience: "",
    scope: "",
    preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
    intendedLearningOutcomes: [],
    instructionalAnalysisUnits: [],
    evidenceRequirements: [],
    parts: []
  };
  const deepLink = `${APP_URL}#/authoring/courses/${ACTOR_ID}?section=planning`;
  const handler = createHandler({
    async getCourseInstructionalPlan({ courseId }) {
      assert.equal(courseId, ACTOR_ID);
      return {
        contract: "aralearn.course-instructional-plan.v1",
        courseId,
        courseRevision,
        plan: structuredClone(plan),
        recentActivity: [],
        deepLink
      };
    },
    async commitCourseInstructionalPlan(value) {
      commitCalls += 1;
      assert.equal(value.expectedCourseRevision, courseRevision);
      assert.equal(value.expectedPlanVersion, plan.version);
      const { version: currentPlanVersion, ...editablePlan } = plan;
      const nextPlan = applyCourseAuthoringPlanCommand(editablePlan, value.command);
      courseRevision += 1;
      plan = { ...nextPlan, version: currentPlanVersion + 1 };
      return {
        contract: "aralearn.course-instructional-plan-change.v1",
        courseId: ACTOR_ID,
        courseRevision,
        planId: PLAN_ID,
        planVersion: plan.version,
        requestId: value.requestId,
        idempotent: false,
        changed: true,
        deepLink
      };
    }
  });

  const readPlan = async () => {
    const response = await handler(request("lerCurso", {
      courseId: ACTOR_ID,
      view: "instructional_plan"
    }));
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const changePlan = async (requestId, current, planCommand) => {
    const response = await handler(request("alterarCurso", {
      requestId,
      courseId: ACTOR_ID,
      expectedRevision: current.courseRevision,
      expectedPlanVersion: current.plan.version,
      operation: "update_instructional_plan",
      planCommand
    }));
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload.data;
  };

  const before = await readPlan();
  assert.equal(before.courseRevision, 1);
  assert.equal(before.plan.version, 1);
  assert.equal(before.deepLink, deepLink);

  const overviewChange = await changePlan("action-plan-overview-0001", before, {
    type: "update_plan",
    objective: "Objetivo persistido pela Action",
    audience: "Pessoas autoras"
  });
  assert.equal(overviewChange.courseRevision, 2);
  assert.equal(overviewChange.planVersion, 2);
  assert.equal(overviewChange.deepLink, deepLink);
  const afterOverview = await readPlan();
  assert.equal(afterOverview.plan.objective, "Objetivo persistido pela Action");
  assert.equal(afterOverview.plan.audience, "Pessoas autoras");
  assert.equal(afterOverview.courseRevision, 2);
  assert.equal(afterOverview.plan.version, 2);

  const partChange = await changePlan("action-plan-part-0001", afterOverview, {
    type: "add_part",
    id: PART_ID,
    position: 0,
    title: "Fundamentos verificáveis",
    intent: "Organizar a primeira progressão didática."
  });
  assert.equal(partChange.courseRevision, 3);
  assert.equal(partChange.planVersion, 3);
  const afterPart = await readPlan();
  assert.deepEqual(afterPart.plan.parts, [{
    id: PART_ID,
    position: 0,
    title: "Fundamentos verificáveis",
    intent: "Organizar a primeira progressão didática.",
    microsequenceIds: []
  }]);

  const invalid = await handler(request("alterarCurso", {
    requestId: "action-plan-invalid-0001",
    courseId: ACTOR_ID,
    expectedRevision: afterPart.courseRevision,
    expectedPlanVersion: afterPart.plan.version,
    operation: "update_instructional_plan",
    planCommand: { type: "tipo_inexistente" }
  }));
  const invalidPayload = await invalid.json();
  assert.equal(invalid.status, 422);
  assert.equal(invalidPayload.error.code, "invalid_course_authoring_plan_command");
  assert.equal(commitCalls, 2);
  assert.equal((await readPlan()).plan.version, 3);
});

test("Actions não aceita o bearer sem passar pelo resolvedor específico", async () => {
  const response = await createHandler()(new Request(`${BASE_URL}/listarCursos`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: "{}"
  }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.equal((await response.json()).error.code, "authentication_required");
});

test("Actions limita origem, rota e corpo sem abrir transporte genérico", async () => {
  const forbiddenOrigin = await createHandler()(request(
    "listarCursos",
    {},
    { Origin: "https://untrusted.example" }
  ));
  assert.equal(forbiddenOrigin.status, 403);

  const unknown = await createHandler()(request("operarQualquerCoisa"));
  assert.equal(unknown.status, 404);

  const oversized = await createHandler()(request("listarCursos", {
    query: "x".repeat(97 * 1024)
  }));
  assert.equal(oversized.status, 413);
});

test("Actions preserva as cinco operações correntes e rejeita Workspace", async () => {
  const openApi = JSON.parse(await readFile(
    new URL(
      "../../docs/downloads/aralearn-chatgpt-action-openapi.yaml",
      import.meta.url
    ),
    "utf8"
  ));
  assert.equal(openApi.openapi, "3.1.0");
  assert.deepEqual(
    Object.keys(openApi.paths),
    AUTHORING_PROTOCOL_V1_TOOLS.map(({ name }) => `/${name}`)
  );
  assert.equal(JSON.stringify(openApi).includes("Workspace"), false);
  assert.ok(openApi.components.schemas.SuccessResponse);
  assert.ok(openApi.components.schemas.ErrorResponse);
  for (const pathValue of Object.values(openApi.paths)) {
    assert.ok(pathValue.post.description.length <= 300);
  }
  for (const tool of AUTHORING_PROTOCOL_V1_TOOLS) {
    assert.equal(
      openApi.paths[`/${tool.name}`].post.description,
      forChatGptActionDocumentation(tool.description)
    );
  }
  const oauth = openApi.components.securitySchemes.AraLearnOAuth;
  assert.match(
    openApi.paths["/consultarComponentesDidaticos"].post.description,
    /contracts aceita exatamente um package/iu
  );
  assert.match(oauth.flows.authorizationCode.authorizationUrl, /authoring-action\/oauth\/authorize$/u);
  assert.doesNotMatch(oauth.flows.authorizationCode.authorizationUrl, /authoring-mcp/u);
});

test("OAuth de Actions cadastra credencial confidencial sem expor seu hash", async () => {
  let registration = null;
  const response = await createHandler({
    async resolveApplicationUser() {
      return { id: ACTOR_ID };
    },
    async createActionOAuthClientSetup(value) {
      registration = value;
      return { clientId: "40000000-0000-4000-8000-000000000004" };
    }
  })(request("oauth/clients/register", {}));
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.match(payload.client_secret, /^ars_[A-Za-z0-9_-]{40,}$/u);
  assert.match(registration.clientSecretHash, /^[0-9a-f]{64}$/u);
  assert.notEqual(payload.client_secret, registration.clientSecretHash);
  assert.equal(payload.token_endpoint_auth_method, "client_secret_post");
});

test("OpenAPI de Actions permanece derivado do catálogo corrente e compacto", async () => {
  const file = await readFile(
    new URL(
      "../../docs/downloads/aralearn-chatgpt-action-openapi.yaml",
      import.meta.url
    )
  );
  assert.ok(file.byteLength < 128 * 1024);
  const openApi = JSON.parse(file);
  assert.equal(openApi.info["x-aralearn-protocol"], AUTHORING_PROTOCOL_ID);
  assert.equal(
    openApi.info["x-aralearn-protocol-schema-version"],
    AUTHORING_PROTOCOL_SCHEMA_VERSION
  );
  assert.equal(
    openApi.info["x-aralearn-contract-fingerprint"],
    AUTHORING_PROTOCOL_V1_SCHEMA_HASH
  );
  const inputSchemas = Object.values(openApi.paths).map(
    ({ post }) => post.requestBody.content["application/json"].schema
  );
  assert.equal(inputSchemas.some((schema) => JSON.stringify(schema).includes('"allOf"')), false);
  assert.equal(inputSchemas.some((schema) => JSON.stringify(schema).includes('"const"')), false);
  const projected = projectAuthoringProtocolToolsForActions(AUTHORING_PROTOCOL_V1_TOOLS);
  for (const tool of projected) {
    const operation = openApi.paths[`/${tool.name}`]?.post;
    assert.equal(operation.operationId, tool.name);
    assert.ok(operation.requestBody.content["application/json"].schema, tool.name);
  }
});

test("migration de Actions restaura somente a execução server-side do OAuth", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260824130000_restore_gpt_actions_openapi.sql",
      import.meta.url
    ),
    "utf8"
  );
  for (const name of [
    "create_authoring_action_oauth_client_setup_v4",
    "link_authoring_action_oauth_client_v4",
    "create_authoring_action_oauth_authorization_v4",
    "get_authoring_action_oauth_authorization_v4",
    "approve_authoring_action_oauth_authorization_v4",
    "deny_authoring_action_oauth_authorization_v4",
    "exchange_authoring_action_oauth_code_v4",
    "exchange_authoring_action_oauth_refresh_v4",
    "resolve_authoring_action_oauth_principal_v4"
  ]) {
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]+?\\)\\s+to service_role;`, "u")
    );
  }
  assert.match(migration, /from public, anon, authenticated, service_role;/u);
  assert.match(migration, /has_function_privilege\([\s\S]+?'authenticated'[\s\S]+?'EXECUTE'[\s\S]+?\)/u);
});

test("OAuth de Actions resolve a pessoa sem consumir o resolvedor legado", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260824140000_detach_gpt_actions_from_legacy_oauth.sql",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(migration, /join auth\.users account_value/u);
  assert.match(migration, /join public\.person_profiles profile_value/u);
  assert.match(migration, /'contract', 'aralearn\.action-oauth-principal\.v1'/u);
  assert.doesNotMatch(
    migration,
    /v_principal\s*:=\s*public\.resolve_authoring_oauth_principal/u
  );
  assert.match(
    migration,
    /grant execute on function public\.resolve_authoring_action_oauth_principal_v4\(text\)\s+to service_role;/u
  );
});
