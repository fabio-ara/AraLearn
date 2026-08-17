import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createRestrictedResourceCatalogAccess,
  legacyResourceCatalogAccess,
  resolveResourceCatalogAccess
} from "../../supabase/functions/_shared/aralearn-authoring/resourceCatalogAccess.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { executeAuthoringTool } from "../../supabase/functions/_shared/aralearn-authoring/authoringToolExecutor.js";
import {
  RESOURCE_CATALOG,
  RESOURCE_PACKAGE_REGISTRY
} from "../../src/resources/catalog/resourceCatalog.js";

const fixture = JSON.parse(await readFile(new URL(
  "../fixtures/pedagogy/instructional-design-scenarios.v1.json",
  import.meta.url
), "utf8"));

function designFixture() {
  const effectiveSnapshot = structuredClone(fixture.canonicalLifecycle.effectiveSnapshot);
  const resourceSet = structuredClone(fixture.canonicalLifecycle.resourceSets[0]);
  resourceSet.resolvedCatalogVersion = RESOURCE_CATALOG.catalogVersion;
  resourceSet.facetBasis.catalogVersion = RESOURCE_CATALOG.catalogVersion;
  return { effectiveSnapshot, resourceSets: [resourceSet] };
}

function access(overrides = {}) {
  const current = designFixture();
  return createRestrictedResourceCatalogAccess({
    effectiveSnapshot: overrides.effectiveSnapshot || current.effectiveSnapshot,
    resourceSets: overrides.resourceSets || current.resourceSets,
    catalog: RESOURCE_CATALOG,
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
}

function exampleInstance(packageId, slot, id) {
  const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog()
    .find(({ id: candidateId }) => candidateId === packageId);
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, manifest.version);
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id,
    package: packageId,
    version: manifest.version,
    data: contract.contract.example
  }, slot);
}

function studyUnitWith(packageId, role = "theory") {
  return {
    id: `card-${packageId.split(".").at(-1)}`,
    position: 1,
    title: "Representação",
    role,
    content: [exampleInstance(packageId, "content", "content-a")],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
}

test("caminho sem snapshot declara disponibilidade irrestrita anterior", () => {
  const result = legacyResourceCatalogAccess();
  assert.deepEqual(result.availability, {
    mode: "legacy_unrestricted",
    snapshotRef: null,
    resourceSetRefs: []
  });
  assert.equal(result.catalog.contract, RESOURCE_CATALOG.contract);
  assert.equal(result.catalog.catalogVersion, RESOURCE_CATALOG.catalogVersion);
});

test("ResourceSet filtra descoberta progressiva e recusa contrato fora do conjunto", () => {
  const result = access();
  assert.deepEqual(result.availability, {
    mode: "resource_set_restricted",
    snapshotRef: {
      id: "snapshot-computing-transport-1",
      version: "1.0.0"
    },
    resourceSetRefs: [{ id: "resource-set-condition-a", version: "1.0.0" }]
  });
  const explored = result.catalog.explore();
  assert.equal(explored.catalogVersion, RESOURCE_CATALOG.catalogVersion);
  assert.equal(explored.packageCount, 3);
  const searched = result.catalog.search({
    query: "explicação progressiva em prosa",
    slot: "content",
    structureIds: ["structure.prose"],
    taskOperationIds: ["task_operation.explain"]
  });
  assert.equal(searched.candidates[0].packageId, "aralearn.resource.paragraph");
  assert.deepEqual(searched.candidates[0].authorizedByResourceSetRef, {
    id: "resource-set-condition-a",
    version: "1.0.0"
  });
  assert.equal(searched.candidates.every(({ packageId, version }) => (
    new Set([
      "aralearn.resource.paragraph@1.0.0",
      "aralearn.resource.relation_map@1.0.0",
      "aralearn.response.choice@1.0.0"
    ]).has(`${packageId}@${version}`)
  )), true);
  assert.equal(result.catalog.inspect([{
    packageId: "aralearn.resource.paragraph",
    version: "1.0.0"
  }]).items[0].status, "ok");
  assert.equal(result.catalog.contracts([{
    packageId: "aralearn.resource.paragraph",
    version: "1.0.0"
  }]).items[0].definition.package, "aralearn.resource.paragraph");
  assert.throws(() => result.catalog.inspect([{
    packageId: "aralearn.resource.chart",
    version: "1.0.0"
  }]), /não pertence ao ResourceSet efetivo/u);
  assert.throws(() => result.catalog.contracts([{
    packageId: "aralearn.resource.chart",
    version: "1.0.0"
  }]), /não pertence ao ResourceSet efetivo/u);
});

test("avaliação exata de candidato preserva fit, limitação e ResourceSet autorizador", () => {
  const result = access();
  const assessed = result.catalog.assessCandidate({
    packageId: "aralearn.resource.paragraph",
    version: "1.0.0"
  }, {
    studyUnitRole: "theory",
    slot: "content",
    structureIds: ["structure.prose"],
    taskOperationIds: ["task_operation.explain"]
  });
  assert.equal(assessed.status, "authorized");
  assert.equal(assessed.candidate.fit, "canonical");
  assert.deepEqual(assessed.candidate.authorizedByResourceSetRef, {
    id: "resource-set-condition-a",
    version: "1.0.0"
  });
  assert.deepEqual(assessed.candidate.limitations, []);

  const blocked = result.catalog.assessCandidate({
    packageId: "aralearn.resource.paragraph",
    version: "1.0.0"
  }, {
    studyUnitRole: "practice",
    slot: "response",
    structureIds: ["structure.quantitative_series"],
    taskOperationIds: ["task_operation.compare"]
  });
  assert.equal(blocked.status, "incompatible_slot");
});

test("fit e papel usam um único ResourceSet autorizador exato", () => {
  const { effectiveSnapshot, resourceSets } = designFixture();
  const canonicalOnly = resourceSets[0];
  canonicalOnly.selectionConstraints.allowedFits = ["canonical"];
  canonicalOnly.selectionConstraints.allowEmbeddedPractice = false;
  canonicalOnly.selectionConstraints.allowResponsePackages = false;
  const substituteSet = structuredClone(canonicalOnly);
  substituteSet.id = "resource-set-substitute";
  substituteSet.packages = [{
    packageId: "aralearn.resource.paragraph",
    version: "1.0.0"
  }];
  substituteSet.selectionConstraints.allowedFits = ["substitute"];
  substituteSet.selectionConstraints.onNoAdequateRepresentation = "record_limitation";
  effectiveSnapshot.resourceSetRefs.push({
    id: substituteSet.id,
    version: substituteSet.version
  });
  const result = access({
    effectiveSnapshot,
    resourceSets: [canonicalOnly, substituteSet]
  });
  const substitute = result.catalog.search({
    query: "cartografia estelar tridimensional especializada inexistente",
    slot: "content",
    notationIsLearningObject: true
  });
  assert.equal(substitute.coverage.status, "substitute");
  assert.equal(substitute.candidates[0].fit, "substitute");
  assert.deepEqual(substitute.candidates[0].authorizedByResourceSetRef, {
    id: "resource-set-substitute",
    version: "1.0.0"
  });
  assert.match(substitute.candidates[0].limitations[0], /aproximação/u);

  const embedded = result.catalog.search({
    query: "explicação progressiva em prosa",
    slot: "content",
    studyUnitRole: "practice",
    structureIds: ["structure.prose"]
  });
  assert.equal(embedded.coverage.status, "blocked");
  assert.deepEqual(embedded.candidates, []);

  const response = result.catalog.search({
    query: "selecionar uma alternativa",
    slot: "response",
    practiceModeIds: ["practice.selection"]
  });
  assert.equal(response.coverage.status, "blocked");
  assert.deepEqual(response.candidates, []);
});

test("política efetiva ou ResourceSet bloqueiam substitute sem fingir equivalência", () => {
  const blockedBySet = designFixture();
  blockedBySet.resourceSets[0].selectionConstraints.onNoAdequateRepresentation = "block";
  const setResult = access(blockedBySet).catalog.search({
    query: "cartografia estelar tridimensional especializada inexistente",
    slot: "content",
    notationIsLearningObject: true
  });
  assert.equal(setResult.coverage.status, "blocked");
  assert.match(setResult.coverage.chatDisclosure, /não contém uma representação autorizada/u);

  const blockedBySnapshot = designFixture();
  blockedBySnapshot.effectiveSnapshot.resolvedValues.find(({ definitionRef }) => (
    definitionRef.id === "representation_fallback_policy"
  )).value = { kind: "enum", value: "block" };
  const snapshotResult = access(blockedBySnapshot).catalog.search({
    query: "cartografia estelar tridimensional especializada inexistente",
    slot: "content",
    notationIsLearningObject: true
  });
  assert.equal(snapshotResult.coverage.status, "blocked");
  assert.deepEqual(snapshotResult.candidates, []);
});

test("política de representação trata versatile como aproximação registrada", () => {
  const current = designFixture();
  current.resourceSets[0].packages = [{
    packageId: "aralearn.resource.tree",
    version: "1.0.0"
  }];
  current.resourceSets[0].selectionConstraints.allowedFits = ["versatile"];
  const policyValue = current.effectiveSnapshot.resolvedValues.find(({ definitionRef }) => (
    definitionRef.id === "representation_fallback_policy"
  ));
  policyValue.value = { kind: "enum", value: "block" };
  const blocked = access(current).catalog.search({
    disciplineIds: ["discipline.language"],
    structureIds: ["structure.hierarchy"]
  });
  assert.equal(blocked.coverage.status, "blocked");
  assert.deepEqual(blocked.candidates, []);

  policyValue.value = { kind: "enum", value: "allow_versatile_with_limitation" };
  const allowed = access(current).catalog.search({
    disciplineIds: ["discipline.language"],
    structureIds: ["structure.hierarchy"]
  });
  assert.equal(allowed.coverage.status, "versatile");
  assert.equal(allowed.candidates[0].packageId, "aralearn.resource.tree");
  assert.match(allowed.candidates[0].limitations[0], /transversal/u);
});

test("validação e auditoria rejeitam package materializado fora da disponibilidade", () => {
  const restricted = access().catalog;
  const allowed = studyUnitWith("aralearn.resource.paragraph");
  assert.equal(restricted.validateStudyUnit(allowed).valid, true);

  const outside = studyUnitWith("aralearn.resource.chart");
  const validation = restricted.validateStudyUnit(outside);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((message) => message.includes("ResourceSet efetivo")));
  const audit = restricted.auditRepresentation({
    studyUnit: outside,
    intent: {
      structureIds: ["structure.quantitative_series"],
      taskOperationIds: ["task_operation.compare"]
    }
  });
  assert.equal(audit.structural.valid, false);
  assert.equal(audit.overallFit, "substitute");
  assert.ok(audit.selections[0].missing.includes("availability:resource_set"));
});

test("resolver carrega snapshot e cada ResourceSet pelo backend, sem aceitar allowlist", async () => {
  const { effectiveSnapshot, resourceSets } = designFixture();
  const reads = [];
  const adapter = {
    async getAuthoringEffectiveDesignSnapshot(input) {
      reads.push(["snapshot", input]);
      return structuredClone(effectiveSnapshot);
    },
    async getAuthoringDesignState(input) {
      reads.push(["state", input]);
      return {
        effectiveDesignState: "resolved",
        effectiveSnapshot: structuredClone(effectiveSnapshot)
      };
    },
    async getAuthoringResourceSet(input) {
      reads.push(["resource-set", input]);
      return structuredClone(resourceSets[0]);
    }
  };
  const principal = { actorId: "33333333-3333-4333-8333-333333333333" };
  const result = await resolveResourceCatalogAccess({
    adapter,
    principal,
    workspaceId: "11111111-1111-4111-8111-111111111111",
    snapshotRef: { id: effectiveSnapshot.id, version: effectiveSnapshot.version }
  });
  assert.equal(result.availability.mode, "resource_set_restricted");
  assert.deepEqual(reads.map(([kind]) => kind), ["snapshot", "state", "resource-set"]);
  assert.equal(JSON.stringify(result.availability).includes("packages"), false);
  await assert.rejects(
    resolveResourceCatalogAccess({ adapter, principal, workspaceId: "workspace-only" }),
    (error) => error instanceof AuthoringApiError
      && error.code === "incomplete_resource_catalog_context"
  );
});

test("resolver falha fechado se o backend devolver outro snapshot", async () => {
  const { effectiveSnapshot } = designFixture();
  const adapter = {
    async getAuthoringEffectiveDesignSnapshot() {
      return { ...structuredClone(effectiveSnapshot), id: "snapshot-forjado" };
    },
    async getAuthoringDesignState() {
      throw new Error("não deve ler estado corrente para identidade divergente");
    },
    async getAuthoringResourceSet() {
      throw new Error("não deve carregar ResourceSet");
    }
  };
  await assert.rejects(resolveResourceCatalogAccess({
    adapter,
    principal: { actorId: "33333333-3333-4333-8333-333333333333" },
    workspaceId: "11111111-1111-4111-8111-111111111111",
    snapshotRef: { id: effectiveSnapshot.id, version: effectiveSnapshot.version }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "effective_snapshot_identity_mismatch");
});

test("resolver preserva leitura histórica, mas não autoriza snapshot que deixou de ser corrente", async () => {
  const { effectiveSnapshot, resourceSets } = designFixture();
  let currentStateReads = 0;
  const adapter = {
    async getAuthoringEffectiveDesignSnapshot() {
      return structuredClone(effectiveSnapshot);
    },
    async getAuthoringDesignState() {
      currentStateReads += 1;
      return {
        effectiveDesignState: "resolved",
        effectiveSnapshot: {
          ...structuredClone(effectiveSnapshot),
          version: "2.0.0"
        }
      };
    },
    async getAuthoringResourceSet() {
      return structuredClone(resourceSets[0]);
    }
  };
  await assert.rejects(resolveResourceCatalogAccess({
    adapter,
    principal: { actorId: "33333333-3333-4333-8333-333333333333" },
    workspaceId: "11111111-1111-4111-8111-111111111111",
    snapshotRef: { id: effectiveSnapshot.id, version: effectiveSnapshot.version }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "effective_snapshot_not_current");
  assert.equal(currentStateReads, 1);
});

test("executor MCP não aceita allowlist e aplica o snapshot persistido ao payload", async () => {
  const { effectiveSnapshot, resourceSets } = designFixture();
  const adapter = {
    async getAuthoringEffectiveDesignSnapshot() {
      return structuredClone(effectiveSnapshot);
    },
    async getAuthoringDesignState() {
      return {
        effectiveDesignState: "resolved",
        effectiveSnapshot: structuredClone(effectiveSnapshot)
      };
    },
    async getAuthoringResourceSet() {
      return structuredClone(resourceSets[0]);
    }
  };
  const principal = {
    actorId: "33333333-3333-4333-8333-333333333333",
    scopes: ["authoring:private:read"]
  };
  const result = await executeAuthoringTool({
    adapter,
    principal,
    name: "consultarBibliotecaDeResources",
    rawArguments: {
      operation: "search",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      snapshotRef: { id: effectiveSnapshot.id, version: effectiveSnapshot.version },
      query: "explicação progressiva em prosa",
      slot: "content",
      structureIds: ["structure.prose"],
      taskOperationIds: ["task_operation.explain"]
    },
    deadlineAt: Date.now() + 10_000
  });
  assert.equal(result.data.availability.mode, "resource_set_restricted");
  assert.equal(result.data.result.candidates[0].packageId, "aralearn.resource.paragraph");
  assert.deepEqual(result.data.result.candidates[0].authorizedByResourceSetRef, {
    id: "resource-set-condition-a",
    version: "1.0.0"
  });
  assert.equal(Object.hasOwn(result.data.availability, "packages"), false);
  await assert.rejects(executeAuthoringTool({
    adapter,
    principal,
    name: "consultarBibliotecaDeResources",
    rawArguments: {
      operation: "inspect",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      snapshotRef: { id: effectiveSnapshot.id, version: effectiveSnapshot.version },
      packages: [{ packageId: "aralearn.resource.chart", version: "1.0.0" }]
    }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "invalid_resource_library_request");
  await assert.rejects(executeAuthoringTool({
    adapter,
    principal,
    name: "consultarBibliotecaDeResources",
    rawArguments: {
      operation: "explore",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      snapshotRef: { id: effectiveSnapshot.id, version: effectiveSnapshot.version },
      packageRefs: [{ packageId: "aralearn.resource.chart", version: "1.0.0" }]
    }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "invalid_tool_arguments");
});
