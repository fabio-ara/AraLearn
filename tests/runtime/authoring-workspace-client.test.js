import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";

import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { AuthoringWorkspaceClient } from "../../src/supabase/AuthoringWorkspaceClient.js";
import { LearningSpaces } from "../../src/supabase/LearningSpaces.js";
import {
  RESOURCE_CATALOG,
  RESOURCE_PACKAGE_REGISTRY
} from "../../src/resources/catalog/resourceCatalog.js";

const USER_ID = "10000000-0000-4000-8000-000000000105";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000105";
const OTHER_WORKSPACE_ID = "20000000-0000-4000-8000-000000000106";
const PATH = Object.freeze([
  "course-fixture-minimal",
  "module-fixture-minimal",
  "lesson-fixture-minimal",
  "micro-fixture-minimal"
]);

function authClient(sessionStore = null) {
  return {
    sessionStore,
    getSession: () => ({ user: { id: USER_ID } })
  };
}

async function openStore(indexedDb, userId = USER_ID) {
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId });
  await store.bindReplicaToUser(userId);
  return store;
}

function outline(revision = 7) {
  return {
    workspaceId: WORKSPACE_ID,
    revision,
    view: "outline",
    title: "Autoria focal",
    content: {
      courses: [{
        id: PATH[0],
        title: "Curso focal",
        modules: [{
          id: PATH[1],
          title: "Módulo focal",
          lessons: [{
            id: PATH[2],
            title: "Lição focal",
            microsequences: [{ id: PATH[3], title: "Microssequência focal", cardCount: 0 }]
          }]
        }]
      }]
    }
  };
}

function resume(revision = 7, findings = {}) {
  return {
    workspaceId: WORKSPACE_ID,
    revision,
    view: "resume",
    title: "Autoria focal",
    content: {
      parts: [{
        id: "part-a",
        title: "Parte A",
        microsequenceIds: [PATH[3]],
        microsequenceStateMask: "p"
      }],
      unassignedMicrosequenceStateMap: {},
      findings: {
        items: [],
        summary: { activeCount: 0 },
        truncated: false,
        ...findings
      }
    }
  };
}

function definitions() {
  return [{
    id: "novelty_level",
    version: "1.0.0",
    label: "Novidade",
    valueType: "integer",
    constraints: { minimum: 1, maximum: 5 }
  }, {
    id: "available_resource_set_refs",
    version: "1.0.0",
    label: "Resources disponíveis",
    valueType: "set",
    constraints: { setItemPattern: ".+" }
  }];
}

function designResponse({
  revision = 7,
  path = PATH,
  assignments = [],
  resourceSets = []
} = {}) {
  const noveltyAssignment = assignments.find((entry) => entry.definitionRef?.id === "novelty_level");
  const resourceAssignment = assignments.find(
    (entry) => entry.definitionRef?.id === "available_resource_set_refs"
  );
  return {
    operation: "read_slice",
    workspaceId: WORKSPACE_ID,
    revision,
    result: {
      view: "parameters",
      workspace: { id: WORKSPACE_ID, revision },
      microsequence: { title: "Microssequência focal", path },
      parameterDefinitions: { relevant: definitions() },
      assignments: structuredClone(assignments),
      locks: assignments.filter(({ mode }) => mode === "research_lock"),
      effectiveSnapshot: {
        resourceSetRefs: resourceSets.map(({ ref }) => structuredClone(ref)),
        resolvedValues: [{
          definitionRef: { id: "novelty_level", version: "1.0.0" },
          value: noveltyAssignment?.value || { kind: "integer", value: 2 },
          resolution: {
            assignmentMode: noveltyAssignment?.mode || "auto_default",
            inheritance: "local"
          }
        }, {
          definitionRef: { id: "available_resource_set_refs", version: "1.0.0" },
          value: resourceAssignment?.value || {
            kind: "set",
            values: resourceSets.map(({ ref }) => `${ref.id}@${ref.version}`)
          },
          resolution: {
            assignmentMode: resourceAssignment?.mode || "auto_default",
            inheritance: "local"
          }
        }]
      },
      effectiveResourceSets: structuredClone(resourceSets),
      states: { resourceAvailability: resourceSets.length ? "restricted" : "legacy_unrestricted" }
    }
  };
}

class ParameterCatalog {
  constructor() {
    this.revision = 7;
    this.assignments = [];
    this.mutations = [];
  }

  async executeApplicationAuthoringAction(tool, args) {
    if (tool === "gerirWorkspaceEducacional" && args.operation === "read") {
      return { capabilities: { author: true, review: true } };
    }
    if (tool === "gerirDesenhoInstrucional" && args.operation === "read_slice") {
      return designResponse({
        revision: this.revision,
        path: args.microsequencePath,
        assignments: this.assignments
      });
    }
    if (tool === "gerirDesenhoInstrucional" && args.operation === "set_parameter") {
      assert.equal(args.expectedRevision, this.revision);
      const assignment = JSON.parse(args.payloadJson);
      this.assignments = this.assignments.filter((entry) => (
        entry.definitionRef.id !== assignment.definitionRef.id
        || entry.scope.ref !== assignment.scope.ref
      ));
      this.assignments.push(assignment);
      this.revision += 1;
      this.mutations.push(args.operation);
      return {
        revision: this.revision,
        result: { assignmentRef: { id: assignment.id, version: assignment.version } }
      };
    }
    if (tool === "gerirDesenhoInstrucional" && args.operation === "remove_parameter") {
      assert.equal(args.expectedRevision, this.revision);
      const payload = JSON.parse(args.payloadJson);
      this.assignments = this.assignments.filter((entry) => (
        entry.id !== payload.assignmentRef?.id || entry.version !== payload.assignmentRef?.version
      ));
      this.revision += 1;
      this.mutations.push(args.operation);
      return { revision: this.revision, result: { assignmentRef: payload.assignmentRef } };
    }
    if (tool === "gerirDesenhoInstrucional" && args.operation === "resolve_effective") {
      assert.equal(args.expectedRevision, this.revision);
      this.revision += 1;
      this.mutations.push(args.operation);
      return { revision: this.revision, result: { status: "resolved" } };
    }
    throw new Error(`Ação inesperada: ${tool}/${args.operation || ""}`);
  }
}

test("set offline seguido de Auto cancela a intenção antes de qualquer envio", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const catalog = new ParameterCatalog();
  const client = new AuthoringWorkspaceClient({
    catalog,
    authClient: authClient(),
    relationalStore: store
  });

  await client.loadAuthoringDesign({ workspaceId: WORKSPACE_ID, microsequencePath: PATH, online: true });
  const pending = await client.setAuthoringParameter({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    parameterKey: "novelty_level",
    value: 4,
    expectedRevision: 7,
    online: false
  });
  assert.equal(pending.parameters[0].pending, true);

  const restored = await client.restoreAuthoringParameterAuto({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    parameterKey: "novelty_level",
    expectedRevision: 7,
    online: false
  });
  assert.equal(restored.parameters[0].pending, false);
  assert.equal(restored.parameters[0].origin, "auto");
  assert.deepEqual(await client.getPendingAuthoringChangeSummary(), {
    pendingCount: 0,
    conflictCount: 0,
    workspaces: []
  });

  const synchronization = await client.synchronizePendingAuthoringChanges({ online: true });
  assert.equal(synchronization.synchronized, 0);
  assert.deepEqual(catalog.mutations, []);
});

test("restaurar Auto relê lock e autoridade antes de aceitar a intenção", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const catalog = new ParameterCatalog();
  const client = new AuthoringWorkspaceClient({
    catalog,
    authClient: authClient(),
    relationalStore: store
  });
  await client.loadAuthoringDesign({
    workspaceId: WORKSPACE_ID, microsequencePath: PATH, online: true
  });
  catalog.revision = 8;
  catalog.assignments = [{
    id: "research-lock-novelty",
    version: "1.0.0",
    definitionRef: { id: "novelty_level", version: "1.0.0" },
    scope: { kind: "microsequence", ref: PATH[3] },
    mode: "research_lock",
    value: { kind: "integer", value: 2 }
  }];

  await assert.rejects(
    client.restoreAuthoringParameterAuto({
      workspaceId: WORKSPACE_ID,
      microsequencePath: PATH,
      parameterKey: "novelty_level",
      online: true
    }),
    (error) => error.code === "research_lock_conflict"
  );
  assert.deepEqual(catalog.mutations, []);
});

test("Auto online cancela o set local mas remove override remoto surgido em outra aba", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const catalog = new ParameterCatalog();
  const client = new AuthoringWorkspaceClient({
    catalog,
    authClient: authClient(),
    relationalStore: store
  });
  await client.loadAuthoringDesign({
    workspaceId: WORKSPACE_ID, microsequencePath: PATH, online: true
  });
  await client.setAuthoringParameter({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    parameterKey: "novelty_level",
    value: 5,
    expectedRevision: 7,
    online: false
  });
  catalog.revision = 8;
  catalog.assignments = [{
    id: "remote-manual-novelty",
    version: "1.0.0",
    definitionRef: { id: "novelty_level", version: "1.0.0" },
    scope: { kind: "microsequence", ref: PATH[3] },
    mode: "manual_override",
    value: { kind: "integer", value: 3 }
  }];

  const restored = await client.restoreAuthoringParameterAuto({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    parameterKey: "novelty_level",
    online: true
  });
  assert.equal(restored.parameters[0].origin, "auto");
  assert.deepEqual(catalog.mutations, ["remove_parameter", "resolve_effective"]);
  assert.equal((await client.getPendingAuthoringChangeSummary()).pendingCount, 0);
});

test("sync-all encontra deep-link pelo índice da fila sem depender da lista de workspaces", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const catalog = new ParameterCatalog();
  const client = new AuthoringWorkspaceClient({
    catalog,
    authClient: authClient(),
    relationalStore: store
  });

  await client.loadAuthoringDesign({ workspaceId: WORKSPACE_ID, microsequencePath: PATH, online: true });
  await client.setAuthoringParameter({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    parameterKey: "novelty_level",
    value: 5,
    expectedRevision: 7,
    online: false
  });
  const before = await client.getPendingAuthoringChangeSummary();
  assert.equal(before.pendingCount, 1);
  assert.equal(before.workspaces[0].workspaceId, WORKSPACE_ID);

  const result = await client.synchronizePendingAuthoringChanges({ online: true, limit: 10 });
  assert.equal(result.synchronized, 1);
  assert.equal(result.pendingCount, 0);
  assert.deepEqual(catalog.mutations, ["set_parameter", "resolve_effective"]);
});

function overviewCatalog(revisionValue, delay = 0) {
  return {
    async executeApplicationAuthoringAction(tool, args) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (tool === "lerWorkspaceDeAutoria" && args.view === "outline") {
        return outline(revisionValue);
      }
      if (tool === "lerWorkspaceDeAutoria" && args.view === "resume") {
        return resume(revisionValue);
      }
      if (tool === "gerirWorkspaceEducacional" && args.operation === "read") {
        return { capabilities: { author: true, review: true } };
      }
      throw new Error("Ação inesperada no overview.");
    }
  };
}

test("cache monotônico impede resposta rev5 atrasada de sobrescrever rev6 entre instâncias", async (context) => {
  const indexedDb = new IDBFactory();
  const firstStore = await openStore(indexedDb);
  const secondStore = await openStore(indexedDb);
  context.after(() => { firstStore.close(); secondStore.close(); });
  const slow = new AuthoringWorkspaceClient({
    catalog: overviewCatalog(5, 30), authClient: authClient(), relationalStore: firstStore
  });
  const fast = new AuthoringWorkspaceClient({
    catalog: overviewCatalog(6), authClient: authClient(), relationalStore: secondStore
  });

  const oldRead = slow.loadAuthoringWorkspaceOverview(WORKSPACE_ID, { online: true });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const newRead = fast.loadAuthoringWorkspaceOverview(WORKSPACE_ID, { online: true });
  assert.equal((await newRead).revision, 6);
  assert.equal((await oldRead).revision, 5);

  const cached = await fast.loadAuthoringWorkspaceOverview(WORKSPACE_ID, { online: false });
  assert.equal(cached.revision, 6);
});

test("snapshot atrasado da lista não ressuscita workspace removido em outra aba", async (context) => {
  const indexedDb = new IDBFactory();
  const firstStore = await openStore(indexedDb);
  const secondStore = await openStore(indexedDb);
  context.after(() => { firstStore.close(); secondStore.close(); });
  const catalog = (items, delay = 0) => ({
    async executeApplicationAuthoringAction(tool) {
      assert.equal(tool, "listarWorkspacesDeAutoria");
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return { items: structuredClone(items), hasMore: false, nextCursor: null };
    }
  });
  const removedWorkspace = {
    workspaceId: OTHER_WORKSPACE_ID,
    title: "Acesso antigo",
    revision: 5,
    role: "author",
    authoringState: "building"
  };
  const slow = new AuthoringWorkspaceClient({
    catalog: catalog([removedWorkspace], 30), authClient: authClient(), relationalStore: firstStore
  });
  const fresh = new AuthoringWorkspaceClient({
    catalog: catalog([]), authClient: authClient(), relationalStore: secondStore
  });

  const oldRead = slow.listAuthoringWorkspaces({ online: true });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual((await fresh.listAuthoringWorkspaces({ online: true })).items, []);
  assert.equal((await oldRead).items[0].workspaceId, OTHER_WORKSPACE_ID);
  assert.deepEqual((await fresh.listAuthoringWorkspaces({ online: false })).items, []);
});

test("fence do overview repete a leitura quando a Auditoria muda durante a hidratação", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  let currentRevision = 7;
  let findingsReads = 0;
  const finding = {
    observationId: "finding-after-race",
    kind: "audit_finding",
    status: "open",
    summary: "Achado corrente",
    entityPath: PATH,
    targetAvailable: true
  };
  const catalog = {
    async executeApplicationAuthoringAction(tool, args) {
      if (tool === "gerirWorkspaceEducacional" && args.operation === "read") {
        return { capabilities: { author: true, review: true } };
      }
      if (tool === "gerirWorkspaceEducacional" && args.operation === "list_observations") {
        findingsReads += 1;
        if (findingsReads === 1) currentRevision = 8;
        return {
          workspaceId: WORKSPACE_ID,
          items: [finding],
          summary: { activeCount: 1 },
          hasMore: false,
          nextCursor: null
        };
      }
      if (tool === "lerWorkspaceDeAutoria" && args.view === "outline") {
        return outline(currentRevision);
      }
      if (tool === "lerWorkspaceDeAutoria" && args.view === "resume") {
        return resume(currentRevision, {
          items: [], summary: { activeCount: 1 }, truncated: true
        });
      }
      throw new Error("Ação inesperada no fence do overview.");
    }
  };
  const client = new AuthoringWorkspaceClient({
    catalog, authClient: authClient(), relationalStore: store
  });

  const overview = await client.loadAuthoringWorkspaceOverview(WORKSPACE_ID, { online: true });
  assert.equal(overview.revision, 8);
  assert.equal(overview.findings[0].findingId, "finding-after-race");
  assert.equal(findingsReads, 2, "a página da tentativa híbrida não pode ser reutilizada");
  const cached = await client.loadAuthoringWorkspaceOverview(WORKSPACE_ID, { online: false });
  assert.equal(cached.revision, 8);
  assert.equal(cached.findings[0].findingId, "finding-after-race");
});

test("lista válida sobrevive a quota local e protocolo inválido não é mascarado pelo cache", async () => {
  const values = new Map();
  let transactionFails = true;
  const boundStore = {
    userId: USER_ID,
    async getSyncState(key) { return values.get(key) ?? null; },
    async putSyncState(key, value) { values.set(key, value); },
    async getAll() { return []; },
    async transaction() {
      if (transactionFails) throw Object.assign(new Error("Quota excedida."), { name: "QuotaExceededError" });
    }
  };
  let sessionStoreTouches = 0;
  const poisonSessionStore = {
    userId: null,
    async getSyncState() { sessionStoreTouches += 1; throw new Error("store de auth não deve ser usado"); },
    async putSyncState() { sessionStoreTouches += 1; throw new Error("store de auth não deve ser usado"); }
  };
  const validCatalog = {
    async executeApplicationAuthoringAction(tool) {
      if (tool !== "listarWorkspacesDeAutoria") throw new Error("Ação inesperada.");
      return {
        items: [{
          workspaceId: WORKSPACE_ID,
          title: "Plano",
          revision: 4,
          role: "author",
          authoringState: "building"
        }],
        hasMore: false,
        nextCursor: null
      };
    }
  };
  const spaces = new LearningSpaces({
    catalog: validCatalog,
    authClient: authClient(poisonSessionStore),
    authoringRelationalStore: boundStore
  });
  const online = await spaces.listAuthoringWorkspaces({ online: true });
  assert.equal(online.items[0].state, "building");
  assert.equal(online.cacheWriteFailed, true);
  assert.equal(sessionStoreTouches, 0);

  transactionFails = false;
  const cacheableClient = new AuthoringWorkspaceClient({
    catalog: validCatalog, authClient: authClient(), relationalStore: boundStore
  });
  await cacheableClient.listAuthoringWorkspaces({ online: true });
  const invalidClient = new AuthoringWorkspaceClient({
    catalog: {
      async executeApplicationAuthoringAction() {
        return {
          items: [{ workspaceId: "inválido", authoringState: "planning" }],
          hasMore: false,
          nextCursor: null
        };
      }
    },
    authClient: authClient(),
    relationalStore: boundStore
  });
  await assert.rejects(
    invalidClient.listAuthoringWorkspaces({ online: true }),
    /Workspace inválido/u
  );
});

test("Auditoria pagina mais de 50 achados e preserva alvo indisponível", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const findings = Array.from({ length: 75 }, (_, index) => ({
    observationId: `finding-${index + 1}`,
    kind: "audit_finding",
    status: "open",
    summary: `Achado ${index + 1}`,
    entityPath: PATH,
    targetAvailable: index !== 0
  }));
  const client = new AuthoringWorkspaceClient({
    authClient: authClient(),
    relationalStore: store,
    catalog: {
      async executeApplicationAuthoringAction(tool, args) {
        assert.equal(tool, "gerirWorkspaceEducacional");
        const second = args.beforeId === "cursor-50";
        return {
          workspaceId: WORKSPACE_ID,
          items: second ? findings.slice(50) : findings.slice(0, 50),
          summary: { activeCount: 75 },
          hasMore: !second,
          nextCursor: second ? null : {
            beforeUpdatedAt: "2026-08-15T12:00:00.000Z",
            beforeId: "cursor-50"
          }
        };
      }
    }
  });

  const first = await client.listAuthoringFindings({ workspaceId: WORKSPACE_ID, limit: 50 });
  const second = await client.listAuthoringFindings({
    workspaceId: WORKSPACE_ID,
    cursor: first.nextCursor,
    limit: 50
  });
  assert.equal(first.items.length, 50);
  assert.equal(first.total, 75);
  assert.equal(first.truncated, true);
  assert.equal(first.items[0].targetAvailable, false);
  assert.equal(first.items[0].readerTarget, null);
  assert.equal(second.items.length, 25);
  assert.equal(second.truncated, false);
});

class ResourceCatalog {
  constructor({
    initialSets = [],
    failResolve = false,
    resourceLocked = false,
    author = true,
    raceAssignmentOnce = false
  } = {}) {
    this.revision = 7;
    this.initialSets = initialSets;
    this.savedSets = new Map();
    this.effectiveByMicrosequence = new Map();
    this.assignmentsByMicrosequence = new Map();
    this.failResolve = failResolve;
    this.resourceLocked = resourceLocked;
    this.author = author;
    this.raceAssignmentOnce = raceAssignmentOnce;
    this.mutations = [];
    this.receipts = new Map();
  }

  resourceSetsFor(path) {
    const effective = this.effectiveByMicrosequence.get(path[3]);
    return effective || this.initialSets.map((set) => ({
      ref: structuredClone(set.ref),
      scope: structuredClone(set.scope),
      resolvedCatalogVersion: RESOURCE_CATALOG.catalogVersion,
      packageCount: set.packages.length
    }));
  }

  outline() {
    const value = outline(this.revision);
    value.content.courses[0].modules[0].lessons[0].microsequences.push({
      id: "micro-other",
      title: "Microssequência focal",
      cardCount: 0
    });
    return value;
  }

  async executeApplicationAuthoringAction(tool, args) {
    if (tool === "gerirWorkspaceEducacional" && args.operation === "read") {
      return { capabilities: { author: this.author, review: true } };
    }
    if (tool === "lerWorkspaceDeAutoria" && args.view === "outline") return this.outline();
    if (tool !== "gerirDesenhoInstrucional") throw new Error("Ação inesperada em Resources.");
    if (args.operation === "read_slice" && args.view === "parameters") {
      const assignments = structuredClone(
        this.assignmentsByMicrosequence.get(args.microsequencePath[3]) || []
      );
      if (this.resourceLocked) assignments.push({
        id: "locked-resource-availability",
        version: "1.0.0",
        definitionRef: { id: "available_resource_set_refs", version: "1.0.0" },
        scope: { kind: "microsequence", ref: args.microsequencePath[3] },
        mode: "research_lock",
        value: {
          kind: "set",
          values: this.resourceSetsFor(args.microsequencePath).map(({ ref }) => (
            `${ref.id}@${ref.version}`
          ))
        }
      });
      return designResponse({
        revision: this.revision,
        path: args.microsequencePath,
        assignments,
        resourceSets: this.resourceSetsFor(args.microsequencePath)
      });
    }
    if (args.operation === "read_slice" && args.view === "resource_set") {
      const key = `${args.resourceSetRef.id}@${args.resourceSetRef.version}`;
      const set = this.initialSets.find((item) => `${item.ref.id}@${item.ref.version}` === key)
        || this.savedSets.get(key);
      if (!set) throw Object.assign(new Error("Conjunto não efetivo."), { status: 409 });
      const offset = args.cursor == null ? 0 : Number(args.cursor);
      const packages = set.packages.slice(offset, offset + 1);
      const nextCursor = offset + packages.length < set.packages.length
        ? String(offset + packages.length)
        : null;
      return {
        operation: "read_slice",
        workspaceId: WORKSPACE_ID,
        revision: this.revision,
        result: {
          view: "resource_set",
          resourceSet: {
            metadata: {
              ref: structuredClone(set.ref),
              scope: structuredClone(set.scope),
              resolvedCatalogVersion: RESOURCE_CATALOG.catalogVersion,
              provenanceRefs: ["fixture"]
            },
            facets: {
              catalogVersion: RESOURCE_CATALOG.catalogVersion,
              families: [], disciplines: [], structures: [],
              cognitiveOperations: [], practiceModalities: []
            },
            constraints: {
              allowedFits: ["canonical"],
              allowEmbeddedPractice: true,
              allowResponsePackages: true,
              onNoAdequateRepresentation: "block"
            },
            packages,
            total: set.packages.length,
            nextCursor
          }
        }
      };
    }
    const fingerprint = `${args.operation}\u0000${args.microsequencePath.join("/")}`
      + `\u0000${args.payloadJson}`;
    const receipt = this.receipts.get(args.requestId);
    if (receipt) {
      assert.equal(receipt.fingerprint, fingerprint, "o replay deve repetir o payload canônico");
      return structuredClone(receipt.response);
    }
    if (args.operation === "save_resource_set") {
      assert.equal(args.expectedRevision, this.revision);
      const payload = JSON.parse(args.payloadJson);
      const ref = { id: payload.id, version: payload.version };
      this.savedSets.set(`${ref.id}@${ref.version}`, {
        ref,
        scope: payload.scope,
        packages: payload.packages
      });
      this.revision += 1;
      this.mutations.push({
        operation: args.operation,
        path: args.microsequencePath,
        scope: structuredClone(payload.scope),
        packages: structuredClone(payload.packages)
      });
      const response = { revision: this.revision, result: { resourceSetRef: ref } };
      this.receipts.set(args.requestId, { fingerprint, response: structuredClone(response) });
      return response;
    }
    if (args.operation === "set_parameter") {
      if (this.raceAssignmentOnce) {
        this.raceAssignmentOnce = false;
        this.revision += 1;
        const error = Object.assign(new Error("Outra aba avançou a revisão."), {
          status: 409,
          code: "stale_authoring_state",
          conflict: true
        });
        throw error;
      }
      assert.equal(args.expectedRevision, this.revision);
      const assignment = JSON.parse(args.payloadJson);
      this.assignmentsByMicrosequence.set(args.microsequencePath[3], [assignment]);
      const [resourceSetValue] = assignment.value.values;
      const set = this.savedSets.get(resourceSetValue);
      this.effectiveByMicrosequence.set(args.microsequencePath[3], [{
        ref: { id: set.ref.id, version: set.ref.version },
        scope: structuredClone(set.scope),
        resolvedCatalogVersion: RESOURCE_CATALOG.catalogVersion,
        packageCount: set.packages.length
      }]);
      this.revision += 1;
      this.mutations.push({
        operation: args.operation,
        path: args.microsequencePath,
        scope: structuredClone(assignment.scope)
      });
      const response = {
        revision: this.revision,
        result: { assignmentRef: { id: assignment.id, version: assignment.version } }
      };
      this.receipts.set(args.requestId, { fingerprint, response: structuredClone(response) });
      return response;
    }
    if (args.operation === "resolve_effective") {
      if (this.failResolve) {
        throw Object.assign(new Error("Resolução temporariamente indisponível."), { status: 503 });
      }
      assert.equal(args.expectedRevision, this.revision);
      this.revision += 1;
      this.mutations.push({ operation: args.operation, path: args.microsequencePath });
      const response = { revision: this.revision, result: { status: "resolved" } };
      this.receipts.set(args.requestId, { fingerprint, response: structuredClone(response) });
      return response;
    }
    throw new Error(`Operação inesperada: ${args.operation}`);
  }
}

function installedPackages(count = 3) {
  return RESOURCE_PACKAGE_REGISTRY.listCatalog().slice(0, count).map((manifest) => ({
    packageId: manifest.id,
    version: manifest.version
  }));
}

test("ResourceSet carrega todos os membros antes de editar e múltiplos sets exigem escolha", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const packages = installedPackages(3);
  const courseSet = {
    ref: { id: "resource-set-course", version: "1.0.0" },
    scope: { kind: "course", ref: PATH[0] },
    packages
  };
  const lessonSet = {
    ref: { id: "resource-set-lesson", version: "1.0.0" },
    scope: { kind: "lesson", ref: PATH[2] },
    packages: packages.slice(0, 2)
  };
  const multiple = new AuthoringWorkspaceClient({
    catalog: new ResourceCatalog({ initialSets: [courseSet, lessonSet] }),
    authClient: authClient(),
    relationalStore: store
  });
  const choice = await multiple.loadAuthoringResourceSetPage({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    limit: 1,
    online: true
  });
  assert.equal(choice.requiresSetChoice, true);
  assert.equal(choice.selectionComplete, false);
  assert.match(choice.setChoices[0].label, /Este curso/u);
  assert.match(choice.setChoices[1].label, /Esta lição/u);
  assert.ok(choice.facets.families.length > 0);
  assert.match(choice.resourceScopes.at(-1).targets[0].label, /Curso focal › Lição focal/u);

  const selected = await multiple.loadAuthoringResourceSetPage({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    resourceSetRef: courseSet.ref,
    limit: 1,
    online: true
  });
  assert.equal(selected.selectionComplete, true);
  assert.deepEqual(new Set(selected.selectedKeys), new Set(packages.map(
    (item) => `${item.packageId}@${item.version}`
  )));
  assert.equal(selected.items.length, 1);
});

test("filtro e faceta não descartam membros invisíveis ao salvar ResourceSet", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const packages = installedPackages(3);
  const initialSet = {
    ref: { id: "resource-set-filtered", version: "1.0.0" },
    scope: { kind: "microsequence", ref: PATH[3] },
    packages
  };
  const catalog = new ResourceCatalog({ initialSets: [initialSet] });
  const client = new AuthoringWorkspaceClient({
    catalog, authClient: authClient(), relationalStore: store
  });
  const firstProfile = RESOURCE_CATALOG.getProfile(packages[0].packageId, packages[0].version);
  const filtered = await client.loadAuthoringResourceSetPage({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    resourceSetRef: initialSet.ref,
    query: firstProfile.label,
    facets: { families: [firstProfile.primaryFamilyId] },
    limit: 1,
    online: true
  });

  assert.equal(filtered.selectionComplete, true);
  assert.deepEqual(new Set(filtered.selectedKeys), new Set(packages.map(
    (item) => `${item.packageId}@${item.version}`
  )));
  await client.saveAuthoringResourceSetSelection({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    selectedKeys: filtered.selectedKeys,
    selectionComplete: filtered.selectionComplete,
    resourceSetRef: initialSet.ref,
    scope: { kind: "microsequence", entityPath: PATH },
    expectedRevision: filtered.revision,
    online: true
  });
  const saved = catalog.mutations.find(({ operation }) => operation === "save_resource_set");
  assert.deepEqual(new Set(saved.packages.map(
    (item) => `${item.packageId}@${item.version}`
  )), new Set(filtered.selectedKeys));
});

test("ResourceSet respeita escopos de curso e lição sem seleção por card", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const catalog = new ResourceCatalog();
  const client = new AuthoringWorkspaceClient({
    catalog, authClient: authClient(), relationalStore: store
  });
  const selectedKeys = installedPackages(1).map((item) => `${item.packageId}@${item.version}`);
  await client.saveAuthoringResourceSetSelection({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    selectedKeys,
    selectionComplete: true,
    scope: { kind: "course", entityPath: PATH.slice(0, 1) },
    expectedRevision: 7,
    online: true
  });
  await client.saveAuthoringResourceSetSelection({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    selectedKeys,
    selectionComplete: true,
    scope: { kind: "lesson", entityPath: PATH.slice(0, 3) },
    online: true
  });
  assert.deepEqual(catalog.mutations.filter(({ operation }) => operation === "save_resource_set")
    .map(({ scope }) => scope), [
    { kind: "course", ref: PATH[0] },
    { kind: "lesson", ref: PATH[2] }
  ]);
});

test("ResourceSet falha fechado quando lock ou autoridade impedem edição", async (context) => {
  const indexedDb = new IDBFactory();
  const lockedStore = await openStore(indexedDb);
  const revokedStore = await openStore(indexedDb);
  context.after(() => { lockedStore.close(); revokedStore.close(); });
  const selectedKeys = installedPackages(1).map((item) => `${item.packageId}@${item.version}`);
  const lockedCatalog = new ResourceCatalog({ resourceLocked: true });
  const lockedClient = new AuthoringWorkspaceClient({
    catalog: lockedCatalog, authClient: authClient(), relationalStore: lockedStore
  });
  const lockedPage = await lockedClient.loadAuthoringResourceSetPage({
    workspaceId: WORKSPACE_ID, microsequencePath: PATH, online: true
  });
  assert.equal(lockedPage.editable, false);
  await assert.rejects(lockedClient.saveAuthoringResourceSetSelection({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    selectedKeys,
    selectionComplete: true,
    scope: { kind: "microsequence", entityPath: PATH },
    expectedRevision: 7,
    online: true
  }), (error) => error.code === "research_lock_conflict");

  const revokedCatalog = new ResourceCatalog({ author: false });
  const revokedClient = new AuthoringWorkspaceClient({
    catalog: revokedCatalog, authClient: authClient(), relationalStore: revokedStore
  });
  const revokedPage = await revokedClient.loadAuthoringResourceSetPage({
    workspaceId: WORKSPACE_ID, microsequencePath: PATH, online: true
  });
  assert.equal(revokedPage.editable, false);
  await assert.rejects(revokedClient.saveAuthoringResourceSetSelection({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    selectedKeys,
    selectionComplete: true,
    scope: { kind: "microsequence", entityPath: PATH },
    expectedRevision: 7,
    online: true
  }), (error) => error.code === "design_override_forbidden");
  assert.deepEqual(lockedCatalog.mutations, []);
  assert.deepEqual(revokedCatalog.mutations, []);
});

test("ResourceSet aplica grupo microssequência a microssequência com resultado explícito", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const catalog = new ResourceCatalog();
  const client = new AuthoringWorkspaceClient({
    catalog,
    authClient: authClient(),
    relationalStore: store
  });
  const selected = installedPackages(1).map((item) => `${item.packageId}@${item.version}`);
  const otherPath = [...PATH.slice(0, 3), "micro-other"];
  const result = await client.saveAuthoringResourceSetSelection({
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    selectedKeys: selected,
    selectionComplete: true,
    scope: { kind: "microsequence_set", microsequencePaths: [PATH, otherPath] },
    expectedRevision: 7,
    online: true
  });

  assert.equal(result.succeeded, 2);
  assert.equal(result.partial, false);
  assert.deepEqual(result.outcomes.map(({ status }) => status), ["succeeded", "succeeded"]);
  assert.deepEqual(catalog.mutations.map(({ operation }) => operation), [
    "save_resource_set", "set_parameter", "resolve_effective",
    "save_resource_set", "set_parameter", "resolve_effective"
  ]);
});

test("corrida após salvar ResourceSet é retomada com o mesmo request sem duplicar", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const catalog = new ResourceCatalog({ raceAssignmentOnce: true });
  const client = new AuthoringWorkspaceClient({
    catalog,
    authClient: authClient(),
    relationalStore: store
  });
  const input = {
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    selectedKeys: installedPackages(1).map((item) => `${item.packageId}@${item.version}`),
    selectionComplete: true,
    scope: { kind: "microsequence", entityPath: PATH },
    expectedRevision: 7,
    online: true
  };
  const interrupted = await client.saveAuthoringResourceSetSelection(input);
  assert.equal(interrupted.partial, true);
  assert.equal(interrupted.outcomes[0].orphanedResourceSet, true);

  const resumed = await client.saveAuthoringResourceSetSelection({
    ...input,
    requestId: interrupted.recovery.requestId
  });
  assert.equal(resumed.succeeded, 1);
  assert.equal(resumed.partial, false);
  assert.deepEqual(catalog.mutations.map(({ operation }) => operation), [
    "save_resource_set", "set_parameter", "resolve_effective"
  ]);
});

test("falha após atribuição de ResourceSet retorna partial e retry realmente conclui", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());
  const catalog = new ResourceCatalog({ failResolve: true });
  const client = new AuthoringWorkspaceClient({
    catalog,
    authClient: authClient(),
    relationalStore: store
  });
  const input = {
    workspaceId: WORKSPACE_ID,
    microsequencePath: PATH,
    selectedKeys: installedPackages(1).map((item) => `${item.packageId}@${item.version}`),
    selectionComplete: true,
    scope: { kind: "microsequence", entityPath: PATH },
    expectedRevision: 7,
    online: true
  };
  const result = await client.saveAuthoringResourceSetSelection(input);

  assert.equal(result.partial, true);
  assert.equal(result.failed, 1);
  assert.equal(result.outcomes[0].partialState, "assignment_saved_resolution_pending");
  assert.ok(result.outcomes[0].resourceSetRef);
  assert.deepEqual(result.recovery, {
    action: "retry_same_request",
    requestId: result.requestId,
    message: "Tente novamente: as etapas já aceitas serão reconhecidas sem duplicação."
  });
  catalog.failResolve = false;
  const retried = await client.saveAuthoringResourceSetSelection({
    ...input,
    requestId: result.recovery.requestId
  });
  assert.equal(retried.succeeded, 1);
  assert.equal(retried.partial, false);
  assert.deepEqual(catalog.mutations.map(({ operation }) => operation), [
    "save_resource_set", "set_parameter", "resolve_effective"
  ]);
});
