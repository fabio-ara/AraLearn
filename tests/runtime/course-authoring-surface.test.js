import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createCourseAuthoringSurface,
  renderCourseAuthoringSurface
} from "../../src/ui/CourseAuthoringSurface.js";
import { buildCourseAuthoringRoute } from "../../src/ui/courseAuthoringRoute.js";
import { normalizeCourseListPage } from "../../src/ui/courseAuthoringViewModel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_COURSE_ID = "20000000-0000-4000-8000-000000000002";

class FakeRoot {
  constructor() {
    this.innerHTML = "";
    this.attributes = new Map();
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  contains() {
    return true;
  }

  querySelector() {
    return null;
  }
}

class FakeWindow {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  dispatch(type) {
    this.listeners.get(type)?.();
  }
}

function entityFixture() {
  return [
    {
      entityType: "module",
      entityId: "module-a",
      parentType: null,
      parentId: null,
      position: 0,
      version: 1,
      content: { title: "Base" }
    },
    {
      entityType: "lesson",
      entityId: "lesson-a",
      parentType: "module",
      parentId: "module-a",
      position: 0,
      version: 1,
      content: { title: "Relações" }
    },
    {
      entityType: "microsequence",
      entityId: "micro-a",
      parentType: "lesson",
      parentId: "lesson-a",
      position: 0,
      version: 1,
      content: { title: "Primeiro caso" }
    },
    {
      entityType: "card",
      entityId: "unit-a",
      parentType: "microsequence",
      parentId: "micro-a",
      position: 1,
      version: 1,
      content: {
        title: "Exemplo guiado",
        content: [{ data: { text: "Compare os dois valores." } }]
      }
    }
  ];
}

function listPage(overrides = {}) {
  return {
    contract: "aralearn.course-list.v1",
    items: [{
      courseId: COURSE_ID,
      title: "Fundamentos",
      goal: "Compreender relações essenciais.",
      revision: 5,
      ownership: "owned",
      canEdit: true,
      moduleCount: 1,
      lessonCount: 2,
      topicCount: 0,
      microsequenceCount: 3,
      studyUnitCount: 4
    }, {
      courseId: SECOND_COURSE_ID,
      title: "Aplicações",
      revision: 2,
      ownership: "owned",
      canEdit: true,
      moduleCount: 1,
      lessonCount: 1,
      topicCount: 0,
      microsequenceCount: 1,
      studyUnitCount: 1
    }],
    hasMore: false,
    nextCursor: null,
    ...overrides
  };
}

function controllerFixture(overrides = {}) {
  const controller = {
    async listCourses() {
      return listPage();
    },
    async getCourse(courseId) {
      return {
        courseId,
        title: "Fundamentos",
        goal: "Compreender relações essenciais.",
        brief: "Priorizar relações e exemplos concretos.",
        revision: 5,
        ownership: "owned",
        canEdit: true,
        authoringState: {
          version: 1,
          parts: [{ id: "part-a" }, { id: "part-b" }, { id: "part-c" }],
          decisions: [{ id: "decision-a" }, { id: "decision-b" }],
          mandate: null
        }
      };
    },
    async getCourseEntities(courseId) {
      return {
        contract: "aralearn.course-entities.v1",
        courseId,
        revision: 5,
        items: entityFixture(),
        hasMore: false,
        nextCursor: null
      };
    },
    async listCourseAccess(courseId) {
      return {
        contract: "aralearn.course-people.v1",
        courseId,
        owner: {
          userId: "30000000-0000-4000-8000-000000000003",
          displayName: "Pessoa proprietária",
          avatarObjectKey: null
        },
        people: []
      };
    },
    async grantCourseAccess() {
      return { changed: true };
    },
    async revokeCourseAccess() {
      return { changed: true };
    },
    async createCourse() {
      return { courseId: SECOND_COURSE_ID, revision: 1 };
    },
    async updateCourse() {
      return { courseId: COURSE_ID, revision: 6 };
    },
    async clearCourse() {
      return undefined;
    }
  };
  Object.assign(controller, overrides);
  controller.loadCourseDocument ??= async function loadCourseDocument(courseId, {
    entityPageSize = 500
  } = {}) {
    const course = await this.getCourse(courseId);
    const rows = [];
    let cursor = null;
    do {
      const page = await this.getCourseEntities(courseId, {
        revision: course.revision,
        cursor,
        limit: entityPageSize
      });
      rows.push(...page.items);
      cursor = page.hasMore ? page.nextCursor : null;
    } while (cursor);
    return { course, rows, document: { courses: [] }, offline: false, stale: false };
  };
  return controller;
}

test("lista abre diretamente Cursos concretos com destino canônico em um toque", async () => {
  const calls = [];
  const root = new FakeRoot();
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async listCourses(options) {
        calls.push(options);
        return listPage();
      }
    }),
    locationValue: { pathname: "/", search: "", hash: "" },
    historyValue: { state: null, replaceState() {} },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.deepEqual(calls, [{ query: "", limit: 24, cursor: null }]);
  assert.match(root.innerHTML, /<h1>Meus cursos<\/h1>/u);
  assert.match(root.innerHTML, /aria-label="Voltar ao Estudo"/u);
  assert.match(root.innerHTML, /data-cardinality="many"/u);
  assert.match(root.innerHTML, /3 microssequências · 4 unidades/u);
  assert.doesNotMatch(root.innerHTML, /Compartilhado|Somente leitura/u);
  assert.match(
    root.innerHTML,
    new RegExp(buildCourseAuthoringRoute(COURSE_ID, { section: "structure" }).replace("?", "\\?"), "u")
  );
  assert.match(root.innerHTML, /<svg/u);
  assert.doesNotMatch(root.innerHTML, /<textarea|Workspace|Trilha|Coleção|publicação/iu);
});

test("lista oferece retorno visível ao Estudo", async () => {
  const root = new FakeRoot();
  let closed = 0;
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture(),
    locationValue: { pathname: "/", search: "", hash: "" },
    windowValue: new FakeWindow(),
    onClose() {
      closed += 1;
    }
  });
  await surface.open();
  const node = {
    dataset: { courseAuthoringAction: "close-surface" },
    closest() { return this; }
  };
  root.listeners.get("click")({ target: node, preventDefault() {} });
  assert.equal(closed, 1);
  assert.equal(surface.opened, false);
  assert.equal(root.innerHTML, "");
});

test("paginação da lista encaminha o cursor opaco e acrescenta a página seguinte", async () => {
  const cursor = {
    beforeUpdatedAt: "2026-08-17T11:00:00Z",
    beforeId: COURSE_ID
  };
  const calls = [];
  const root = new FakeRoot();
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async listCourses(options) {
        calls.push(options);
        return options.cursor ? {
          items: [{ courseId: SECOND_COURSE_ID, title: "Aplicações", revision: 2 }],
          hasMore: false,
          nextCursor: null
        } : {
          items: [{ courseId: COURSE_ID, title: "Fundamentos", revision: 5 }],
          hasMore: true,
          nextCursor: cursor
        };
      }
    }),
    locationValue: { pathname: "/", search: "", hash: "" },
    windowValue: new FakeWindow()
  });
  await surface.open();

  const node = {
    dataset: { courseAuthoringAction: "load-more-courses" },
    closest() { return this; }
  };
  root.listeners.get("click")({ target: node, preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, [
    { query: "", limit: 24, cursor: null },
    { query: "", limit: 24, cursor }
  ]);
  assert.match(root.innerHTML, /Fundamentos/u);
  assert.match(root.innerHTML, /Aplicações/u);
  assert.doesNotMatch(root.innerHTML, /data-course-authoring-action="load-more-courses"/u);
});

test("deep link carrega cabeçalho e entidades da mesma revisão e alterna seção no hashchange", async () => {
  const calls = [];
  const root = new FakeRoot();
  const windowValue = new FakeWindow();
  const locationValue = {
    pathname: "/",
    search: "?theme=dark",
    hash: buildCourseAuthoringRoute(COURSE_ID, { section: "content" })
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        calls.push(["course", courseId]);
        return {
          courseId,
          title: "Fundamentos",
          goal: "Compreender relações essenciais.",
          revision: 5
        };
      },
      async getCourseEntities(courseId, options) {
        calls.push(["entities", courseId, options]);
        return {
          courseId,
          revision: 5,
          items: entityFixture(),
          hasMore: false,
          nextCursor: null
        };
      }
    }),
    locationValue,
    historyValue: { state: null, replaceState() {} },
    windowValue
  });

  assert.equal(await surface.open(), true);
  assert.deepEqual(calls, [
    ["course", COURSE_ID],
    ["entities", COURSE_ID, { revision: 5, cursor: null, limit: 500 }]
  ]);
  assert.match(root.innerHTML, /aria-current="page"><svg[^>]*>[\s\S]*?<span>Conteúdo<\/span>/u);
  assert.match(root.innerHTML, /Exemplo guiado/u);
  assert.match(root.innerHTML, /Base · Relações · Primeiro caso/u);

  locationValue.hash = buildCourseAuthoringRoute(COURSE_ID, { section: "structure" });
  windowValue.dispatch("hashchange");
  await Promise.resolve();
  assert.match(root.innerHTML, /aria-current="page"><svg[^>]*>[\s\S]*?<span>Estrutura<\/span>/u);
  assert.equal(calls.length, 2);
});

test("Planejamento resume o estado autoral sem JSON e mantém todas as strings escapadas", async () => {
  const root = new FakeRoot();
  let entityReads = 0;
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title: "Fundamentos",
          goal: "Comparar <origem> e aplicação.",
          brief: 'Usar <strong>fontes</strong> e "exemplos".',
          revision: 5,
          ownership: "owned",
          canEdit: true,
          authoringState: {
            version: 1,
            parts: [
              { id: "part-a", title: "<img src=x onerror=alert(1)>" },
              { id: "part-b" },
              { id: "part-c" }
            ],
            decisions: [{ id: "decision-a" }, { id: "decision-b" }],
            mandate: { internal: "não interpolar" }
          }
        };
      },
      async getCourseEntities() {
        entityReads += 1;
        throw new Error("Planejamento não deve carregar a composição do Curso.");
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.equal(entityReads, 0);
  assert.match(root.innerHTML, /aria-current="page"><svg[^>]*>[\s\S]*?<span>Planejamento<\/span>/u);
  assert.match(root.innerHTML, /<h3>Objetivo<\/h3>/u);
  assert.match(root.innerHTML, /Comparar &lt;origem&gt; e aplicação\./u);
  assert.match(root.innerHTML, /<h3>Orientações<\/h3>/u);
  assert.match(root.innerHTML, /Usar &lt;strong&gt;fontes&lt;\/strong&gt; e &quot;exemplos&quot;\./u);
  assert.match(root.innerHTML, /<strong>3<\/strong><span>Partes de autoria<\/span>/u);
  assert.match(root.innerHTML, /<strong>2<\/strong><span>Decisões<\/span>/u);
  assert.doesNotMatch(root.innerHTML, /<img|privateNote|mandate|internal|não interpolar/iu);
  assert.doesNotMatch(root.innerHTML, /\{[^}]*"parts"/u);
});

test("cria Curso privado pela mesma operação canônica disponível ao MCP", async () => {
  const root = new FakeRoot();
  const calls = [];
  const locationValue = { pathname: "/", search: "", hash: "" };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async createCourse(value) {
        calls.push(value);
        return { courseId: SECOND_COURSE_ID, revision: 1 };
      }
    }),
    locationValue,
    windowValue: new FakeWindow()
  });
  await surface.open();
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "open-create" } };
      }
    }
  });
  assert.match(root.innerHTML, /data-course-authoring-create/u);
  assert.match(root.innerHTML, /course-authoring-create-title/u);

  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-create]"; },
      elements: {
        title: { value: "Novo Curso" },
        goal: { value: "Investigar relações." },
        brief: { value: "Usar exemplos concretos." }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.match(calls[0].requestId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual({ ...calls[0], requestId: "<uuid>" }, {
    requestId: "<uuid>",
    title: "Novo Curso",
    goal: "Investigar relações.",
    brief: "Usar exemplos concretos."
  });
  assert.equal(
    locationValue.hash,
    buildCourseAuthoringRoute(SECOND_COURSE_ID, { section: "planning" })
  );
});

test("repete criação confirmada com o mesmo requestId e payload após perder a resposta", async () => {
  const root = new FakeRoot();
  const calls = [];
  const receipts = new Map();
  const locationValue = { pathname: "/", search: "", hash: "" };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async createCourse(value) {
        calls.push(structuredClone(value));
        const receipt = receipts.get(value.requestId);
        if (receipt) return structuredClone(receipt);
        const result = { courseId: SECOND_COURSE_ID, revision: 1 };
        receipts.set(value.requestId, result);
        const error = new TypeError("Failed to fetch");
        error.code = "network_error";
        throw error;
      }
    }),
    locationValue,
    windowValue: new FakeWindow()
  });
  await surface.open();
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "open-create" } };
      }
    }
  });
  const submit = {
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-create]"; },
      elements: {
        title: { value: "Novo Curso" },
        goal: { value: "Investigar relações." },
        brief: { value: "Usar exemplos concretos." }
      }
    }
  };

  root.listeners.get("submit")(submit);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.match(root.innerHTML, /confirmar a mesma operação/u);
  assert.match(root.innerHTML, /data-course-authoring-create/u);

  root.listeners.get("submit")(submit);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(receipts.size, 1);
  assert.equal(
    locationValue.hash,
    buildCourseAuthoringRoute(SECOND_COURSE_ID, { section: "planning" })
  );
});

test("edita título, objetivo, orientações e estado autoral sem mutação oculta", async () => {
  const root = new FakeRoot();
  const calls = [];
  let revision = 5;
  const stateValue = {
    version: 1,
    parts: [{ id: "part-a" }],
    decisions: [],
    mandate: null
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title: "Fundamentos",
          goal: "Objetivo anterior.",
          brief: "Orientação anterior.",
          revision,
          ownership: "owned",
          canEdit: true,
          authoringState: stateValue
        };
      },
      async getCourseEntities(courseId) {
        return { courseId, revision, items: entityFixture(), hasMore: false };
      },
      async updateCourse(value) {
        calls.push(value);
        revision += 1;
        return { courseId: COURSE_ID, revision };
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });
  await surface.open();
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "open-planning-edit" } };
      }
    }
  });
  assert.match(root.innerHTML, /<summary>Estado estruturado<\/summary>/u);

  const updatedState = {
    version: 1,
    parts: [{ id: "part-a" }, { id: "part-b" }],
    decisions: [{ id: "decision-a" }],
    mandate: { audience: "pesquisa" }
  };
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-planning]"; },
      elements: {
        title: { value: "Fundamentos revisados" },
        goal: { value: "Novo objetivo." },
        brief: { value: "Novas orientações." },
        authoringState: { value: JSON.stringify(updatedState) }
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0], requestId: "<uuid>" }, {
    requestId: "<uuid>",
    courseId: COURSE_ID,
    expectedRevision: 5,
    operation: "update_metadata",
    title: "Fundamentos revisados",
    goal: "Novo objetivo.",
    brief: "Novas orientações.",
    authoringState: updatedState
  });
  assert.match(root.innerHTML, /Planejamento salvo/u);
  assert.doesNotMatch(root.innerHTML, /data-course-authoring-planning/u);
});

test("repete alteração confirmada com o mesmo requestId e payload após perder a resposta", async () => {
  const root = new FakeRoot();
  const calls = [];
  const receipts = new Map();
  let revision = 5;
  const initialState = {
    version: 1,
    parts: [{ id: "part-a" }],
    decisions: [],
    mandate: null
  };
  const updatedState = {
    version: 1,
    parts: [{ id: "part-a" }, { id: "part-b" }],
    decisions: [{ id: "decision-a" }],
    mandate: null
  };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title: revision === 5 ? "Fundamentos" : "Fundamentos revisados",
          goal: revision === 5 ? "Objetivo anterior." : "Novo objetivo.",
          brief: revision === 5 ? "Orientação anterior." : "Novas orientações.",
          revision,
          ownership: "owned",
          canEdit: true,
          authoringState: revision === 5 ? initialState : updatedState
        };
      },
      async updateCourse(value) {
        calls.push(structuredClone(value));
        const receipt = receipts.get(value.requestId);
        if (receipt) return structuredClone(receipt);
        revision = 6;
        const result = { courseId: COURSE_ID, revision };
        receipts.set(value.requestId, result);
        const error = new TypeError("Failed to fetch");
        error.code = "network_error";
        throw error;
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });
  await surface.open();
  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "open-planning-edit" } };
      }
    }
  });
  const submit = {
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-planning]"; },
      elements: {
        title: { value: "Fundamentos revisados" },
        goal: { value: "Novo objetivo." },
        brief: { value: "Novas orientações." },
        authoringState: { value: JSON.stringify(updatedState) }
      }
    }
  };

  root.listeners.get("submit")(submit);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedRevision, 5);
  assert.match(root.innerHTML, /confirmar a mesma operação/u);
  assert.match(root.innerHTML, /data-course-authoring-planning/u);

  root.listeners.get("submit")(submit);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(calls[1].expectedRevision, 5);
  assert.equal(receipts.size, 1);
  assert.match(root.innerHTML, /Planejamento salvo/u);
  assert.doesNotMatch(root.innerHTML, /data-course-authoring-planning/u);
});

test("deep link compartilhado é recusado pela Autoria", async () => {
  const root = new FakeRoot();
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return {
          courseId,
          title: "Aplicações",
          goal: "Praticar.",
          brief: null,
          revision: 5,
          ownership: "shared",
          canEdit: false,
          authoringState: null
        };
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "planning" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), false);
  assert.doesNotMatch(root.innerHTML, /section=planning|>Planejamento<\/span>/u);
  assert.match(root.innerHTML, /acesso a este Curso não está mais disponível/u);
  assert.doesNotMatch(root.innerHTML, /Orientações|Partes de autoria|Decisões/u);
});

test("Pessoas concede e revoga somente após confirmação explícita, sem diretório nem e-mail exibido", async () => {
  const root = new FakeRoot();
  const changes = [];
  let people = [];
  const confirmations = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async listCourseAccess(courseId) {
        return {
          contract: "aralearn.course-people.v1",
          courseId,
          owner: {
            userId: "30000000-0000-4000-8000-000000000003",
            displayName: "Pessoa proprietária",
            avatarObjectKey: null
          },
          people
        };
      },
      async grantCourseAccess(value) {
        changes.push(["grant", value]);
        people = [{
          userId: "40000000-0000-4000-8000-000000000004",
          displayName: "Pessoa estudante",
          avatarObjectKey: null
        }];
      },
      async revokeCourseAccess(value) {
        changes.push(["revoke", value]);
        people = [];
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "people" })
    },
    windowValue: new FakeWindow(),
    confirmValue(message) {
      confirmations.push(message);
      return true;
    }
  });

  assert.equal(await surface.open(), true);
  assert.match(root.innerHTML, /Pessoa proprietária/u);
  assert.match(root.innerHTML, /Acesso direto ao Estudo/u);
  assert.doesNotMatch(root.innerHTML, /@|diretório/iu);

  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { courseAuthoringAction: "open-grant" } };
      }
    }
  });
  root.listeners.get("submit")({
    preventDefault() {},
    target: {
      matches(selector) { return selector === "[data-course-authoring-grant]"; },
      elements: { email: { value: "student@example.test" } }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(changes[0], ["grant", {
    courseId: COURSE_ID,
    email: "student@example.test",
    confirmed: true
  }]);
  assert.match(root.innerHTML, /Pessoa estudante/u);
  assert.match(root.innerHTML, /Acesso concedido/u);
  assert.doesNotMatch(root.innerHTML, /student@example\.test/u);

  root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest() {
        return {
          dataset: {
            courseAuthoringAction: "revoke-access",
            userId: "40000000-0000-4000-8000-000000000004",
            displayName: "Pessoa estudante"
          }
        };
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(changes[1], ["revoke", {
    courseId: COURSE_ID,
    userId: "40000000-0000-4000-8000-000000000004",
    confirmed: true
  }]);
  assert.equal(confirmations.length, 2);
  assert.match(confirmations[1], /estado pessoal de Estudo será preservado/u);
  assert.match(root.innerHTML, /Acesso revogado; o estado pessoal foi preservado/u);
});

test("detalhe reúne todas as páginas antes de projetar a ordem do Curso", async () => {
  const root = new FakeRoot();
  const cursors = [];
  const nextCursor = { entityType: "lesson", entityId: "lesson-a" };
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture({
      async getCourse(courseId) {
        return { courseId, title: "Fundamentos", revision: 5 };
      },
      async getCourseEntities(courseId, options) {
        cursors.push(options.cursor);
        return options.cursor ? {
          courseId,
          revision: 5,
          items: entityFixture().filter((item) =>
            ["microsequence", "card"].includes(item.entityType)),
          hasMore: false,
          nextCursor: null
        } : {
          courseId,
          revision: 5,
          items: entityFixture().filter((item) =>
            ["module", "lesson"].includes(item.entityType)),
          hasMore: true,
          nextCursor
        };
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "content" })
    },
    windowValue: new FakeWindow()
  });

  assert.equal(await surface.open(), true);
  assert.deepEqual(cursors, [null, nextCursor]);
  assert.match(root.innerHTML, /Exemplo guiado/u);
  assert.doesNotMatch(root.innerHTML, /Carregar mais/u);
});

test("back interno remove o deep link e retorna à lista sem depender de histórico anterior", async () => {
  const root = new FakeRoot();
  const windowValue = new FakeWindow();
  const locationValue = {
    pathname: "/app",
    search: "",
    hash: buildCourseAuthoringRoute(COURSE_ID, { section: "structure" })
  };
  const replacements = [];
  const surface = createCourseAuthoringSurface({
    root,
    controller: controllerFixture(),
    locationValue,
    historyValue: {
      state: { area: "authoring" },
      replaceState(...args) {
        replacements.push(args);
      }
    },
    windowValue
  });

  await surface.open();
  assert.equal(surface.handleBack(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(locationValue.hash, "");
  assert.deepEqual(replacements, [[{ area: "authoring" }, "", "/app"]]);
  assert.match(root.innerHTML, /<h1>Meus cursos<\/h1>/u);
});

test("offline conhecido e acesso revogado têm estados próprios", async () => {
  const offlineRoot = new FakeRoot();
  const offlineSurface = createCourseAuthoringSurface({
    root: offlineRoot,
    controller: controllerFixture({
      async listCourses() {
        return listPage({ offline: true, stale: true });
      }
    }),
    locationValue: { pathname: "/", search: "", hash: "" },
    windowValue: new FakeWindow()
  });
  await offlineSurface.open();
  assert.match(offlineRoot.innerHTML, /Exibindo o que já está neste dispositivo/u);

  const revokedRoot = new FakeRoot();
  const revokedSurface = createCourseAuthoringSurface({
    root: revokedRoot,
    controller: controllerFixture({
      async getCourse() {
        const error = new Error("not found");
        error.status = 404;
        throw error;
      }
    }),
    locationValue: {
      pathname: "/",
      search: "",
      hash: buildCourseAuthoringRoute(COURSE_ID, { section: "structure" })
    },
    windowValue: new FakeWindow()
  });
  await revokedSurface.open();
  assert.match(revokedRoot.innerHTML, /O acesso a este Curso não está mais disponível/u);
  assert.doesNotMatch(revokedRoot.innerHTML, /not found/u);
});

test("renderer escapa conteúdo e CSS mantém enquadramento mobile-first sem rolagem aninhada", async () => {
  const page = normalizeCourseListPage({
    items: [{ courseId: COURSE_ID, title: "<script>alert(1)</script>" }],
    hasMore: false,
    nextCursor: null
  });
  const markup = renderCourseAuthoringSurface({
    view: "list",
    query: "",
    loading: false,
    list: page,
    failure: null
  });
  assert.doesNotMatch(markup, /<script>/u);
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);

  const css = await readFile(new URL("../../public/course-authoring.css", import.meta.url), "utf8");
  assert.match(css, /\.course-authoring-surface \{[\s\S]*?box-sizing: border-box/u);
  assert.match(css, /width: min\(100%, 760px\)/u);
  assert.match(css, /width: min\(100%, 430px\)/u);
  assert.match(css, /@media \(max-width: 380px\)/u);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(css, /-webkit-line-clamp: 4/u);
  assert.match(css, /min-height: var\(--tap\)/u);
  assert.doesNotMatch(css, /width: min\(100%, (?:560|620)px\)/u);
  assert.doesNotMatch(css, /overflow-y|textarea/iu);
});
