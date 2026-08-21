import test from "node:test";
import assert from "node:assert/strict";

import { executeCourseTool } from "../../supabase/functions/_shared/aralearn-authoring/courseToolExecutor.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS,
  listCourseAuthoringKnowledgeResources,
  readCourseAuthoringKnowledgeResource
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = { actorId: COURSE_ID, scopes: ["authoring:write"] };

test("executa leitura de Curso pela mesma rota usada pelo aplicativo", async () => {
  let received = null;
  const result = await executeCourseTool({
    adapter: {
      async getCourse(value) {
        received = value;
        return { courseId: value.courseId, revision: 3 };
      }
    },
    principal: PRINCIPAL,
    name: "lerCurso",
    rawArguments: { courseId: COURSE_ID },
    deadlineAt: Date.now() + 1_000
  });

  assert.equal(received.courseId, COURSE_ID);
  assert.equal(result.data.revision, 3);
  assert.equal(result.requestId, null);
});

test("impede escrita sem escopo", async () => {
  await assert.rejects(
    () => executeCourseTool({
      adapter: {},
      principal: { actorId: COURSE_ID, scopes: ["authoring:read"] },
      name: "criarCurso",
      rawArguments: {
        requestId: "request-course-0001",
        title: "Curso",
        objective: "Aprender"
      }
    }),
    (error) => error.status === 403
  );
});

test("executa cópia pessoal somente pela superfície da aplicação", async () => {
  const studyUnit = {
    id: "unit-a",
    position: 1,
    title: "Unidade revista",
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo revisto." }
    }],
    response: null,
    feedback: [],
    topics: []
  };
  let received = null;
  const rawArguments = {
    requestId: "request-personal-copy-0001",
    sourceCourseId: COURSE_ID,
    expectedSourceCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit,
    applicationOrigin: "manual"
  };
  const result = await executeCourseTool({
    adapter: {
      async commitPersonalCourseCopyEdit(value) {
        received = value;
        return { contract: "aralearn.personal-course-copy-edit.v1", changed: true };
      }
    },
    principal: {
      actorId: COURSE_ID,
      authenticationKind: "application",
      scopes: ["authoring:write"]
    },
    name: "criarCopiaPessoalDoCurso",
    rawArguments,
    surface: "application"
  });

  assert.equal(received.sourceCourseId, COURSE_ID);
  assert.equal(received.studyUnit.id, "unit-a");
  assert.equal(received.applicationOrigin, "manual");
  assert.equal(result.requestId, rawArguments.requestId);
  await assert.rejects(
    () => executeCourseTool({
      adapter: {},
      principal: { ...PRINCIPAL, authenticationKind: "oauth" },
      name: "criarCopiaPessoalDoCurso",
      rawArguments
    }),
    (error) => error.status === 403
  );
});

test("conhecimento contém somente invariantes estáveis", () => {
  const resources = listCourseAuthoringKnowledgeResources();
  assert.equal(resources.length, 1);
  assert.equal("text" in resources[0], false);
  const value = readCourseAuthoringKnowledgeResource(resources[0].uri);
  assert.match(value.text, /Curso vivo e mutável/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /não os fixe no prompt/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /targetPlanItems/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /somente as unidades de análise/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /audit_cycle em mode context/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /raciocínio privada/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /Aplicar uma correção não prova/iu);
  assert.doesNotMatch(value.text, /workspace|trilha|coleção|publica(?:ção|do)/iu);
});
