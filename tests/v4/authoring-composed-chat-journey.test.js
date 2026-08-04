import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/actionServer.js";
import {
  AuthoringApiError
} from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import {
  copyWorkspaceEntity,
  createWorkspaceStructure,
  saveWorkspaceCard,
  saveWorkspaceMicrosequenceCards,
  updateWorkspaceEntityMetadata
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceIncremental.js";
import {
  buildMicrotheoryReview,
  buildWorkspaceOutline,
  createEmptyAuthoringWorkspace,
  readWorkspaceEntity,
  selectCourseDocument
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";
import {
  diffWorkspaceDocument,
  flattenWorkspaceDocument
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceParts.js";
import {
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const ACTION_ORIGIN = "https://chatgpt.com";
const ACTION_URL = "https://edge.example/functions/v1/aralearn-authoring-action";
const APP_URL = "https://app.example/aralearn/";
const MCP_ORIGIN = "https://client.example";
const MCP_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const AUTHORIZATION_SERVER = "https://project.example/auth/v1";
const NOW = "2026-07-30T12:00:00.000Z";

const AUTHOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PUBLISHED_COURSE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const COURSE_PATH = ["course-dataprev-teste"];
const MODULE_PATH = [...COURSE_PATH, "module-computacao-nuvem-virtualizacao"];
const LESSON_PATH = [...MODULE_PATH, "lesson-fundamentos-nuvem"];
const MICROSEQUENCE_PATH = [...LESSON_PATH, "micro-modelos-servico"];

function authorPrincipal() {
  return {
    actorId: AUTHOR_ID,
    oauthClientId: "chatbot-dataprev",
    authenticationKind: "oauth",
    scopes: [
      "authoring:private:read",
      "authoring:private:write",
      "catalog:submit"
    ]
  };
}

function adminPrincipal() {
  return {
    actorId: ADMIN_ID,
    oauthClientId: "plugin-editorial",
    authenticationKind: "oauth",
    scopes: [
      "authoring:read",
      "authoring:write",
      "catalog:review",
      "catalog:publish"
    ]
  };
}

function dataprevStructure() {
  const parts = [
    {
      entityType: "course",
      parentPath: null,
      id: COURSE_PATH[0],
      title: "Dataprev: Teste",
      goal: "Preparar do nível iniciante para Computação em Nuvem e Virtualização na prova da FGV."
    },
    {
      entityType: "module",
      parentPath: COURSE_PATH,
      id: MODULE_PATH[1],
      title: "Computação em Nuvem e Virtualização",
      goal: "Cobrir integralmente a ementa da Dataprev com progressão autossuficiente e prática no estilo FGV.",
      include: [
        "modelos de serviço e implantação",
        "arquitetura, segurança, IaC e automação",
        "Docker, Harbor, Clair e Kubernetes",
        "VMware NSX, vCenter, vCloud Director e família vRealize"
      ],
      exclude: ["procedimentos não previstos na ementa sem valor explicativo"],
      notation: ["Defina toda sigla antes do primeiro uso."],
      avoid: ["Não presumir experiência prévia com infraestrutura."]
    },
    {
      entityType: "lesson",
      parentPath: MODULE_PATH,
      id: LESSON_PATH[2],
      title: "Fundamentos, modelos e benefícios da nuvem",
      goal: "Distinguir computação em nuvem, modelos de serviço, implantação e propriedades operacionais.",
      include: [
        "IaaS", "PaaS", "SaaS", "nuvem pública", "privada", "híbrida",
        "alta disponibilidade", "escalabilidade", "elasticidade",
        "agilidade", "recuperação de desastres"
      ],
      exclude: ["comparações comerciais entre provedores"],
      notation: ["Diferencie escalabilidade de elasticidade."],
      avoid: ["Não tratar os modelos de serviço como sinônimos."]
    },
    {
      entityType: "microsequence",
      parentPath: LESSON_PATH,
      id: MICROSEQUENCE_PATH[3],
      title: "IaaS, PaaS e SaaS",
      goal: "Classificar modelos de serviço pela divisão de responsabilidades.",
      role: "explain",
      covers: ["IaaS", "PaaS", "SaaS", "responsabilidade compartilhada"],
      checks: ["classifica um cenário e justifica a responsabilidade do cliente"],
      errors: ["classificar pelo nome do fornecedor em vez da camada gerenciada"]
    }
  ];
  const lessonPlans = [
    {
      id: "lesson-arquitetura-seguranca",
      title: "Arquitetura, identidade e segurança",
      goal: "Relacionar regiões, zonas, recursos, identidade, privacidade, conformidade e segurança.",
      microsequences: [
        ["micro-regioes-zonas", "Regiões e zonas de disponibilidade"],
        ["micro-governanca-recursos", "Subscrições, grupos de gestão e recursos"],
        ["micro-identidade-conformidade", "Identidade, privacidade, conformidade e segurança"]
      ]
    },
    {
      id: "lesson-iac-containers",
      title: "IaC, automação, contêineres e orquestração",
      goal: "Analisar automação declarativa e o ecossistema de imagens e contêineres.",
      microsequences: [
        ["micro-iac-automacao", "Infrastructure as Code e automação"],
        ["micro-docker-harbor-clair", "Docker, Harbor e Red Hat Clair"],
        ["micro-kubernetes", "Kubernetes"]
      ]
    },
    {
      id: "lesson-vmware",
      title: "Plataforma VMware",
      goal: "Distinguir as funções dos componentes VMware previstos na ementa.",
      microsequences: [
        ["micro-nsx-vcenter-vcloud", "NSX, vCenter Server e vCloud Director"],
        ["micro-vrealize", "vRealize Automation, Log Insight, Operations e Orchestrator"]
      ]
    },
    {
      id: "lesson-revisao-fgv",
      title: "Integração e treino FGV",
      goal: "Resolver situações discriminativas que integrem toda a ementa.",
      microsequences: [
        ["micro-revisao-integrada", "Revisão integrada"],
        ["micro-simulado-fgv", "Simulado no padrão FGV"]
      ]
    }
  ];
  for (const lessonPlan of lessonPlans) {
    const lessonPath = [...MODULE_PATH, lessonPlan.id];
    parts.push({
      entityType: "lesson",
      parentPath: MODULE_PATH,
      id: lessonPlan.id,
      title: lessonPlan.title,
      goal: lessonPlan.goal,
      include: lessonPlan.microsequences.map(([, title]) => title),
      exclude: [],
      notation: ["Expanda siglas no primeiro uso."],
      avoid: ["Não cobrar um produto antes de explicar sua função."]
    });
    lessonPlan.microsequences.forEach(([id, title]) => {
      parts.push({
        entityType: "microsequence",
        parentPath: lessonPath,
        id,
        title,
        goal: `Distinguir e aplicar ${title} em cenários de prova.`,
        role: title.includes("Simulado") ? "practice" : "explain",
        covers: [title],
        checks: ["seleciona a alternativa tecnicamente coerente"],
        errors: ["confundir produtos ou propriedades com nomes semelhantes"]
      });
    });
  }
  return parts;
}

function dataprevCards() {
  return [
    {
      id: "card-cid-teoria",
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Responsabilidade por camada",
      topics: ["computacao-em-nuvem", "modelos-de-servico", "fgv"],
      languageTag: "pt-BR",
      textDirection: "ltr",
      text: "Em IaaS, o cliente gerencia mais camadas; em PaaS, concentra-se na aplicação e nos dados; em SaaS, utiliza a aplicação pronta.",
      after: "A responsabilidade do provedor aumenta de IaaS para SaaS, mas o cliente nunca deixa de responder pelo uso e pelos dados."
    },
    {
      id: "card-modelos-gap",
      resource: "table",
      kind: "exercise",
      exercise: "gap",
      title: "Complete a divisão de responsabilidades",
      columns: ["Modelo", "Responsabilidade típica do cliente"],
      rows: [
        ["IaaS", "Gerencia {gap:iaas-layer}."],
        ["PaaS", "Gerencia principalmente {gap:paas-layer}."],
        ["SaaS", "Usa a {gap:saas-layer}."]
      ],
      gaps: [
        {
          id: "iaas-layer",
          response: "choice",
          answer: "sistema operacional",
          distractors: ["datacenter físico", "aplicação SaaS"]
        },
        {
          id: "paas-layer",
          response: "choice",
          answer: "aplicação e dados",
          distractors: ["energia elétrica", "hipervisor"]
        },
        {
          id: "saas-layer",
          response: "choice",
          answer: "aplicação pronta",
          distractors: [
            "infraestrutura física",
            "plataforma de contêineres"
          ]
        }
      ],
      after: "A abstração cresce de IaaS para SaaS e reduz as camadas administradas diretamente pelo cliente."
    },
    {
      id: "card-cid-controle",
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Controle no IaaS",
      languageTag: "pt-BR",
      textDirection: "ltr",
      text: "IaaS entrega recursos de infraestrutura virtualizados e mantém sob responsabilidade do cliente o sistema operacional e as aplicações.",
      after: "Quanto maior o controle direto, maior a parcela operacional assumida pelo cliente."
    },
    {
      id: "card-cid-plataforma",
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Foco no PaaS",
      topics: ["plataforma", "responsabilidade-compartilhada"],
      text: "PaaS abstrai a administração do sistema operacional e do runtime para que a equipe se concentre na aplicação e nos dados.",
      after: "A plataforma reduz trabalho operacional sem eliminar decisões de desenvolvimento e proteção de dados."
    },
    {
      id: "card-cid-servico",
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Consumo no SaaS",
      text: "SaaS fornece a aplicação pronta como serviço, enquanto o cliente administra acesso, configuração de uso e seus próprios dados.",
      after: "Aplicação pronta não significa ausência de responsabilidade do usuário."
    }
  ];
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function viewContent(document, {
  view = "outline",
  entityType = null,
  entityPath = null,
  includeDescendants = true
} = {}) {
  if (view === "outline") return buildWorkspaceOutline(document);
  if (view === "microtheories") return buildMicrotheoryReview(document, entityPath);
  if (view === "entity") {
    return readWorkspaceEntity(document, entityType, entityPath, {
      includeDescendants
    });
  }
  return structuredClone(document);
}

function forbiddenMutationKeys(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => forbiddenMutationKeys(item, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, item] of Object.entries(value)) {
    if (new Set([
      "snapshot", "document", "artifact", "courses", "modules",
      "lessons", "microsequences"
    ]).has(key)) {
      found.push(key);
    }
    forbiddenMutationKeys(item, found);
  }
  return found;
}

function createJourneyAdapter() {
  const workspaces = new Map();
  const publications = new Map();
  const submissions = new Map();
  const mutationLog = [];
  const contextLog = [];

  function control(state, extra = {}) {
    const publicationLinks = [...publications.values()]
      .filter((publication) => publication.workspaceId === state.workspaceId)
      .map((publication) => ({
        workspaceCourseId: publication.workspaceCourseId,
        target: publication.target,
        courseId: publication.courseId,
        contentHash: publication.contentHash,
        completionState: publication.completionState,
        updatedAt: NOW
      }));
    return {
      workspaceId: state.workspaceId,
      title: state.title,
      revision: state.revision,
      currentRevision: state.revision,
      entityCount: flattenWorkspaceDocument(state.document).length,
      publications: publicationLinks,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      idempotent: false,
      ...(state.sourceSubmissionId
        ? { sourceSubmissionId: state.sourceSubmissionId }
        : {}),
      ...extra
    };
  }

  function workspace(workspaceId) {
    const state = workspaces.get(workspaceId);
    assert.ok(state, `Workspace ausente no mock: ${workspaceId}`);
    return state;
  }

  function assertRevision(state, expectedRevision) {
    assert.equal(expectedRevision, state.revision, "A jornada usou revisão obsoleta.");
  }

  function versionedRows(document) {
    return flattenWorkspaceDocument(document).map((row, index) => ({
      ...row,
      version: index + 1
    }));
  }

  const mutationHandlers = {
    create_structure: createWorkspaceStructure,
    save_microsequence_cards: saveWorkspaceMicrosequenceCards,
    update_metadata: updateWorkspaceEntityMetadata,
    save_card: saveWorkspaceCard,
    copy_entity: copyWorkspaceEntity
  };

  return {
    mutationLog,
    contextLog,
    workspaces,
    submissions,

    async resolveActionPrincipal(accessTokenHash) {
      assert.match(accessTokenHash, /^[0-9a-f]{64}$/u);
      return authorPrincipal();
    },

    async resolvePrincipal() {
      return adminPrincipal();
    },

    async createWorkspace({
      workspaceId,
      title,
      brief = "",
      sourceSubmissionId = null
    }) {
      const state = {
        workspaceId,
        title,
        brief,
        revision: 1,
        document: sourceSubmissionId
          ? structuredClone(submissions.get(sourceSubmissionId).document)
          : createEmptyAuthoringWorkspace(),
        sourceSubmissionId,
        createdAt: NOW,
        updatedAt: NOW
      };
      workspaces.set(workspaceId, state);
      return control(state);
    },

    async mutateWorkspace({
      workspaceId,
      expectedRevision,
      operation,
      arguments: operationArguments
    }) {
      const state = workspace(workspaceId);
      assertRevision(state, expectedRevision);
      const handler = mutationHandlers[operation];
      assert.ok(handler, `Operação inesperada no mock composto: ${operation}`);
      const currentRows = versionedRows(state.document);
      const nextDocument = handler(state.document, operationArguments);
      const diff = diffWorkspaceDocument(currentRows, nextDocument);

      mutationLog.push({
        operation,
        arguments: structuredClone(operationArguments),
        upsertTypes: diff.upserts.map(({ entityType }) => entityType),
        deletedTypes: diff.deletes.map(({ entityType }) => entityType),
        upsertsHaveIntegralChildren: diff.upserts.some(({ content }) =>
          forbiddenMutationKeys(content).length > 0)
      });

      state.document = nextDocument;
      state.revision += 1;
      return control(state, {
        change: {
          operation,
          created: diff.upserts.length,
          updated: 0,
          deleted: diff.deletes.length
        }
      });
    },

    async updateWorkspaceBrief({
      workspaceId,
      expectedRevision,
      brief
    }) {
      const state = workspace(workspaceId);
      assertRevision(state, expectedRevision);
      state.brief = brief;
      state.revision += 1;
      contextLog.push({ workspaceId, brief });
      return control(state, {
        change: {
          operation: "update_brief",
          created: 0,
          updated: 0,
          deleted: 0
        }
      });
    },

    async getWorkspace({
      workspaceId,
      view,
      entityType,
      entityPath,
      includeDescendants
    }) {
      const state = workspace(workspaceId);
      return control(state, {
        brief: state.brief,
        view,
        content: viewContent(state.document, {
          view,
          entityType,
          entityPath,
          includeDescendants
        })
      });
    },

    async publishWorkspaceCourse({
      workspaceId,
      expectedRevision,
      courseId,
      target,
      existingCourseId = null,
      expectedContentHash = null
    }) {
      const state = workspace(workspaceId);
      assertRevision(state, expectedRevision);
      assert.equal(target, "private");
      const currentPublication = [...publications.values()].find(
        (publication) =>
          publication.workspaceId === workspaceId
          && publication.workspaceCourseId === courseId
          && publication.target === target
      );
      assert.equal(existingCourseId == null, expectedContentHash == null);
      if (currentPublication && existingCourseId != null) {
        assert.equal(existingCourseId, currentPublication.courseId);
        assert.equal(expectedContentHash, currentPublication.contentHash);
      }
      const document = selectCourseDocument(state.document, courseId);
      const course = document.courses[0];
      const contentHash = sha256(document);
      const publishedCourseId =
        currentPublication?.courseId
        || existingCourseId
        || PUBLISHED_COURSE_ID;
      publications.set(publishedCourseId, {
        workspaceId,
        workspaceCourseId: courseId,
        target,
        courseId: publishedCourseId,
        contentHash,
        document,
        title: course.title,
        goal: course.goal,
        completionState: "partial"
      });
      return {
        workspaceId,
        revision: state.revision,
        courseId: publishedCourseId,
        contentHash,
        completionState: "partial",
        target: "private",
        idempotent: false
      };
    },

    async submitCourseForReview({
      submissionId,
      courseId,
      expectedContentHash,
      note = null
    }) {
      const publication = publications.get(courseId);
      assert.ok(publication);
      assert.equal(expectedContentHash, publication.contentHash);
      const active = [...submissions.values()].find((submission) =>
        submission.courseId === courseId
        && new Set(["submitted", "in_review"]).has(submission.status)
      );
      if (active?.sourceRevisionHash === expectedContentHash) {
        return {
          submissionId: active.submissionId,
          status: active.status,
          idempotent: true
        };
      }
      if (active?.status === "in_review") {
        throw new AuthoringApiError(
          409,
          "catalog_review_in_progress",
          "A revisão anterior já foi assumida."
        );
      }
      if (active?.status === "submitted") {
        active.status = "superseded";
        active.reviewerNote =
          "Submissão substituída automaticamente por uma revisão mais recente deste curso.";
        active.decidedAt = NOW;
        active.updatedAt = NOW;
      }
      const submission = {
        submissionId,
        courseId,
        sourceRevisionHash: publication.contentHash,
        title: publication.title,
        goal: publication.goal,
        completionState: publication.completionState,
        status: "submitted",
        authorNote: note,
        authorId: AUTHOR_ID,
        reviewerId: null,
        reviewWorkspaceId: null,
        claimExpiresAt: null,
        reviewerNote: null,
        officialCourseId: null,
        submittedAt: NOW,
        decidedAt: null,
        updatedAt: NOW,
        document: structuredClone(publication.document)
      };
      submissions.set(submissionId, submission);
      return { submissionId, status: "submitted", idempotent: false };
    },

    async listCatalogReviews({ view }) {
      const visible = [...submissions.values()].filter((submission) =>
        view === "mine"
          ? submission.authorId === AUTHOR_ID
          : new Set(["submitted", "in_review"]).has(submission.status)
      );
      return {
        view,
        items: visible.map((submission) => ({
          submissionId: submission.submissionId,
          courseId: submission.courseId,
          sourceRevisionHash: submission.sourceRevisionHash,
          title: submission.title,
          completionState: submission.completionState,
          status: submission.status,
          authorNote: submission.authorNote,
          authorId: submission.authorId,
          reviewerId: submission.reviewerId,
          reviewWorkspaceId: submission.reviewWorkspaceId,
          claimExpiresAt: submission.claimExpiresAt,
          reviewerNote: submission.reviewerNote,
          officialCourseId: submission.officialCourseId,
          submittedAt: submission.submittedAt,
          decidedAt: submission.decidedAt,
          updatedAt: submission.updatedAt
        })),
        hasMore: false,
        nextCursor: null
      };
    },

    async readCatalogReview({
      submissionId,
      view,
      entityType,
      entityPath,
      includeDescendants
    }) {
      const submission = submissions.get(submissionId);
      assert.ok(submission);
      return {
        submissionId,
        courseId: submission.courseId,
        title: submission.title,
        goal: submission.goal,
        completionState: submission.completionState,
        status: submission.status,
        view,
        content: viewContent(submission.document, {
          view,
          entityType,
          entityPath,
          includeDescendants
        })
      };
    },

    async createCatalogReviewWorkspace({
      submissionId,
      workspaceId,
      title
    }) {
      const submission = submissions.get(submissionId);
      assert.ok(submission);
      submission.status = "in_review";
      submission.reviewerId = ADMIN_ID;
      submission.reviewWorkspaceId = workspaceId;
      submission.claimExpiresAt = "2026-07-30T12:30:00.000Z";
      const state = {
        workspaceId,
        title,
        brief: "Revisar o curso submetido e registrar ajustes editoriais.",
        revision: 1,
        document: structuredClone(submission.document),
        sourceSubmissionId: submissionId,
        createdAt: NOW,
        updatedAt: NOW
      };
      workspaces.set(workspaceId, state);
      return control(state);
    },

    async decideCatalogReview({ submissionId, decision, note }) {
      const submission = submissions.get(submissionId);
      assert.ok(submission);
      assert.equal(decision, "request_changes");
      assert.match(note, /fonte/iu);
      submission.status = "changes_requested";
      submission.reviewerNote = note;
      submission.claimExpiresAt = null;
      submission.decidedAt = NOW;
      submission.updatedAt = NOW;
      return {
        submissionId,
        status: submission.status,
        idempotent: false
      };
    }
  };
}

function actionHandler(adapter) {
  return createAuthoringActionHandler({
    adapter,
    allowedOrigins: new Set([ACTION_ORIGIN]),
    actionBaseUrl: ACTION_URL,
    publicAppUrl: APP_URL
  });
}

function actionRequest(name, body) {
  return new Request(`${ACTION_URL}/${name}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer author-token",
      Origin: ACTION_ORIGIN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function actionCall(handler, name, argumentsValue) {
  const response = await handler(actionRequest(name, argumentsValue));
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.ok, true, JSON.stringify(payload));
  return payload.data;
}

function mcpHandler(adapter) {
  return createAuthoringMcpHandler({
    adapter,
    allowedOrigins: new Set([MCP_ORIGIN]),
    resourceUrl: MCP_URL,
    authorizationServer: AUTHORIZATION_SERVER
  });
}

let mcpRequestId = 0;

function mcpRequest(name, argumentsValue) {
  mcpRequestId += 1;
  return new Request(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      Origin: MCP_ORIGIN,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: mcpRequestId,
      method: "tools/call",
      params: { name, arguments: argumentsValue }
    })
  });
}

async function mcpCall(handler, name, argumentsValue) {
  const response = await handler(mcpRequest(name, argumentsValue));
  const envelope = await response.json();
  assert.equal(response.status, 200, JSON.stringify(envelope));
  assert.equal(envelope.result.isError, false, JSON.stringify(envelope.result));
  return envelope.result.structuredContent.data;
}

test("contratos compostos mantêm argumentos estritos, cardsJson e mutações sem documento integral", () => {
  const structureArguments = {
    requestId: "dataprev-structure-0001",
    workspaceId: "11111111-1111-4111-8111-111111111111",
    expectedRevision: 1,
    parts: dataprevStructure()
  };
  const cardsArguments = {
    requestId: "dataprev-cards-0001",
    workspaceId: structureArguments.workspaceId,
    expectedRevision: 2,
    microsequencePath: MICROSEQUENCE_PATH,
    mode: "replace",
    cardsJson: JSON.stringify(dataprevCards())
  };
  const structure = mapAuthoringMcpToolCall(
    "criarEstruturaNoWorkspace",
    structureArguments
  );
  const cards = mapAuthoringMcpToolCall(
    "salvarCardsNaMicrossequencia",
    cardsArguments
  );

  assert.deepEqual(Object.keys(structure.body.arguments), ["parts"]);
  assert.deepEqual(cards.body.arguments.cards, dataprevCards());
  assert.equal(Object.hasOwn(cards.body.arguments, "cardsJson"), false);
  assert.deepEqual(
    Object.keys(cards.body.arguments).sort(),
    ["cards", "microsequencePath", "mode", "status"]
  );
  assert.deepEqual(forbiddenMutationKeys(structure.body), []);
  assert.deepEqual(forbiddenMutationKeys(cards.body), []);

  assert.throws(
    () => mapAuthoringMcpToolCall("criarEstruturaNoWorkspace", {
      ...structureArguments,
      snapshot: { courses: [] }
    }),
    (error) => error?.code === "invalid_tool_arguments"
      && error?.details?.path === "arguments.snapshot"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("criarEstruturaNoWorkspace", {
      ...structureArguments,
      parts: [{ ...dataprevStructure()[0], modules: [] }]
    }),
    (error) => error?.code === "invalid_tool_arguments"
      && error?.details?.path === "arguments.parts[0].modules"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("salvarCardsNaMicrossequencia", {
      ...cardsArguments,
      cardsJson: "{não é JSON"
    }),
    (error) => error?.code === "invalid_tool_arguments"
      && /cardsJson/u.test(error.message)
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("salvarCardsNaMicrossequencia", {
      ...cardsArguments,
      cards: dataprevCards()
    }),
    (error) => error?.code === "invalid_tool_arguments"
      && error?.details?.path === "arguments.cards"
  );
});

test("Action e MCP recusam a mesma ampliação indevida do contrato composto", async () => {
  const adapter = createJourneyAdapter();
  const invalid = {
    requestId: "strict-cards-0001",
    workspaceId: "11111111-1111-4111-8111-111111111111",
    expectedRevision: 1,
    microsequencePath: MICROSEQUENCE_PATH,
    mode: "replace",
    cardsJson: JSON.stringify(dataprevCards()),
    snapshot: { courses: [] }
  };

  const actionResponse = await actionHandler(adapter)(
    actionRequest("salvarCardsNaMicrossequencia", invalid)
  );
  const actionPayload = await actionResponse.json();
  assert.equal(actionResponse.status, 422);
  assert.equal(actionPayload.error.code, "invalid_tool_arguments");
  assert.equal(actionPayload.error.details.path, "arguments.snapshot");

  const mcpResponse = await mcpHandler(adapter)(
    mcpRequest("salvarCardsNaMicrossequencia", invalid)
  );
  const mcpPayload = await mcpResponse.json();
  assert.equal(mcpResponse.status, 200);
  assert.equal(mcpPayload.result.isError, true);
  assert.equal(
    mcpPayload.result.structuredContent.error.code,
    "invalid_tool_arguments"
  );
  assert.equal(
    mcpPayload.result.structuredContent.error.details.path,
    "arguments.snapshot"
  );
  assert.deepEqual(
    mcpPayload.result.structuredContent.error,
    actionPayload.error
  );
  assert.deepEqual(adapter.mutationLog, []);
});

test("jornada Dataprev atravessa Chatbot autoral e Plugin editorial sem snapshots por mutação", async () => {
  const adapter = createJourneyAdapter();
  const chatbot = actionHandler(adapter);
  const plugin = mcpHandler(adapter);

  const prepared = await actionCall(chatbot, "prepararAutoriaAraLearn", {
    intent: "create",
    targetEntity: "course",
    context: "Criar Dataprev: Teste, com o módulo autossuficiente Computação em Nuvem e Virtualização para iniciante, cobrindo integralmente a ementa da FGV: modelos e benefícios de nuvem, arquitetura, identidade e segurança, IaC, automação, Docker, Harbor, Clair, Kubernetes e a plataforma VMware; usar recursos variados e prática com gap.",
    resourceIds: ["paragraph", "table"]
  });
  assert.deepEqual(
    prepared.guidance.map(({ id }) => id),
    [
      "operating-contract",
      "authoring-brief",
      "source-discipline",
      "incremental-materialization",
      "coverage-and-dimensioning",
      "microtheory-design",
      "practice-design",
      "resource-selection"
    ]
  );

  const created = await actionCall(chatbot, "criarWorkspaceDeAutoria", {
    requestId: "dataprev-workspace-0001",
    title: "Dataprev — autoria composta",
    brief: "Público iniciante; concurso Dataprev/FGV; cobrir integralmente Computação em Nuvem e Virtualização; usar a prova anterior e a ementa como fontes; construir por microssequência com prática variada e gaps."
  });
  const workspaceId = created.workspaceId;

  const contextUpdated = await actionCall(
    chatbot,
    "atualizarContextoDoWorkspace",
    {
      requestId: "dataprev-context-0001",
      workspaceId,
      expectedRevision: created.revision,
      brief: "Público sem conhecimentos prévios; cargo Analista de Processamento da Dataprev; banca FGV; fonte primária: ementa fornecida e prova anterior anexada; cobrir todos os produtos citados; dimensionar de forma autossuficiente e praticar com resources variados, inclusive gaps."
    }
  );

  const structured = await actionCall(chatbot, "criarEstruturaNoWorkspace", {
    requestId: "dataprev-structure-0001",
    workspaceId,
    expectedRevision: contextUpdated.revision,
    parts: dataprevStructure()
  });
  assert.equal(structured.revision, contextUpdated.revision + 1);

  await actionCall(chatbot, "consultarRecursosDeCard", {
    resource: "paragraph"
  });
  await actionCall(chatbot, "consultarRecursosDeCard", {
    resource: "table"
  });

  const mixedCards = dataprevCards();
  mixedCards[1].rows[0][1] =
    "Gerencia {gap:iaas-layer} e [[sistema operacional]].";
  const mixedGapResponse = await chatbot(actionRequest(
    "salvarCardsNaMicrossequencia",
    {
      requestId: "dataprev-cards-mixed-0001",
      workspaceId,
      expectedRevision: structured.revision,
      microsequencePath: MICROSEQUENCE_PATH,
      mode: "replace",
      cardsJson: JSON.stringify(mixedCards)
    }
  ));
  const mixedGapPayload = await mixedGapResponse.json();
  assert.equal(mixedGapResponse.status, 422);
  assert.equal(mixedGapPayload.error.code, "invalid_authoring_gap");
  assert.equal(mixedGapPayload.error.details.reason, "mixed_notation");
  assert.equal(mixedGapPayload.error.details.path, "cards[1].rows[0][1]");
  assert.deepEqual(mixedGapPayload.error.issues, [{
    path: "cards[1].rows[0][1]",
    message: mixedGapPayload.error.message,
    reason: "mixed_notation",
    resource: "table"
  }]);
  assert.equal(mixedGapPayload.error.recovery.strategy, "correct_and_retry");
  assert.equal(mixedGapPayload.error.recovery.requestIdMode, "new");
  assert.equal(mixedGapPayload.error.recovery.retryable, true);
  assert.ok(
    mixedGapPayload.error.recovery.steps.some((step) => step.includes("table"))
  );

  const invalidCardCases = [
    {
      requestId: "dataprev-cards-extra-field-0001",
      mutate(cards) {
        cards[0].visualStyle = "destacado";
      },
      expectedPath: /cards\[0\]\.visualStyle/u,
      expectedResource: "paragraph"
    },
    {
      requestId: "dataprev-cards-duplicate-id-0001",
      mutate(cards) {
        cards[1].id = cards[0].id;
      },
      expectedPath: /cards\[1\]\.id/u,
      expectedResource: "table"
    },
    {
      requestId: "dataprev-cards-missing-columns-0001",
      mutate(cards) {
        delete cards[1].columns;
      },
      expectedPath: /cards\[1\]\.columns/u,
      expectedResource: "table"
    }
  ];
  for (const invalidCase of invalidCardCases) {
    const cards = dataprevCards();
    invalidCase.mutate(cards);
    const response = await chatbot(actionRequest(
      "salvarCardsNaMicrossequencia",
      {
        requestId: invalidCase.requestId,
        workspaceId,
        expectedRevision: structured.revision,
        microsequencePath: MICROSEQUENCE_PATH,
        mode: "replace",
        cardsJson: JSON.stringify(cards)
      }
    ));
    const payload = await response.json();
    assert.equal(response.status, 422, JSON.stringify(payload));
    assert.equal(payload.error.code, "invalid_workspace_document");
    assert.equal(payload.error.recovery.strategy, "correct_and_retry");
    assert.equal(payload.error.recovery.requestIdMode, "new");
    assert.equal(payload.error.recovery.retryable, true);
    assert.ok(payload.error.issues.length >= 1);
    assert.match(payload.error.issues[0].path, invalidCase.expectedPath);
    assert.equal(payload.error.issues[0].resource, invalidCase.expectedResource);
  }

  const materialized = await actionCall(
    chatbot,
    "salvarCardsNaMicrossequencia",
    {
      requestId: "dataprev-cards-0001",
      workspaceId,
      expectedRevision: structured.revision,
      microsequencePath: MICROSEQUENCE_PATH,
      mode: "replace",
      cardsJson: JSON.stringify(dataprevCards())
    }
  );
  assert.equal(materialized.revision, structured.revision + 1);

  const read = await actionCall(chatbot, "lerWorkspaceDeAutoria", {
    workspaceId,
    view: "entity",
    entityType: "microsequence",
    entityPath: MICROSEQUENCE_PATH,
    includeDescendants: true
  });
  assert.equal(Object.hasOwn(read.content, "status"), false);
  assert.equal(read.content.cards.length, 5);
  assert.deepEqual(
    read.content.cards.map(({ position }) => position),
    [1, 2, 3, 4, 5]
  );
  assert.deepEqual(read.content.cards[0].topics, [
    "computacao-em-nuvem",
    "modelos-de-servico",
    "fgv"
  ]);
  assert.equal(read.content.cards[0].languageTag, "pt-BR");
  assert.equal(read.content.cards[0].textDirection, "ltr");
  assert.equal(Object.hasOwn(read.content.cards[1], "gaps"), false);
  assert.match(read.content.cards[1].rows[0][1], /\[\[sistema operacional::/u);
  assert.doesNotMatch(JSON.stringify(read.content.cards), /\{gap:/u);

  const microtheories = await actionCall(
    chatbot,
    "revisarMicroteoriasDoWorkspace",
    { workspaceId, entityPath: MICROSEQUENCE_PATH }
  );
  const microtheory = microtheories.content.courses[0].modules[0]
    .lessons[0].microtheories[0];
  assert.match(microtheory.content, /IaaS/iu);
  assert.equal(microtheory.practiceCount, 1);
  assert.equal(Object.hasOwn(microtheory, "cards"), false);

  const published = await actionCall(chatbot, "publicarCursoDoWorkspace", {
    requestId: "dataprev-preview-0001",
    workspaceId,
    expectedRevision: materialized.revision,
    courseId: COURSE_PATH[0],
    target: "private"
  });
  assert.equal(Object.hasOwn(published, "completionState"), false);
  const resumedChatbot = actionHandler(adapter);
  const resumedWorkspace = await actionCall(
    resumedChatbot,
    "lerWorkspaceDeAutoria",
    { workspaceId, view: "outline" }
  );
  assert.deepEqual(
    resumedWorkspace.publications.map(
      ({ workspaceCourseId, target, courseId, contentHash }) => ({
        workspaceCourseId,
        target,
        courseId,
        contentHash
      })
    ),
    [{
      workspaceCourseId: COURSE_PATH[0],
      target: "private",
      courseId: published.courseId,
      contentHash: published.contentHash
    }]
  );

  const submitted = await actionCall(
    chatbot,
    "submeterCursoParaRevisaoEditorial",
    {
      requestId: "dataprev-submit-0001",
      courseId: published.courseId,
      expectedContentHash: published.contentHash,
      note: "Revisar recorte, fontes e progressão antes do catálogo."
    }
  );
  assert.equal(submitted.status, "submitted");

  const authorQueueAttempt = await chatbot(actionRequest(
    "listarRevisoesEditoriais",
    { view: "queue", limit: 20 }
  ));
  assert.equal(authorQueueAttempt.status, 403);

  const queue = await mcpCall(plugin, "listarRevisoesEditoriais", {
    view: "queue",
    limit: 20
  });
  assert.deepEqual(queue.items.map(({ submissionId }) => submissionId), [
    submitted.submissionId
  ]);

  const openedSubmission = await mcpCall(plugin, "lerRevisaoEditorial", {
    submissionId: submitted.submissionId,
    view: "outline"
  });
  assert.equal(openedSubmission.content.courses[0].id, COURSE_PATH[0]);

  const reviewWorkspace = await mcpCall(
    plugin,
    "criarWorkspaceDeRevisaoEditorial",
    {
      requestId: "dataprev-review-workspace-0001",
      submissionId: submitted.submissionId,
      title: "Revisão editorial — Dataprev"
    }
  );
  assert.equal(reviewWorkspace.sourceSubmissionId, submitted.submissionId);

  const adminRead = await mcpCall(plugin, "lerWorkspaceDeAutoria", {
    workspaceId: reviewWorkspace.workspaceId,
    view: "outline"
  });
  assert.equal(adminRead.content.courses[0].title, dataprevStructure()[0].title);

  const metadataUpdated = await mcpCall(
    plugin,
    "atualizarMetadadosDaEntidade",
    {
      requestId: "dataprev-review-metadata-0001",
      workspaceId: reviewWorkspace.workspaceId,
      expectedRevision: reviewWorkspace.revision,
      entityType: "microsequence",
      entityPath: MICROSEQUENCE_PATH,
      goal: "Classificar IaaS, PaaS e SaaS e justificar a divisão de responsabilidades em situações no padrão FGV.",
      checks: [
        "classifica o modelo",
        "justifica quais camadas permanecem sob responsabilidade do cliente"
      ]
    }
  );
  const correctedTheory = {
    ...dataprevCards()[0],
    text: "Em IaaS, o provedor entrega infraestrutura; em PaaS, entrega também a plataforma; em SaaS, entrega a aplicação pronta. O cliente conserva responsabilidades por configuração, acesso e dados conforme o modelo."
  };
  const cardUpdated = await mcpCall(plugin, "salvarCardNoWorkspace", {
    requestId: "dataprev-review-card-0001",
    workspaceId: reviewWorkspace.workspaceId,
    expectedRevision: metadataUpdated.revision,
    cardPath: [...MICROSEQUENCE_PATH, correctedTheory.id],
    cardJson: JSON.stringify(correctedTheory)
  });
  assert.equal(cardUpdated.revision, metadataUpdated.revision + 1);

  const correctedPractice = {
    ...dataprevCards()[1],
    after: "Em prova, identifique primeiro qual camada permanece com o cliente."
  };
  const practiceUpdated = await mcpCall(plugin, "salvarCardNoWorkspace", {
    requestId: "dataprev-review-gap-card-0001",
    workspaceId: reviewWorkspace.workspaceId,
    expectedRevision: cardUpdated.revision,
    cardPath: [...MICROSEQUENCE_PATH, correctedPractice.id],
    cardJson: JSON.stringify(correctedPractice)
  });
  assert.equal(practiceUpdated.revision, cardUpdated.revision + 1);
  const correctedMicrosequence = await mcpCall(
    plugin,
    "lerWorkspaceDeAutoria",
    {
      workspaceId: reviewWorkspace.workspaceId,
      view: "entity",
      entityType: "microsequence",
      entityPath: MICROSEQUENCE_PATH,
      includeDescendants: true
    }
  );
  assert.equal(
    Object.hasOwn(correctedMicrosequence.content.cards[1], "gaps"),
    false
  );
  assert.match(
    correctedMicrosequence.content.cards[1].rows[2][1],
    /\[\[aplicação pronta::/u
  );
  assert.doesNotMatch(
    JSON.stringify(correctedMicrosequence.content.cards[1]),
    /\{gap:/u
  );

  const adminReview = await mcpCall(
    plugin,
    "revisarMicroteoriasDoWorkspace",
    {
      workspaceId: reviewWorkspace.workspaceId,
      entityPath: MICROSEQUENCE_PATH
    }
  );
  assert.equal(
    adminReview.content.courses[0].modules[0]
      .lessons[0].microtheories[0].practiceCount,
    1
  );

  const decision = await mcpCall(plugin, "decidirRevisaoEditorial", {
    requestId: "dataprev-review-decision-0001",
    submissionId: submitted.submissionId,
    decision: "request_changes",
    note: "Vincule a afirmação sobre o recorte à fonte do edital antes da aprovação."
  });
  assert.equal(decision.status, "changes_requested");

  const authorReviews = await actionCall(
    chatbot,
    "listarRevisoesEditoriais",
    { view: "mine", limit: 20 }
  );
  const returnedReview = authorReviews.items.find(
    ({ submissionId }) => submissionId === submitted.submissionId
  );
  assert.equal(returnedReview.status, "changes_requested");
  assert.equal(returnedReview.sourceRevisionHash, published.contentHash);
  assert.equal(
    returnedReview.reviewerNote,
    "Vincule a afirmação sobre o recorte à fonte do edital antes da aprovação."
  );
  assert.equal(returnedReview.decidedAt, NOW);

  const feedbackApplied = await actionCall(
    chatbot,
    "atualizarMetadadosDaEntidade",
    {
      requestId: "dataprev-author-feedback-0001",
      workspaceId,
      expectedRevision: materialized.revision,
      entityType: "microsequence",
      entityPath: MICROSEQUENCE_PATH,
      goal: "Classificar IaaS, PaaS e SaaS conforme o recorte expresso do edital e justificar a responsabilidade do cliente em itens no padrão FGV."
    }
  );
  const republished = await actionCall(
    resumedChatbot,
    "publicarCursoDoWorkspace",
    {
      requestId: "dataprev-preview-update-0001",
      workspaceId,
      expectedRevision: feedbackApplied.revision,
      courseId: COURSE_PATH[0],
      target: "private"
    }
  );
  assert.equal(republished.courseId, published.courseId);
  assert.notEqual(republished.contentHash, published.contentHash);

  const resubmitted = await actionCall(
    chatbot,
    "submeterCursoParaRevisaoEditorial",
    {
      requestId: "dataprev-resubmit-0001",
      courseId: republished.courseId,
      expectedContentHash: republished.contentHash,
      note: "Pedido de ajuste aplicado no workspace autoral e republicado."
    }
  );
  assert.equal(resubmitted.status, "submitted");
  assert.notEqual(resubmitted.submissionId, submitted.submissionId);

  const authorHistory = await actionCall(
    chatbot,
    "listarRevisoesEditoriais",
    { view: "mine", limit: 20 }
  );
  assert.equal(
    authorHistory.items.find(
      ({ submissionId }) => submissionId === submitted.submissionId
    ).status,
    "changes_requested"
  );
  assert.equal(
    authorHistory.items.find(
      ({ submissionId }) => submissionId === resubmitted.submissionId
    ).sourceRevisionHash,
    republished.contentHash
  );

  assert.deepEqual(
    adapter.mutationLog.map(({ operation }) => operation),
    [
      "create_structure",
      "save_microsequence_cards",
      "update_metadata",
      "save_card",
      "save_card",
      "update_metadata"
    ]
  );
  assert.equal(adapter.mutationLog[0].upsertTypes.filter(
    (entityType) => entityType === "course"
  ).length, 1);
  assert.equal(adapter.mutationLog[0].upsertTypes.filter(
    (entityType) => entityType === "module"
  ).length, 1);
  assert.equal(adapter.mutationLog[0].upsertTypes.filter(
    (entityType) => entityType === "lesson"
  ).length, 5);
  assert.equal(adapter.mutationLog[0].upsertTypes.filter(
    (entityType) => entityType === "microsequence"
  ).length, 11);
  assert.deepEqual(
    new Set(adapter.mutationLog[1].upsertTypes),
    new Set(["microsequence", "card"])
  );
  assert.deepEqual(adapter.mutationLog[2].upsertTypes, ["microsequence"]);
  assert.deepEqual(adapter.mutationLog[3].upsertTypes, ["card"]);
  assert.deepEqual(adapter.mutationLog[4].upsertTypes, ["card"]);
  assert.deepEqual(adapter.mutationLog[5].upsertTypes, ["microsequence"]);
  assert.ok(
    adapter.mutationLog.every(({ upsertsHaveIntegralChildren }) =>
      upsertsHaveIntegralChildren === false
    )
  );
  assert.deepEqual(
    adapter.mutationLog.flatMap(({ arguments: value }) =>
      forbiddenMutationKeys(value)
    ),
    []
  );
  assert.equal(adapter.contextLog.length, 1);
  assert.match(adapter.contextLog[0].brief, /prova anterior/iu);
});
