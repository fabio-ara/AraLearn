import { WorkspaceDesignOfflineStore } from "../persistence/WorkspaceDesignOfflineStore.js";
import {
  projectAuthoringAuditSlice,
  projectAuthoringDesignSlice,
  projectAuthoringFinding,
  projectAuthoringWorkspaceListItem,
  projectAuthoringWorkspaceOverview,
  resolveProjectedFindingTarget
} from "../authoring/authoringWorkspaceProjection.js";
import {
  RESOURCE_CATALOG,
  RESOURCE_PACKAGE_REGISTRY
} from "../resources/catalog/resourceCatalog.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const WORKSPACE_LIST_CACHE_CONTRACT = "aralearn.authoring-workspace-list-cache.v1";
const WORKSPACE_OVERVIEW_CACHE_CONTRACT = "aralearn.authoring-workspace-overview-cache.v1";
const AUTHORING_AUDIT_CACHE_CONTRACT = "aralearn.authoring-audit-cache.v1";
const AUTHORING_EXPERIMENT_LIST_CACHE_CONTRACT = "aralearn.authoring-experiment-list-cache.v1";
const AUTHORING_EXPERIMENT_SECTION_CACHE_CONTRACT = "aralearn.authoring-experiment-section-cache.v1";
const EXPERIMENT_ENROLLMENT_HANDLE_CACHE_CONTRACT = "aralearn.experiment-enrollment-handles.v1";
const CACHE_PREFIX = "learning.authoring.v1";
const PAGE_LIMIT = 100;
const MAX_PAGES = 100;
const FINDING_PAGE_LIMIT = 50;
const ACTIVE_FINDING_STATUSES = Object.freeze(["open", "approved", "repaired"]);
const EXPERIMENT_OPTION_KINDS = Object.freeze(new Set([
  "scope", "base", "factor_definition", "resource_set", "consent_policy", "instrument", "outcome"
]));
const EXPERIMENT_READ_SECTIONS = Object.freeze(new Set([
  "overview", "protocol", "variants", "differences", "participants"
]));
const cacheFallbackLocks = new Map();

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function revision(value) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new TypeError("Revisão de workspace inválida.");
  }
  return normalized;
}

function nonNegativeRevision(value, label = "Revisão do experimento") {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} inválida.`);
  }
  return normalized;
}

function boundedIdentifier(value, label) {
  const normalized = text(value);
  if (!normalized || normalized.length > 240) throw new TypeError(`${label} inválido.`);
  return normalized;
}

function enrollmentCode(value) {
  const normalized = text(value);
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(normalized)) {
    throw new TypeError("Código de ingresso inválido.");
  }
  return normalized;
}

function projectedExperimentEnrollment(value) {
  const status = text(value?.status);
  if (!["enrolled", "assigned", "withdrawn"].includes(status)) {
    throw new Error("O ingresso experimental devolveu um estado inválido.");
  }
  if (["enrolled", "withdrawn"].includes(status) && value?.selection != null) {
    throw new Error("O ingresso ainda não atribuído devolveu uma seleção indevida.");
  }
  const enrollmentRef = text(value?.enrollmentRef).toLowerCase();
  if (!UUID_PATTERN.test(enrollmentRef)) {
    throw new Error("O ingresso experimental não devolveu um vínculo opaco válido.");
  }
  if (["enrolled", "withdrawn"].includes(status)) {
    return Object.freeze({ enrollmentRef, status, selection: null });
  }
  const selectionId = text(value?.selection?.selectionId).toLowerCase();
  const courseId = text(value?.selection?.courseId).toLowerCase();
  const contentHash = text(value?.selection?.contentHash).toLowerCase();
  const target = value?.selection?.readerTarget;
  if (!UUID_PATTERN.test(selectionId) || !UUID_PATTERN.test(courseId) ||
      !/^[0-9a-f]{64}$/u.test(contentHash) || text(target?.courseId).toLowerCase() !== courseId ||
      target?.access !== "private" || text(target?.contentHash).toLowerCase() !== contentHash) {
    throw new Error("A seleção privada do experimento está incompleta.");
  }
  return Object.freeze({
    enrollmentRef,
    status,
    selection: Object.freeze({
      selectionId,
      courseId,
      contentHash,
      readerTarget: Object.freeze({ courseId, access: "private", contentHash })
    })
  });
}

function workspaceId(value) {
  const normalized = text(value).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new TypeError("Workspace inválido.");
  return normalized;
}

function currentUserId(authClient) {
  const value = text(authClient?.getSession?.()?.user?.id).toLowerCase();
  return UUID_PATTERN.test(value) ? value : "";
}

function normalizeMicrosequencePath(value) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new TypeError("Microssequência inválida.");
  }
  const path = value.map(text);
  if (path.some((entry) => !entry || entry.length > 240)) {
    throw new TypeError("Microssequência inválida.");
  }
  return path;
}

function normalizeEntityPath(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw new TypeError("Destino de conteúdo inválido.");
  }
  const path = value.map(text);
  if (path.some((entry) => !entry || entry.length > 240)) {
    throw new TypeError("Destino de conteúdo inválido.");
  }
  return path;
}

function requestId() {
  return globalThis.crypto.randomUUID();
}

function transportFailure(error) {
  const status = Number(error?.status);
  const code = text(error?.code).toUpperCase();
  return globalThis.navigator?.onLine === false
    || error?.retryable === true
    || error?.name === "AbortError"
    || error?.remoteTransportFailure === true
    || [408, 429].includes(status)
    || status >= 500
    || [
      "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH",
      "EAI_AGAIN", "FETCH_FAILED"
    ].includes(code);
}

function capability(access) {
  const capabilities = access?.capabilities || access || {};
  if (capabilities.manage === true) return "manage";
  if (capabilities.author === true) return "author";
  return "read";
}

function scopePath(workspace, path) {
  return [
    { kind: "workspace", ref: workspace },
    { kind: "course", ref: path[0] },
    { kind: "module", ref: path[1] },
    { kind: "lesson", ref: path[2] },
    { kind: "microsequence", ref: path[3] }
  ];
}

function normalizeParameterValue(value, valueType) {
  if (value && typeof value === "object" && !Array.isArray(value) && value.kind) {
    return structuredClone(value);
  }
  if (valueType === "integer") {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new TypeError("Escolha um número inteiro válido.");
    return { kind: "integer", value: number };
  }
  if (valueType === "enum" && text(value)) return { kind: "enum", value: text(value) };
  throw new TypeError("Este parâmetro exige um controle estruturado compatível.");
}

function designCacheSlice(response, workspace, path, appCapability) {
  if (response?.operation !== "read_slice"
      || text(response?.workspaceId).toLowerCase() !== workspace
      || response?.result?.view !== "parameters") {
    throw new Error("O desenho devolveu uma resposta incompleta.");
  }
  return {
    revision: revision(response.revision),
    scope: { kind: "microsequence", ref: path[3] },
    scopePath: scopePath(workspace, path),
    state: { ...structuredClone(response.result), appCapability }
  };
}

function cacheRow(id, value) {
  return {
    id,
    key: id,
    value: structuredClone(value),
    updatedAt: new Date().toISOString()
  };
}

function rowValue(row) {
  return row && Object.hasOwn(row, "value") ? structuredClone(row.value) : null;
}

function listCacheKey(userId) {
  return `${CACHE_PREFIX}:workspaces:${userId}`;
}

function overviewCacheKey(userId, workspace) {
  return `${CACHE_PREFIX}:overview:${userId}:${workspace}`;
}

function auditCacheKey(userId, workspace, kind, refValue) {
  return `${CACHE_PREFIX}:audit:${userId}:${workspace}:${kind}:${encodeURIComponent(refValue)}`;
}

function experimentListCacheKey(userId, workspace) {
  return `${CACHE_PREFIX}:experiments:${userId}:${workspace}`;
}

function experimentSectionCacheKey(userId, workspace, experiment, section) {
  return `${CACHE_PREFIX}:experiment:${userId}:${workspace}:${encodeURIComponent(experiment)}:${section}`;
}

function experimentEnrollmentHandlesCacheKey(userId) {
  return `${CACHE_PREFIX}:experiment-enrollments:${userId}`;
}

function normalizeAuditScope(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Escopo de auditoria inválido.");
  }
  const kind = text(value.kind);
  const refValue = text(value.ref);
  if (!["microsequence", "part"].includes(kind) || !refValue || refValue.length > 240) {
    throw new TypeError("Escopo de auditoria inválido.");
  }
  return { kind, ref: refValue };
}

function isSameRef(left, right) {
  return text(left?.id) === text(right?.id) && text(left?.version) === text(right?.version);
}

function refKey(value) {
  return `${text(value?.id)}@${text(value?.version)}`;
}

function packageKey(value) {
  return `${text(value?.packageId)}@${text(value?.version)}`;
}

function normalizeResourceSetRef(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || !text(value.id) || !text(value.version)) {
    throw new TypeError("Escolha um conjunto disponível.");
  }
  return { id: text(value.id), version: text(value.version) };
}

function normalizeVersionedRef(value, label = "Referência") {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !text(value.id) || !text(value.version) || text(value.id).length > 240 ||
      text(value.version).length > 120) {
    throw new TypeError(`${label} inválida.`);
  }
  return { id: text(value.id), version: text(value.version) };
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function derivedRequestId(base, label) {
  const hex = [0, 1, 2, 3].map((salt) => fnv1a(`${base}:${label}:${salt}`)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}`
    + `-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function normalizedSearchText(value) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase();
}

function profileList() {
  return RESOURCE_PACKAGE_REGISTRY.listCatalog()
    .map((manifest) => RESOURCE_CATALOG.getProfile(manifest.id, manifest.version))
    .filter(Boolean)
    .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
}

function selectedProfiles(keys) {
  const seen = new Set();
  return list(keys).map((key) => {
    const normalized = text(key);
    const at = normalized.lastIndexOf("@");
    if (at < 1 || seen.has(normalized)) throw new TypeError("Seleção de Resources inválida.");
    const profile = RESOURCE_CATALOG.getProfile(
      normalized.slice(0, at),
      normalized.slice(at + 1)
    );
    if (!profile) throw new TypeError("Um Resource selecionado já não está instalado.");
    seen.add(normalized);
    return profile;
  });
}

function facetBasis(profiles) {
  const unique = (field) => [...new Set(profiles.flatMap((profile) => list(profile[field])))];
  return {
    catalogVersion: RESOURCE_CATALOG.catalogVersion,
    families: unique("familyIds"),
    disciplines: unique("disciplineIds"),
    structures: unique("structureIds"),
    cognitiveOperations: unique("operationIds"),
    practiceModalities: unique("practiceModeIds")
  };
}

function defaultConstraints() {
  return {
    allowedFits: ["canonical"],
    allowEmbeddedPractice: true,
    allowResponsePackages: true,
    onNoAdequateRepresentation: "block"
  };
}

function flattenOutlineMicrosequences(outline) {
  return list(outline?.content?.courses || outline?.courses).flatMap((course) =>
    list(course?.modules).flatMap((moduleValue) =>
      list(moduleValue?.lessons).flatMap((lesson) =>
        list(lesson?.microsequences).map((microsequence) => ({
          title: text(microsequence?.title) || "Microssequência",
          contextLabel: [
            text(course?.title) || "Curso",
            text(lesson?.title) || "Lição",
            text(microsequence?.title) || "Microssequência"
          ].join(" › "),
          entityPath: [course?.id, moduleValue?.id, lesson?.id, microsequence?.id].map(text)
        }))
      )
    )
  ).filter(({ entityPath }) => entityPath.every(Boolean));
}

function scopeChoices(outline, path) {
  const targets = flattenOutlineMicrosequences(outline).map((item) => ({
    entityPath: structuredClone(item.entityPath),
    label: item.contextLabel,
    selected: item.entityPath.every((entry, index) => entry === path[index])
  })).sort((left, right) => (
    Number(right.selected) - Number(left.selected)
    || left.label.localeCompare(right.label, "pt-BR")
  ));
  return [
    { key: "microsequence", label: "Esta microssequência", available: true },
    { key: "lesson", label: "Esta lição", available: true },
    { key: "course", label: "Este curso", available: true },
    {
      key: "microsequence_set",
      label: "Várias microssequências",
      available: targets.length > 1,
      targets
    }
  ];
}

function scopeForPath(kind, path) {
  if (kind === "course") return { kind, ref: path[0] };
  if (kind === "lesson") return { kind, ref: path[2] };
  return { kind: "microsequence", ref: path[3] };
}

export class AuthoringWorkspaceClient {
  #catalog;
  #authClient;
  #store;
  #offlineStore = null;
  #offlineUserId = "";
  #resourceSetCache = new Map();
  #withdrawnEnrollmentRefs = new Set();

  constructor({ catalog, authClient, relationalStore = null } = {}) {
    if (!catalog || !authClient) throw new TypeError("Dependências da Autoria ausentes.");
    this.#catalog = catalog;
    this.#authClient = authClient;
    this.#store = relationalStore;
  }

  #userId() {
    const userId = currentUserId(this.#authClient);
    if (!userId) throw new Error("Entre na sua conta para abrir a Autoria.");
    return userId;
  }

  #designStore() {
    const userId = this.#userId();
    if (!this.#store) {
      throw new Error("O armazenamento de Autoria ainda não foi vinculado à sua conta.");
    }
    if (this.#offlineStore && this.#offlineUserId === userId) return this.#offlineStore;
    this.#offlineStore = new WorkspaceDesignOfflineStore(this.#store, { userId });
    this.#offlineUserId = userId;
    return this.#offlineStore;
  }

  async #atomicCache(key, callback) {
    if (!this.#store || typeof this.#store.getSyncState !== "function") return null;
    if (typeof this.#store.transaction === "function") {
      return this.#store.transaction(["syncState"], "readwrite", async (transaction) => {
        const current = rowValue(await transaction.get("syncState", key));
        const next = await callback(current);
        if (next !== undefined) {
          if (next === null) await transaction.delete("syncState", key);
          else await transaction.put("syncState", cacheRow(key, next));
        }
        return next;
      });
    }
    const lockKey = `${this.#userId()}:${key}`;
    const previous = cacheFallbackLocks.get(lockKey) || Promise.resolve();
    const pending = previous.catch(() => undefined).then(async () => {
      const current = await this.#store.getSyncState(key);
      const next = await callback(current);
      if (next !== undefined) await this.#store.putSyncState(key, next);
      return next;
    });
    cacheFallbackLocks.set(lockKey, pending);
    return pending.finally(() => {
      if (cacheFallbackLocks.get(lockKey) === pending) cacheFallbackLocks.delete(lockKey);
    });
  }

  async #bestEffortCache(callback) {
    try {
      await callback();
      return false;
    } catch {
      return true;
    }
  }

  async #readCache(key, contract) {
    if (!this.#store || typeof this.#store.getSyncState !== "function") return null;
    const value = await this.#store.getSyncState(key);
    if (value == null) return null;
    if (value?.contract !== contract || value.userId !== this.#userId()) {
      throw new Error("O cache offline de Autoria está corrompido.");
    }
    return structuredClone(value);
  }

  async #writeWorkspaceList(items, readStartedAt) {
    const userId = this.#userId();
    return this.#atomicCache(listCacheKey(userId), (current) => {
      if (current?.contract === WORKSPACE_LIST_CACHE_CONTRACT
          && current.userId === userId
          && Date.parse(current.cachedAt || "") >= readStartedAt) {
        // A resposta pertence a uma leitura iniciada antes do snapshot já
        // persistido. Preservar o membership inteiro evita ressuscitar acesso
        // removido ou workspace excluído por uma resposta atrasada.
        return undefined;
      }
      const incomingById = new Map(items.map((item) => [item.workspaceId, structuredClone(item)]));
      const currentItems = current?.contract === WORKSPACE_LIST_CACHE_CONTRACT
        && current.userId === userId ? list(current.items) : [];
      for (const existing of currentItems) {
        const incoming = incomingById.get(existing.workspaceId);
        if (incoming && Number(existing.revision) > Number(incoming.revision)) {
          incomingById.set(existing.workspaceId, structuredClone(existing));
        }
      }
      return {
        contract: WORKSPACE_LIST_CACHE_CONTRACT,
        userId,
        items: [...incomingById.values()],
        cachedAt: new Date().toISOString()
      };
    });
  }

  async #writeWorkspaceSnapshot(key, contract, workspace, raw, readStartedAt) {
    const userId = this.#userId();
    const incomingRevision = revision(raw.revision ?? raw.outline?.revision);
    return this.#atomicCache(key, (current) => {
      const currentRevision = Number(current?.revision ?? current?.outline?.revision);
      if (current?.contract === contract && current.userId === userId
          && (currentRevision > incomingRevision
            || (currentRevision === incomingRevision
              && Date.parse(current.cachedAt || "") > readStartedAt))) {
        return undefined;
      }
      return {
        contract,
        userId,
        workspaceId: workspace,
        ...structuredClone(raw),
        revision: incomingRevision,
        cachedAt: new Date().toISOString()
      };
    });
  }

  async #writeAuditSnapshot(key, workspace, audit, readStartedAt) {
    const userId = this.#userId();
    return this.#atomicCache(key, (current) => {
      if (current?.contract === AUTHORING_AUDIT_CACHE_CONTRACT
          && current.userId === userId
          && current.workspaceId === workspace
          && Date.parse(current.cachedAt || "") >= readStartedAt) {
        return undefined;
      }
      return {
        contract: AUTHORING_AUDIT_CACHE_CONTRACT,
        userId,
        workspaceId: workspace,
        audit: structuredClone(audit),
        cachedAt: new Date().toISOString()
      };
    });
  }

  async #writeExperimentSnapshot({
    key,
    contract,
    workspace,
    experimentId = "",
    workspaceRevision,
    experimentRevision = 0,
    snapshot,
    readStartedAt
  }) {
    const userId = this.#userId();
    const incomingWorkspaceRevision = revision(workspaceRevision);
    const incomingExperimentRevision = nonNegativeRevision(experimentRevision);
    return this.#atomicCache(key, (current) => {
      const currentWorkspaceRevision = Number(current?.workspaceRevision || 0);
      const currentExperimentRevision = Number(current?.experimentRevision || 0);
      const currentIsNewer = contract === AUTHORING_EXPERIMENT_SECTION_CACHE_CONTRACT
        ? currentExperimentRevision > incomingExperimentRevision ||
          (currentExperimentRevision === incomingExperimentRevision &&
            currentWorkspaceRevision > incomingWorkspaceRevision)
        : currentWorkspaceRevision > incomingWorkspaceRevision;
      const sameRevisionIsLater = currentWorkspaceRevision === incomingWorkspaceRevision &&
        currentExperimentRevision === incomingExperimentRevision &&
        Date.parse(current?.cachedAt || "") > readStartedAt;
      if (current?.contract === contract && current.userId === userId &&
          current.workspaceId === workspace && (currentIsNewer || sameRevisionIsLater)) {
        return undefined;
      }
      let nextSnapshot = structuredClone(snapshot);
      if (contract === AUTHORING_EXPERIMENT_LIST_CACHE_CONTRACT &&
          current?.contract === contract && current.userId === userId &&
          current.workspaceId === workspace && currentWorkspaceRevision === incomingWorkspaceRevision) {
        const currentSource = current.snapshot?.experiments || current.snapshot?.result?.experiments ||
          current.snapshot || {};
        const nextSource = nextSnapshot?.experiments || nextSnapshot?.result?.experiments || nextSnapshot || {};
        if (refKey(currentSource.experimentSetRef || current.snapshot?.experimentSetRef) !==
            refKey(nextSource.experimentSetRef || nextSnapshot?.experimentSetRef)) {
          return {
            contract,
            userId,
            workspaceId: workspace,
            workspaceRevision: incomingWorkspaceRevision,
            experimentRevision: incomingExperimentRevision,
            snapshot: nextSnapshot,
            cachedAt: new Date().toISOString()
          };
        }
        const currentById = new Map(list(currentSource.items || currentSource.experiments).map((item) => [
          text(item?.experimentId || item?.id), item
        ]));
        const incomingItems = list(nextSource.items || nextSource.experiments).map((item) => {
          const id = text(item?.experimentId || item?.id);
          const existing = currentById.get(id);
          return Number(existing?.experimentRevision || 0) > Number(item?.experimentRevision || 0)
            ? structuredClone(existing)
            : item;
        });
        const incomingIds = new Set(incomingItems.map((item) => text(item?.experimentId || item?.id)));
        for (const existing of currentById.values()) {
          const id = text(existing?.experimentId || existing?.id);
          if (id && !incomingIds.has(id)) incomingItems.push(structuredClone(existing));
        }
        if (Array.isArray(nextSource.items)) nextSource.items = incomingItems;
        else if (Array.isArray(nextSource.experiments)) nextSource.experiments = incomingItems;
      }
      return {
        contract,
        userId,
        workspaceId: workspace,
        ...(experimentId ? { experimentId } : {}),
        workspaceRevision: incomingWorkspaceRevision,
        experimentRevision: incomingExperimentRevision,
        snapshot: nextSnapshot,
        cachedAt: new Date().toISOString()
      };
    });
  }

  async #readExperimentSnapshot(key, contract, workspace, experimentId = "") {
    const cached = await this.#readCache(key, contract);
    if (!cached) return null;
    if (cached.workspaceId !== workspace || (experimentId && cached.experimentId !== experimentId) ||
        !cached.snapshot || typeof cached.snapshot !== "object") {
      throw new Error("O cache offline de experimentos está corrompido.");
    }
    return { ...structuredClone(cached.snapshot), stale: true, cacheWriteFailed: false };
  }

  async #writeExperimentEnrollmentHandle(projected, { pendingPurgeCourseId = "" } = {}) {
    const userId = this.#userId();
    const key = experimentEnrollmentHandlesCacheKey(userId);
    await this.#atomicCache(key, (current) => {
      const handles = current?.contract === EXPERIMENT_ENROLLMENT_HANDLE_CACHE_CONTRACT &&
        current.userId === userId && current.handles && typeof current.handles === "object"
        ? structuredClone(current.handles)
        : {};
      handles[projected.enrollmentRef] = {
        enrollmentRef: projected.enrollmentRef,
        status: projected.status,
        selection: projected.selection == null ? null : structuredClone(projected.selection),
        ...(pendingPurgeCourseId ? { pendingPurgeCourseId } : {}),
        updatedAt: new Date().toISOString()
      };
      return {
        contract: EXPERIMENT_ENROLLMENT_HANDLE_CACHE_CONTRACT,
        userId,
        handles,
        cachedAt: new Date().toISOString()
      };
    });
  }

  async #readExperimentEnrollmentHandles() {
    let cached = await this.#readCache(
      experimentEnrollmentHandlesCacheKey(this.#userId()),
      EXPERIMENT_ENROLLMENT_HANDLE_CACHE_CONTRACT
    );
    const pendingPurges = Object.values(cached?.handles || {}).filter((entry) => (
      entry?.status === "withdrawn" && text(entry?.pendingPurgeCourseId)
    ));
    for (const entry of pendingPurges) {
      try {
        if (typeof this.#store?.removeOfficialCourseReplica === "function") {
          await this.#store.removeOfficialCourseReplica(entry.pendingPurgeCourseId, { removeSelection: true });
        }
        await this.#writeExperimentEnrollmentHandle(projectedExperimentEnrollment(entry));
      } catch {
        // A lápide withdrawn continua fail-closed e a limpeza será tentada na próxima abertura.
      }
    }
    if (pendingPurges.length) {
      cached = await this.#readCache(
        experimentEnrollmentHandlesCacheKey(this.#userId()),
        EXPERIMENT_ENROLLMENT_HANDLE_CACHE_CONTRACT
      );
    }
    const handles = cached?.handles && typeof cached.handles === "object" ? cached.handles : {};
    return Object.freeze(Object.values(handles).flatMap((entry) => {
      try {
        if (this.#withdrawnEnrollmentRefs.has(text(entry?.enrollmentRef).toLowerCase())) {
          return [Object.freeze({
            enrollmentRef: text(entry.enrollmentRef).toLowerCase(),
            status: "withdrawn",
            selection: null
          })];
        }
        return [projectedExperimentEnrollment(entry)];
      } catch {
        return [];
      }
    }));
  }

  async #readCachedAudit(key) {
    const cached = await this.#readCache(key, AUTHORING_AUDIT_CACHE_CONTRACT);
    return cached?.audit ? {
      ...structuredClone(cached.audit),
      stale: true,
      nextCursor: null
    } : null;
  }

  async #executeRemote(tool, args) {
    try {
      return await this.#catalog.executeApplicationAuthoringAction(tool, args);
    } catch (error) {
      // `fetch` rejeita falhas de rede como TypeError. A marca é aplicada
      // somente na fronteira remota; validadores de resposta rodam depois e
      // portanto não podem ser mascarados por um cache antigo.
      if (error?.name === "TypeError") error.remoteTransportFailure = true;
      throw error;
    }
  }

  #requireOnlineMutation(online) {
    if (!online || globalThis.navigator?.onLine === false) {
      const error = new Error("Conecte-se para registrar esta decisão no workspace.");
      error.code = "authoring_online_required";
      throw error;
    }
  }

  #requireOnlineExperiment(online) {
    if (!online || globalThis.navigator?.onLine === false) {
      const error = new Error("Conecte-se para gerenciar experimentos instrucionais.");
      error.code = "authoring_online_required";
      throw error;
    }
  }

  async loadInstructionalExperimentEnrollmentPolicy({
    enrollmentCode: codeValue,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    const response = await this.#executeRemote("ingressarEmExperimentoInstrucional", {
      operation: "read_policy",
      enrollmentCode: enrollmentCode(codeValue)
    });
    const policy = response?.policy;
    const ref = normalizeVersionedRef(policy?.ref, "Política de consentimento");
    const title = text(response?.title);
    const label = text(policy?.label);
    const publicText = text(policy?.publicText);
    if (!title || !label || !publicText || publicText.length > 20000) {
      throw new Error("A política de ingresso devolveu uma resposta incompleta.");
    }
    return Object.freeze({
      title,
      policy: Object.freeze({ ref: Object.freeze(ref), label, publicText })
    });
  }

  async enrollInInstructionalExperiment({
    enrollmentCode: codeValue,
    consentPolicyRef,
    consentAcknowledged,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    if (consentAcknowledged !== true) {
      throw new TypeError("O consentimento precisa ser confirmado explicitamente.");
    }
    const response = await this.#executeWithReplay("ingressarEmExperimentoInstrucional", {
      operation: "enroll",
      enrollmentCode: enrollmentCode(codeValue),
      requestId: suppliedRequestId || requestId(),
      consentPolicyRef: normalizeVersionedRef(consentPolicyRef, "Política de consentimento"),
      consentAcknowledged: true
    });
    const projected = projectedExperimentEnrollment(response);
    await this.#bestEffortCache(() => this.#writeExperimentEnrollmentHandle(projected));
    return projected;
  }

  listInstructionalExperimentEnrollments() {
    return this.#readExperimentEnrollmentHandles();
  }

  async loadInstructionalExperimentEnrollmentStatus({
    enrollmentRef: enrollmentValue,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    const enrollmentRef = text(enrollmentValue).toLowerCase();
    if (!UUID_PATTERN.test(enrollmentRef)) throw new TypeError("Vínculo experimental inválido.");
    const response = await this.#executeRemote("ingressarEmExperimentoInstrucional", {
      operation: "status",
      enrollmentRef
    });
    const projected = projectedExperimentEnrollment(response);
    if (projected.enrollmentRef !== enrollmentRef) {
      throw new Error("O status experimental devolveu outro vínculo.");
    }
    await this.#bestEffortCache(() => this.#writeExperimentEnrollmentHandle(projected));
    return projected;
  }

  async withdrawAuthoringExperimentEnrollment({
    enrollmentRef: enrollmentValue,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    const enrollmentRef = text(enrollmentValue).toLowerCase();
    if (!UUID_PATTERN.test(enrollmentRef)) throw new TypeError("Vínculo experimental inválido.");
    const previous = (await this.#readExperimentEnrollmentHandles())
      .find((entry) => entry.enrollmentRef === enrollmentRef) || null;
    const response = await this.#executeWithReplay("ingressarEmExperimentoInstrucional", {
      operation: "withdraw",
      enrollmentRef,
      requestId: suppliedRequestId || requestId()
    });
    const projected = projectedExperimentEnrollment(response);
    if (projected.enrollmentRef !== enrollmentRef || projected.status !== "withdrawn" ||
        projected.selection !== null) {
      throw new Error("A retirada experimental não confirmou a revogação da seleção.");
    }
    const courseId = previous?.selection?.courseId;
    this.#withdrawnEnrollmentRefs.add(enrollmentRef);
    let tombstoneStored = false;
    try {
      await this.#writeExperimentEnrollmentHandle(projected, { pendingPurgeCourseId: courseId });
      tombstoneStored = true;
    } catch {
      // A resposta corrente permanece retirada em memória e a seleção é purgada abaixo.
    }
    if (courseId && typeof this.#store?.removeOfficialCourseReplica === "function") {
      try {
        await this.#store.removeOfficialCourseReplica(courseId, { removeSelection: true });
        if (tombstoneStored) await this.#writeExperimentEnrollmentHandle(projected);
      } catch {
        // O marcador persistido impede reexposição e agenda nova tentativa ao reler os vínculos.
      }
    }
    return projected;
  }

  async #continuityMutation({
    workspace,
    expectedRevision,
    operation,
    mutationRequestId = requestId(),
    ...argumentsValue
  }) {
    return this.#executeRemote("gerirContinuidadeDaAutoria", {
      requestId: mutationRequestId,
      workspaceId: workspace,
      expectedRevision: revision(expectedRevision),
      operation,
      ...argumentsValue
    });
  }

  async #experimentMutation({
    workspace,
    operation,
    expectedExperimentRevision,
    expectedWorkspaceRevision = null,
    mutationRequestId = requestId(),
    ...argumentsValue
  }) {
    const response = await this.#executeWithReplay("gerirExperimentoInstrucional", {
      operation,
      requestId: mutationRequestId,
      workspaceId: workspace,
      expectedExperimentRevision: nonNegativeRevision(expectedExperimentRevision),
      ...(expectedWorkspaceRevision == null
        ? {}
        : { expectedWorkspaceRevision: revision(expectedWorkspaceRevision) }),
      ...argumentsValue
    });
    if (response?.workspaceId != null && text(response.workspaceId).toLowerCase() !== workspace) {
      throw new Error("O experimento devolveu um recibo de outro workspace.");
    }
    return response;
  }

  async listAuthoringExperiments({
    workspaceId: workspaceValue,
    experimentSetRef = null,
    cursor = null,
    limit = 20,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    const workspace = workspaceId(workspaceValue);
    const normalizedLimit = Number(limit);
    if (!Number.isSafeInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 50) {
      throw new TypeError("Limite da lista experimental inválido.");
    }
    const normalizedExperimentSetRef = experimentSetRef == null
      ? null
      : normalizeVersionedRef(experimentSetRef, "Conjunto de experimentos");
    const paged = cursor != null;
    if (paged && (!text(cursor) || !normalizedExperimentSetRef)) {
      throw new TypeError("Cursor da lista experimental exige o conjunto ancorado.");
    }
    const userId = this.#userId();
    const key = experimentListCacheKey(userId, workspace);
    const readStartedAt = Date.now();
    const canReadRemote = online && globalThis.navigator?.onLine !== false;
    if (!canReadRemote) {
      if (paged) throw new Error("Conecte-se para carregar mais experimentos.");
      const cached = await this.#readExperimentSnapshot(
        key,
        AUTHORING_EXPERIMENT_LIST_CACHE_CONTRACT,
        workspace
      );
      if (!cached) throw new Error("Conecte-se uma vez para consultar os experimentos offline.");
      return cached;
    }
    let response;
    try {
      response = await this.#executeRemote("gerirExperimentoInstrucional", {
        operation: "list",
        workspaceId: workspace,
        limit: normalizedLimit,
        ...(normalizedExperimentSetRef ? { experimentSetRef: normalizedExperimentSetRef } : {}),
        ...(paged ? { cursor: text(cursor) } : {})
      });
    } catch (error) {
      if (!transportFailure(error) || paged) throw error;
      const cached = await this.#readExperimentSnapshot(
        key,
        AUTHORING_EXPERIMENT_LIST_CACHE_CONTRACT,
        workspace
      );
      if (!cached) throw error;
      return cached;
    }
    const source = response?.experiments || response?.result?.experiments || response;
    if (response?.workspaceId != null && text(response.workspaceId).toLowerCase() !== workspace) {
      throw new Error("A lista experimental pertence a outro workspace.");
    }
    if (!Array.isArray(source?.items || source?.experiments)) {
      throw new Error("A lista de experimentos devolveu uma resposta incompleta.");
    }
    const echoedExperimentSetRef = normalizeVersionedRef(
      response?.experimentSetRef ?? source?.experimentSetRef,
      "Conjunto de experimentos"
    );
    if (normalizedExperimentSetRef && !isSameRef(echoedExperimentSetRef, normalizedExperimentSetRef)) {
      throw new Error("O conjunto de experimentos mudou durante a paginação.");
    }
    const workspaceRevision = revision(
      response?.workspaceRevision ?? source?.workspaceRevision ?? response?.revision ?? source?.revision
    );
    if (paged) return { ...response, stale: false, cacheWriteFailed: false };
    let cacheWriteFailed = false;
    let effectiveResponse = response;
    try {
      const written = await this.#writeExperimentSnapshot({
        key,
        contract: AUTHORING_EXPERIMENT_LIST_CACHE_CONTRACT,
        workspace,
        workspaceRevision,
        snapshot: response,
        readStartedAt
      });
      if (written?.snapshot) effectiveResponse = written.snapshot;
      else if (written === undefined) {
        effectiveResponse = await this.#readExperimentSnapshot(
          key,
          AUTHORING_EXPERIMENT_LIST_CACHE_CONTRACT,
          workspace
        ) || response;
      }
    } catch {
      cacheWriteFailed = true;
    }
    return { ...effectiveResponse, stale: false, cacheWriteFailed };
  }

  async loadAuthoringExperiment({
    workspaceId: workspaceValue,
    experimentId: experimentValue,
    section: sectionValue = "overview",
    protocolRevision = null,
    variantSetRef = null,
    variantCursor = null,
    variantLimit = 10,
    differenceSetRef = null,
    differenceRunCursor = null,
    differenceRunLimit = 20,
    differenceRunRef = null,
    differenceCursor = null,
    differenceLimit = 20,
    participantSetRef = null,
    participantCursor = null,
    participantLimit = 20,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    const workspace = workspaceId(workspaceValue);
    const experiment = boundedIdentifier(experimentValue, "Experimento");
    const section = text(sectionValue) || "overview";
    if (!EXPERIMENT_READ_SECTIONS.has(section)) {
      throw new TypeError("Seção experimental inválida.");
    }
    const boundedPageLimit = (value, label, maximum = 20) => {
      const normalized = Number(value);
      if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
        throw new TypeError(`${label} inválido.`);
      }
      return normalized;
    };
    const normalizedProtocolRevision = protocolRevision == null
      ? null
      : revision(protocolRevision);
    const normalizedVariantSetRef = variantSetRef == null
      ? null
      : normalizeVersionedRef(variantSetRef, "Conjunto de variantes");
    const normalizedDifferenceRunRef = differenceRunRef == null
      ? null
      : normalizeVersionedRef(differenceRunRef, "Rodada de diferenças");
    const normalizedDifferenceSetRef = differenceSetRef == null
      ? null
      : normalizeVersionedRef(differenceSetRef, "Conjunto de comparações");
    const normalizedParticipantSetRef = participantSetRef == null
      ? null
      : normalizeVersionedRef(participantSetRef, "Fila de participantes");
    const normalizedVariantLimit = boundedPageLimit(variantLimit, "Limite de variantes", 10);
    const normalizedDifferenceLimit = boundedPageLimit(differenceLimit, "Limite de diferenças");
    const normalizedDifferenceRunLimit = boundedPageLimit(differenceRunLimit, "Limite de comparações");
    const normalizedParticipantLimit = boundedPageLimit(participantLimit, "Limite de participantes");
    if (variantCursor != null && (!text(variantCursor) || !normalizedVariantSetRef)) {
      throw new TypeError("Cursor de variantes exige o conjunto ancorado.");
    }
    if (differenceCursor != null && (!text(differenceCursor) || !normalizedDifferenceRunRef)) {
      throw new TypeError("Cursor de diferenças exige a rodada ancorada.");
    }
    if (differenceRunCursor != null && (!text(differenceRunCursor) || !normalizedDifferenceSetRef)) {
      throw new TypeError("Cursor de comparações exige o conjunto ancorado.");
    }
    if (normalizedDifferenceSetRef && normalizedDifferenceRunRef) {
      throw new TypeError("Escolha a página de comparações ou os hunks de uma rodada.");
    }
    if (participantCursor != null && (!text(participantCursor) || !normalizedParticipantSetRef)) {
      throw new TypeError("Cursor de participantes exige a fila ancorada.");
    }
    if (section !== "protocol" && normalizedProtocolRevision != null) {
      throw new TypeError("A revisão de protocolo exige a seção de protocolo.");
    }
    if (section !== "variants" && (variantSetRef != null || variantCursor != null)) {
      throw new TypeError("A paginação de variantes exige a seção de variantes.");
    }
    if (section !== "differences" && (differenceSetRef != null || differenceRunCursor != null ||
        differenceRunRef != null || differenceCursor != null)) {
      throw new TypeError("A paginação de diferenças exige a seção de diferenças.");
    }
    if (section !== "participants" && (participantSetRef != null || participantCursor != null)) {
      throw new TypeError("A paginação de participantes exige a seção de participantes.");
    }
    const userId = this.#userId();
    const cacheable = section === "overview" || (section === "protocol" && normalizedProtocolRevision == null);
    const key = experimentSectionCacheKey(userId, workspace, experiment, section);
    const readStartedAt = Date.now();
    const canReadRemote = online && globalThis.navigator?.onLine !== false;
    if (!canReadRemote) {
      if (!cacheable) {
        throw new Error("Conecte-se para carregar esta seção progressiva do experimento.");
      }
      const cached = await this.#readExperimentSnapshot(
        key,
        AUTHORING_EXPERIMENT_SECTION_CACHE_CONTRACT,
        workspace,
        experiment
      );
      if (!cached) throw new Error("Conecte-se uma vez para consultar este experimento offline.");
      if (section === "protocol") {
        const overview = await this.#readExperimentSnapshot(
          experimentSectionCacheKey(userId, workspace, experiment, "overview"),
          AUTHORING_EXPERIMENT_SECTION_CACHE_CONTRACT,
          workspace,
          experiment
        );
        const cachedRevision = Number((cached.experiment || cached.result?.experiment)?.experimentRevision);
        const overviewRevision = Number((overview?.experiment || overview?.result?.experiment)?.experimentRevision);
        if (overview && cachedRevision !== overviewRevision) {
          throw new Error("O protocolo offline pertence a outra revisão do experimento.");
        }
      }
      return cached;
    }
    let response;
    try {
      response = await this.#executeRemote("gerirExperimentoInstrucional", {
        operation: "read",
        workspaceId: workspace,
        experimentId: experiment,
        section,
        ...(section === "protocol" && normalizedProtocolRevision != null
          ? { protocolRevision: normalizedProtocolRevision }
          : {}),
        ...(section === "variants" ? {
          variantLimit: normalizedVariantLimit,
          ...(normalizedVariantSetRef ? { variantSetRef: normalizedVariantSetRef } : {}),
          ...(variantCursor == null ? {} : { variantCursor: text(variantCursor) })
        } : {}),
        ...(section === "differences" ? {
          ...(normalizedDifferenceRunRef ? { differenceLimit: normalizedDifferenceLimit } : {
            differenceRunLimit: normalizedDifferenceRunLimit
          }),
          ...(normalizedDifferenceSetRef ? { differenceSetRef: normalizedDifferenceSetRef } : {}),
          ...(differenceRunCursor == null ? {} : { differenceRunCursor: text(differenceRunCursor) }),
          ...(normalizedDifferenceRunRef ? { differenceRunRef: normalizedDifferenceRunRef } : {}),
          ...(differenceCursor == null ? {} : { differenceCursor: text(differenceCursor) })
        } : {}),
        ...(section === "participants" ? {
          participantLimit: normalizedParticipantLimit,
          ...(normalizedParticipantSetRef ? { participantSetRef: normalizedParticipantSetRef } : {}),
          ...(participantCursor == null ? {} : { participantCursor: text(participantCursor) })
        } : {})
      });
    } catch (error) {
      if (!transportFailure(error)) throw error;
      if (!cacheable) throw error;
      const cached = await this.#readExperimentSnapshot(
        key,
        AUTHORING_EXPERIMENT_SECTION_CACHE_CONTRACT,
        workspace,
        experiment
      );
      if (!cached) throw error;
      return cached;
    }
    const result = response?.experiment || response?.result?.experiment;
    if (response?.workspaceId != null && text(response.workspaceId).toLowerCase() !== workspace) {
      throw new Error("O experimento lido pertence a outro workspace.");
    }
    if (!result || boundedIdentifier(result.experimentId || result.id, "Experimento") !== experiment) {
      throw new Error("A leitura experimental devolveu uma identidade incompatível.");
    }
    if (text(result.section) !== section) {
      throw new Error("A leitura experimental devolveu outra seção.");
    }
    const workspaceRevision = revision(
      response?.workspaceRevision ?? result?.workspaceRevision ?? response?.revision
    );
    const experimentRevision = revision(result.experimentRevision ?? result.revision);
    const assertPage = (refValue, requestedRef, label) => {
      const echoedRef = normalizeVersionedRef(refValue, label);
      if (requestedRef && (echoedRef.id !== requestedRef.id || echoedRef.version !== requestedRef.version)) {
        throw new Error(`A página de ${label.toLowerCase()} mudou durante a leitura.`);
      }
      if (!Array.isArray(result.items)) {
        throw new Error(`A página de ${label.toLowerCase()} está incompleta.`);
      }
    };
    if (section === "variants") assertPage(result.variantSetRef, normalizedVariantSetRef, "Variantes");
    if (section === "differences") {
      if (!new Set(["runs", "hunks"]).has(text(result.mode))) {
        throw new Error("A página de diferenças não declarou o modo de leitura.");
      }
      if (text(result.mode) === "hunks") {
        assertPage(result.differenceRunRef, normalizedDifferenceRunRef, "Diferenças");
      } else if (normalizedDifferenceRunRef) {
        throw new Error("A rodada de diferenças não foi ancorada.");
      } else {
        assertPage(result.differenceSetRef, normalizedDifferenceSetRef, "Comparações");
      }
    }
    if (section === "participants") {
      assertPage(result.participantSetRef, normalizedParticipantSetRef, "Participantes");
    }
    if (!cacheable) return { ...response, stale: false, cacheWriteFailed: false };
    const cacheWriteFailed = await this.#bestEffortCache(() => this.#writeExperimentSnapshot({
      key,
      contract: AUTHORING_EXPERIMENT_SECTION_CACHE_CONTRACT,
      workspace,
      experimentId: experiment,
      workspaceRevision,
      experimentRevision,
      snapshot: response,
      readStartedAt
    }));
    return { ...response, stale: false, cacheWriteFailed };
  }

  async loadAuthoringExperimentOptionPage({
    workspaceId: workspaceValue,
    kind,
    optionsSetRef = null,
    cursor = null,
    limit = 50,
    query = "",
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    const workspace = workspaceId(workspaceValue);
    const normalizedKind = text(kind);
    const normalizedOptionsSetRef = optionsSetRef == null
      ? null
      : normalizeVersionedRef(optionsSetRef, "Snapshot das opções experimentais");
    const normalizedLimit = Number(limit);
    const normalizedQuery = text(query);
    if (!EXPERIMENT_OPTION_KINDS.has(normalizedKind)) {
      throw new TypeError("Categoria de opções experimentais inválida.");
    }
    if (!Number.isSafeInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 50) {
      throw new TypeError("Limite de opções experimentais inválido.");
    }
    if (cursor != null && (!text(cursor) || !normalizedOptionsSetRef)) {
      throw new TypeError("Cursor de opções exige o snapshot ancorado.");
    }
    if (normalizedQuery.length > 240) throw new TypeError("Busca de opções muito longa.");
    const response = await this.#executeRemote("gerirExperimentoInstrucional", {
      operation: "list_options",
      workspaceId: workspace,
      kind: normalizedKind,
      limit: normalizedLimit,
      ...(normalizedOptionsSetRef ? { optionsSetRef: normalizedOptionsSetRef } : {}),
      ...(cursor == null ? {} : { cursor: text(cursor) }),
      ...(normalizedQuery ? { query: normalizedQuery } : {})
    });
    if (text(response?.workspaceId).toLowerCase() !== workspace ||
        text(response?.kind) !== normalizedKind || !Array.isArray(response?.items)) {
      throw new Error("A página de opções experimentais devolveu uma resposta incompatível.");
    }
    const echoedOptionsSetRef = normalizeVersionedRef(
      response?.optionsSetRef,
      "Snapshot das opções experimentais"
    );
    if (normalizedOptionsSetRef && !isSameRef(echoedOptionsSetRef, normalizedOptionsSetRef)) {
      throw new Error("O snapshot das opções experimentais mudou durante a paginação.");
    }
    revision(response.workspaceRevision);
    return response;
  }

  async saveAuthoringExperimentProtocol({
    workspaceId: workspaceValue,
    experimentId: experimentValue = null,
    expectedExperimentRevision,
    protocol,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    if (!protocol || typeof protocol !== "object" || Array.isArray(protocol)) {
      throw new TypeError("Protocolo experimental inválido.");
    }
    const workspace = workspaceId(workspaceValue);
    return this.#experimentMutation({
      workspace,
      operation: "save_protocol",
      expectedExperimentRevision,
      mutationRequestId: suppliedRequestId || requestId(),
      ...(experimentValue == null
        ? {}
        : { experimentId: boundedIdentifier(experimentValue, "Experimento") }),
      protocol: structuredClone(protocol)
    });
  }

  validateAuthoringExperiment({
    workspaceId: workspaceValue,
    experimentId: experimentValue,
    expectedExperimentRevision,
    expectedWorkspaceRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    return this.#experimentMutation({
      workspace: workspaceId(workspaceValue),
      operation: "validate",
      experimentId: boundedIdentifier(experimentValue, "Experimento"),
      expectedExperimentRevision,
      expectedWorkspaceRevision,
      mutationRequestId: suppliedRequestId || requestId()
    });
  }

  generateAuthoringExperimentVariants({
    workspaceId: workspaceValue,
    experimentId: experimentValue,
    expectedExperimentRevision,
    expectedWorkspaceRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    return this.#experimentMutation({
      workspace: workspaceId(workspaceValue),
      operation: "generate_variants",
      experimentId: boundedIdentifier(experimentValue, "Experimento"),
      expectedExperimentRevision,
      expectedWorkspaceRevision,
      mutationRequestId: suppliedRequestId || requestId()
    });
  }

  decideAuthoringExperimentDifference({
    workspaceId: workspaceValue,
    experimentId: experimentValue,
    differenceRunRef,
    differenceRef,
    decision,
    note = "",
    participantContinuity = null,
    expectedExperimentRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    const normalizedDecision = text(decision).toLowerCase();
    if (!["correct", "accept", "invalidate"].includes(normalizedDecision)) {
      throw new TypeError("Decisão sobre diferença experimental inválida.");
    }
    const normalizedContinuity = participantContinuity == null ? "" : text(participantContinuity);
    if (normalizedContinuity &&
        (normalizedDecision !== "correct" || normalizedContinuity !== "retain_existing")) {
      throw new TypeError("Continuidade de participantes inválida para esta decisão.");
    }
    const normalizedNote = text(note);
    if (normalizedNote.length > 2000) throw new TypeError("Nota experimental excede o limite.");
    if (["accept", "invalidate"].includes(normalizedDecision) && !normalizedNote) {
      throw new TypeError("Aceitar ou invalidar uma diferença exige justificativa.");
    }
    return this.#experimentMutation({
      workspace: workspaceId(workspaceValue),
      operation: "decide_difference",
      experimentId: boundedIdentifier(experimentValue, "Experimento"),
      differenceRunRef: normalizeVersionedRef(differenceRunRef, "Rodada de diferenças"),
      differenceRef: normalizeVersionedRef(differenceRef, "Diferença"),
      decision: normalizedDecision,
      ...(normalizedContinuity ? { participantContinuity: normalizedContinuity } : {}),
      ...(normalizedNote ? { note: normalizedNote } : {}),
      expectedExperimentRevision,
      mutationRequestId: suppliedRequestId || requestId()
    });
  }

  requestAuthoringExperimentCorrection({
    workspaceId: workspaceValue,
    experimentId: experimentValue,
    variantRevisionRef,
    reason,
    participantContinuity,
    expectedExperimentRevision,
    expectedWorkspaceRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    const normalizedReason = text(reason);
    if (!normalizedReason || normalizedReason.length > 2000) {
      throw new TypeError("A correção exige uma justificativa de até 2.000 caracteres.");
    }
    if (participantContinuity !== "retain_existing") {
      throw new TypeError("Confirme a continuidade das atribuições existentes.");
    }
    return this.#experimentMutation({
      workspace: workspaceId(workspaceValue),
      operation: "request_correction",
      experimentId: boundedIdentifier(experimentValue, "Experimento"),
      variantRevisionRef: normalizeVersionedRef(variantRevisionRef, "Revisão da variante"),
      reason: normalizedReason,
      participantContinuity,
      expectedExperimentRevision,
      expectedWorkspaceRevision,
      mutationRequestId: suppliedRequestId || requestId()
    });
  }

  freezeAuthoringExperiment({
    workspaceId: workspaceValue,
    experimentId: experimentValue,
    variantRevisionRef,
    expectedExperimentRevision,
    expectedWorkspaceRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    return this.#experimentMutation({
      workspace: workspaceId(workspaceValue),
      operation: "freeze",
      experimentId: boundedIdentifier(experimentValue, "Experimento"),
      variantRevisionRef: normalizeVersionedRef(variantRevisionRef, "Revisão da variante"),
      expectedExperimentRevision,
      expectedWorkspaceRevision,
      mutationRequestId: suppliedRequestId || requestId()
    });
  }

  startAuthoringExperimentCollection({
    workspaceId: workspaceValue,
    experimentId: experimentValue,
    expectedExperimentRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    return this.#experimentMutation({
      workspace: workspaceId(workspaceValue),
      operation: "start_collection",
      experimentId: boundedIdentifier(experimentValue, "Experimento"),
      expectedExperimentRevision,
      mutationRequestId: suppliedRequestId || requestId()
    });
  }

  rotateAuthoringExperimentEnrollmentCode({
    workspaceId: workspaceValue,
    experimentId: experimentValue,
    expectedExperimentRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    return this.#experimentMutation({
      workspace: workspaceId(workspaceValue),
      operation: "rotate_enrollment_code",
      experimentId: boundedIdentifier(experimentValue, "Experimento"),
      expectedExperimentRevision,
      mutationRequestId: suppliedRequestId || requestId()
    });
  }

  transitionAuthoringExperimentCollection({
    workspaceId: workspaceValue,
    experimentId: experimentValue,
    transition,
    expectedExperimentRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    const normalizedTransition = text(transition).toLowerCase();
    if (!["pause", "resume", "close", "invalidate"].includes(normalizedTransition)) {
      throw new TypeError("Transição da coleta experimental inválida.");
    }
    return this.#experimentMutation({
      workspace: workspaceId(workspaceValue),
      operation: "transition_collection",
      experimentId: boundedIdentifier(experimentValue, "Experimento"),
      transition: normalizedTransition,
      expectedExperimentRevision,
      mutationRequestId: suppliedRequestId || requestId()
    });
  }

  assignAuthoringExperimentParticipant({
    workspaceId: workspaceValue,
    experimentId: experimentValue,
    enrollmentRef: enrollmentValue,
    conditionRef = null,
    expectedExperimentRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineExperiment(online);
    const enrollmentRef = text(enrollmentValue).toLowerCase();
    if (!UUID_PATTERN.test(enrollmentRef)) throw new TypeError("Ingresso pseudônimo inválido.");
    return this.#experimentMutation({
      workspace: workspaceId(workspaceValue),
      operation: "assign_participant",
      experimentId: boundedIdentifier(experimentValue, "Experimento"),
      enrollmentRef,
      ...(conditionRef == null
        ? {}
        : { conditionRef: normalizeVersionedRef(conditionRef, "Condição experimental") }),
      expectedExperimentRevision,
      mutationRequestId: suppliedRequestId || requestId()
    });
  }

  async #loadWorkspace(workspace, view = "outline") {
    const result = await this.#executeRemote(
      "lerWorkspaceDeAutoria",
      { workspaceId: workspace, view }
    );
    if (text(result?.workspaceId).toLowerCase() !== workspace || result?.view !== view) {
      throw new Error("O workspace devolveu uma resposta incompatível com a leitura solicitada.");
    }
    revision(result.revision);
    return result;
  }

  async #loadResume(workspace) {
    const resume = await this.#loadWorkspace(workspace, "resume");
    if (!resume?.content || !Array.isArray(resume.content.parts)
        || !resume.content.findings || !Array.isArray(resume.content.findings.items)) {
      throw new Error("O andamento do workspace devolveu uma resposta incompleta.");
    }
    return resume;
  }

  #loadAccess(workspace) {
    return this.#executeRemote("gerirWorkspaceEducacional", {
      operation: "read",
      workspaceId: workspace
    });
  }

  async #loadWorkspaceItems() {
    const items = [];
    const seenIds = new Set();
    const seenCursors = new Set();
    let cursor = null;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      const page = await this.#executeRemote(
        "listarWorkspacesDeAutoria",
        { limit: PAGE_LIMIT, ...(cursor || {}) }
      );
      if (!Array.isArray(page?.items)) throw new Error("A lista de workspaces é inválida.");
      for (const item of page.items) {
        const id = workspaceId(item?.workspaceId);
        if (seenIds.has(id)) throw new Error("A lista de workspaces repetiu uma identidade.");
        if (!["planning", "building", "audit_pending", "ready"].includes(item.authoringState)) {
          throw new Error("A lista de workspaces não informou seu andamento canônico.");
        }
        seenIds.add(id);
        items.push({ ...structuredClone(item), workspaceId: id });
      }
      if (page?.hasMore !== true) {
        if (page?.nextCursor != null) throw new Error("A lista devolveu um cursor excedente.");
        return items;
      }
      const next = page.nextCursor || {};
      const key = `${text(next.beforeUpdatedAt)}\u0000${text(next.beforeId).toLowerCase()}`;
      if (!text(next.beforeUpdatedAt) || !UUID_PATTERN.test(text(next.beforeId))
          || seenCursors.has(key)) throw new Error("A lista devolveu um cursor inválido.");
      seenCursors.add(key);
      cursor = { beforeUpdatedAt: text(next.beforeUpdatedAt), beforeId: text(next.beforeId).toLowerCase() };
    }
    throw new Error("A lista de workspaces excedeu o limite seguro.");
  }

  async listAuthoringWorkspaces({ online = globalThis.navigator?.onLine !== false } = {}) {
    const userId = this.#userId();
    const readStartedAt = Date.now();
    let items;
    let stale = !online;
    let cacheWriteFailed = false;
    if (online) {
      try {
        items = await this.#loadWorkspaceItems();
      } catch (error) {
        if (!transportFailure(error)) throw error;
        const cached = await this.#readCache(listCacheKey(userId), WORKSPACE_LIST_CACHE_CONTRACT);
        if (!cached) throw error;
        items = cached.items;
        stale = true;
      }
      if (!stale) {
        cacheWriteFailed = await this.#bestEffortCache(
          () => this.#writeWorkspaceList(items, readStartedAt)
        );
      }
    } else {
      const cached = await this.#readCache(listCacheKey(userId), WORKSPACE_LIST_CACHE_CONTRACT);
      items = cached?.items || [];
    }
    const offlineStore = this.#designStore();
    const projected = await Promise.all(items.map(async (item) => {
      const queue = await offlineStore.readQueue({ workspaceId: item.workspaceId })
        .catch(() => ({ operations: [] }));
      const conflicts = queue.operations.filter((operation) => operation.status === "conflict");
      const pending = queue.operations.filter((operation) => operation.status === "pending");
      return projectAuthoringWorkspaceListItem(item, {
        pendingCount: pending.length,
        hasConflict: conflicts.length > 0
      });
    }));
    return {
      items: projected,
      stale,
      pendingCount: projected.reduce((total, item) => total + item.pendingCount, 0),
      conflictCount: projected.reduce((total, item) => total + item.conflictCount, 0),
      cacheWriteFailed
    };
  }

  async #loadFindingsPage(workspace, cursor = null, limit = FINDING_PAGE_LIMIT) {
    const page = await this.#executeRemote(
      "gerirWorkspaceEducacional",
      {
        operation: "list_observations",
        workspaceId: workspace,
        limit,
        kinds: ["audit_finding"],
        statuses: ACTIVE_FINDING_STATUSES,
        ...(cursor || {})
      }
    );
    if (text(page?.workspaceId).toLowerCase() !== workspace || !Array.isArray(page?.items)) {
      throw new Error("A Auditoria devolveu uma página inválida.");
    }
    return page;
  }

  async #hydrateFindings(workspace, resume) {
    const source = resume.content.findings;
    const activeCount = Number(source?.summary?.activeCount || 0);
    if (source.truncated !== true && source.items.length >= activeCount) return resume;
    const page = await this.#loadFindingsPage(workspace);
    const hydrated = structuredClone(resume);
    hydrated.content.findings = {
      ...hydrated.content.findings,
      items: structuredClone(page.items),
      summary: structuredClone(page.summary || source.summary || null),
      truncated: page.hasMore === true,
      nextCursor: page.nextCursor == null ? null : structuredClone(page.nextCursor)
    };
    return hydrated;
  }

  async #loadConsistentOverview(workspace) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const [outline, initialResume, access] = await Promise.all([
        this.#loadWorkspace(workspace, "outline"),
        this.#loadResume(workspace),
        this.#loadAccess(workspace)
      ]);
      if (Number(outline.revision) !== Number(initialResume.revision)) continue;
      const resume = await this.#hydrateFindings(workspace, initialResume);
      // A página de achados é uma leitura separada. Uma segunda leitura do
      // resume funciona como fence para não persistir mapa N com Auditoria
      // N+1 quando outra aba altera observações durante a hidratação.
      const fence = await this.#loadResume(workspace);
      const hydratedCount = Number(resume.content.findings?.summary?.activeCount || 0);
      const fencedCount = Number(fence.content.findings?.summary?.activeCount || 0);
      if (Number(outline.revision) === Number(resume.revision)
          && Number(outline.revision) === Number(fence.revision)
          && hydratedCount === fencedCount) {
        return { outline, resume, access };
      }
    }
    const error = new Error("O workspace mudou durante a leitura. Abra novamente para atualizar.");
    error.code = "workspace_revision_conflict";
    error.conflict = true;
    throw error;
  }

  async loadAuthoringWorkspaceOverview(workspaceValue, {
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    const workspace = workspaceId(workspaceValue);
    const userId = this.#userId();
    const key = overviewCacheKey(userId, workspace);
    const readStartedAt = Date.now();
    let raw;
    let stale = !online;
    let cacheWriteFailed = false;
    if (online) {
      try {
        raw = await this.#loadConsistentOverview(workspace);
      } catch (error) {
        if (!transportFailure(error)) throw error;
        raw = await this.#readCache(key, WORKSPACE_OVERVIEW_CACHE_CONTRACT);
        if (!raw) throw error;
        stale = true;
      }
      if (!stale) {
        cacheWriteFailed = await this.#bestEffortCache(() => this.#writeWorkspaceSnapshot(
          key,
          WORKSPACE_OVERVIEW_CACHE_CONTRACT,
          workspace,
          raw,
          readStartedAt
        ));
      }
    } else {
      raw = await this.#readCache(key, WORKSPACE_OVERVIEW_CACHE_CONTRACT);
      if (!raw) throw new Error("Conecte-se uma vez para disponibilizar este mapa offline.");
    }
    const offlineStore = this.#designStore();
    const queue = await offlineStore.readQueue({ workspaceId: workspace });
    return {
      ...projectAuthoringWorkspaceOverview({
        outline: raw.outline,
        resume: raw.resume,
        access: raw.access,
        pendingOperations: queue.operations,
        stale
      }),
      cacheWriteFailed
    };
  }

  async listAuthoringFindings({
    workspaceId: workspaceValue,
    cursor = null,
    limit = FINDING_PAGE_LIMIT,
    microsequencePath = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    if (!online) {
      const overview = await this.loadAuthoringWorkspaceOverview(workspaceValue, { online: false });
      const requestedPath = microsequencePath == null
        ? null
        : normalizeMicrosequencePath(microsequencePath);
      const items = overview.findings.filter((finding) => !requestedPath || requestedPath.every(
        (entry, index) => finding.entityPath?.[index] === entry
      ));
      return {
        items,
        total: requestedPath ? items.length : overview.findingsTotal,
        truncated: overview.findingsTruncated,
        nextCursor: null,
        stale: true,
        scopeTotalKnown: requestedPath == null && !overview.findingsTruncated
      };
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > FINDING_PAGE_LIMIT) {
      throw new TypeError("Limite de achados inválido.");
    }
    const workspace = workspaceId(workspaceValue);
    const requestedPath = microsequencePath == null
      ? null
      : normalizeMicrosequencePath(microsequencePath);
    const page = await this.#loadFindingsPage(workspace, cursor, limit);
    const projected = page.items.map((finding) => projectAuthoringFinding(workspace, finding));
    const items = requestedPath
      ? projected.filter((finding) => requestedPath.every(
          (entry, index) => finding.entityPath?.[index] === entry
        ))
      : projected;
    return {
      items,
      total: requestedPath ? items.length : Number(page?.summary?.activeCount || page.items.length),
      nextCursor: page.nextCursor == null ? null : structuredClone(page.nextCursor),
      truncated: page.hasMore === true,
      stale: false,
      scopeTotalKnown: requestedPath == null && page.hasMore !== true
    };
  }

  async loadAuthoringAudit({
    workspaceId: workspaceValue,
    microsequencePath,
    auditRunRef = null,
    auditScope = null,
    cursor = null,
    limit = FINDING_PAGE_LIMIT,
    componentCursor = null,
    componentLimit = 10,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    const workspace = workspaceId(workspaceValue);
    const path = normalizeMicrosequencePath(microsequencePath);
    const reference = auditRunRef == null ? null : normalizeResourceSetRef(auditRunRef);
    const requestedScope = normalizeAuditScope(auditScope) || {
      kind: "microsequence",
      ref: path[3]
    };
    if (reference && auditScope != null) {
      throw new TypeError("Escolha a rodada ou o escopo de auditoria, não ambos.");
    }
    const userId = this.#userId();
    const requestedCacheKey = reference
      ? auditCacheKey(userId, workspace, "run", `${reference.id}@${reference.version}`)
      : auditCacheKey(userId, workspace, requestedScope.kind, requestedScope.ref);
    if (!online) {
      const cached = await this.#readCachedAudit(requestedCacheKey);
      if (cached) return cached;
      const overview = await this.loadAuthoringWorkspaceOverview(workspace, { online: false });
      const part = requestedScope.kind === "part"
        ? overview.parts.find((item) => item.partId === requestedScope.ref)
        : null;
      const item = overview.parts.flatMap((entry) => entry.microsequences).find((microsequence) => (
        path.every((pathEntry, index) => microsequence.entityPath?.[index] === pathEntry)
      ));
      const findings = overview.findings.filter((finding) => {
        const targetPath = finding.entityPath || finding.readerTarget?.entityPath;
        if (part) return part.microsequences.some((microsequence) => (
          Array.isArray(microsequence.entityPath) && microsequence.entityPath.every(
            (entry, index) => targetPath?.[index] === entry
          )
        ));
        return path.every((entry, index) => targetPath?.[index] === entry);
      });
      return projectAuthoringAuditSlice({
        workspaceId: workspace,
        stale: true,
        response: {
          revision: overview.revision,
          result: {
            audit: {
              latestAuditRun: null,
              summary: part?.auditSummary || item?.auditSummary || null,
              findings,
              total: findings.length,
              nextCursor: null,
              truncated: overview.findingsTruncated === true
            }
          }
        }
      });
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > FINDING_PAGE_LIMIT) {
      throw new TypeError("Limite de auditoria inválido.");
    }
    if (!Number.isSafeInteger(componentLimit) || componentLimit < 1 || componentLimit > 10) {
      throw new TypeError("Limite de componentes da auditoria inválido.");
    }
    const readStartedAt = Date.now();
    let response;
    try {
      response = await this.#executeRemote("gerirDesenhoInstrucional", {
        operation: "read_slice",
        workspaceId: workspace,
        microsequencePath: path,
        view: "audit",
        limit,
        componentLimit,
        ...(reference ? { auditRunRef: reference } : auditScope != null ? { auditScope: requestedScope } : {}),
        ...(text(cursor) ? { cursor: text(cursor) } : {}),
        ...(text(componentCursor) ? { componentCursor: text(componentCursor) } : {})
      });
    } catch (error) {
      if (!transportFailure(error)) throw error;
      const cached = await this.#readCachedAudit(requestedCacheKey);
      if (!cached) throw error;
      return cached;
    }
    if (text(response?.workspaceId).toLowerCase() !== workspace || response?.result?.view !== "audit") {
      throw new Error("A Auditoria devolveu uma resposta incompatível com o escopo solicitado.");
    }
    const audit = projectAuthoringAuditSlice({ workspaceId: workspace, response });
    const keys = new Set([requestedCacheKey]);
    if (audit.latestAuditRun?.ref) {
      keys.add(auditCacheKey(
        userId,
        workspace,
        "run",
        `${audit.latestAuditRun.ref.id}@${audit.latestAuditRun.ref.version}`
      ));
    }
    if (!reference && audit.latestAuditRun?.scope?.kind && audit.latestAuditRun.scope.ref) {
      keys.add(auditCacheKey(
        userId,
        workspace,
        audit.latestAuditRun.scope.kind,
        audit.latestAuditRun.scope.ref
      ));
    }
    const cacheWriteFailed = text(cursor) || text(componentCursor)
      ? false
      : (await Promise.all(
          [...keys].map((key) => this.#bestEffortCache(
            () => this.#writeAuditSnapshot(key, workspace, audit, readStartedAt)
          ))
        )).some(Boolean);
    return { ...audit, cacheWriteFailed };
  }

  async decideAuthoringFinding({
    workspaceId: workspaceValue,
    findingId,
    decision,
    expectedRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineMutation(online);
    const workspace = workspaceId(workspaceValue);
    const observationId = text(findingId).toLowerCase();
    if (!UUID_PATTERN.test(observationId)) throw new TypeError("Achado inválido.");
    const normalizedDecision = ({ approve: "approved", approved: "approved", reject: "rejected", rejected: "rejected" })[
      text(decision).toLowerCase()
    ];
    if (!normalizedDecision) throw new TypeError("Decisão de achado inválida.");
    return this.#continuityMutation({
      workspace,
      expectedRevision,
      operation: "decide_finding",
      ...(suppliedRequestId ? { mutationRequestId: suppliedRequestId } : {}),
      observationId,
      decision: normalizedDecision
    });
  }

  async prepareAuthoringFindingRepairs({
    workspaceId: workspaceValue,
    findingIds,
    expectedRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineMutation(online);
    const workspace = workspaceId(workspaceValue);
    const normalizedIds = [...new Set(list(findingIds).map((value) => text(value).toLowerCase()))];
    if (!normalizedIds.length || normalizedIds.length > 50 || normalizedIds.some((id) => !UUID_PATTERN.test(id))) {
      throw new TypeError("Escolha de achados aprovados inválida.");
    }
    const mutationRequestId = suppliedRequestId || requestId();
    return this.#continuityMutation({
      workspace,
      expectedRevision,
      operation: "set_mandate",
      mutationRequestId,
      mandateId: `repair:${mutationRequestId}`,
      kind: "repair_findings",
      findingIds: normalizedIds
    });
  }

  async requestAuthoringReaudit({
    workspaceId: workspaceValue,
    partId = null,
    expectedRevision,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    this.#requireOnlineMutation(online);
    const workspace = workspaceId(workspaceValue);
    const targetPartId = text(partId);
    if (partId != null && (!targetPartId || targetPartId.length > 240)) {
      throw new TypeError("Parte inválida para reauditoria.");
    }
    const mutationRequestId = suppliedRequestId || requestId();
    return this.#continuityMutation({
      workspace,
      expectedRevision,
      operation: "set_mandate",
      mutationRequestId,
      mandateId: `audit:${mutationRequestId}`,
      kind: "audit",
      ...(targetPartId ? { targetPartId } : {})
    });
  }

  async #loadDesignRemoteContext(workspace, path, { cache = true } = {}) {
    const [response, access] = await Promise.all([
      this.#executeRemote("gerirDesenhoInstrucional", {
        operation: "read_slice",
        workspaceId: workspace,
        microsequencePath: path,
        view: "parameters"
      }),
      this.#loadAccess(workspace)
    ]);
    const appCapability = capability(access);
    const slice = designCacheSlice(response, workspace, path, appCapability);
    let cacheWriteFailed = false;
    if (cache) {
      cacheWriteFailed = await this.#bestEffortCache(() => this.#designStore().cacheRemoteSlice({
        workspaceId: workspace,
        microsequenceRef: path[3],
        slice
      }));
    }
    return {
      response,
      access,
      capability: appCapability,
      revision: Number(response.revision),
      canOverride: new Set(["author", "manage"]).has(appCapability),
      lockedDefinitionIds: list(response.result.locks)
        .map((assignment) => text(assignment?.definitionRef?.id)).filter(Boolean),
      slice,
      cacheWriteFailed
    };
  }

  async #submitParameterOperation(operation, context) {
    const payload = operation.action === "set_manual_override"
      ? {
          contract: "DesignParameterAssignment@1",
          modelVersion: "1.0.0",
          id: operation.requestId,
          version: "1.0.0",
          definitionRef: structuredClone(operation.definitionRef),
          scope: structuredClone(operation.scope),
          mode: "manual_override",
          value: structuredClone(operation.assignment.value),
          authority: { kind: "author", actorRef: operation.userId, locked: false },
          rationale: "Ajuste estruturado feito pelo autor no aplicativo.",
          provenanceRefs: [`app-request:${operation.requestId}`]
        }
      : null;
    let assignmentRef = operation.assignmentRef;
    if (operation.action === "restore_auto" && !assignmentRef) {
      const current = list(context?.slice?.state?.assignments).find((assignment) => (
        assignment?.mode === "manual_override"
        && assignment?.scope?.kind === operation.scope.kind
        && assignment?.scope?.ref === operation.scope.ref
        && isSameRef(assignment?.definitionRef, operation.definitionRef)
      ));
      assignmentRef = current ? { id: text(current.id), version: text(current.version) } : null;
      if (!assignmentRef && Number(context?.revision) > operation.expectedRevision) {
        return { accepted: true, revision: Number(context.revision) };
      }
      if (!assignmentRef) {
        const error = new Error("O parâmetro já não possui override manual na revisão corrente.");
        error.code = "workspace_revision_conflict";
        error.conflict = true;
        throw error;
      }
    }
    const mutation = await this.#executeRemote(
      "gerirDesenhoInstrucional",
      {
        operation: operation.action === "set_manual_override" ? "set_parameter" : "remove_parameter",
        workspaceId: operation.workspaceId,
        requestId: operation.requestId,
        expectedRevision: operation.expectedRevision,
        microsequencePath: context.slice.scopePath.slice(1).map(({ ref }) => ref),
        payloadJson: JSON.stringify(payload || {
          assignmentRef,
          definitionRef: operation.definitionRef,
          rationale: "Restaurar o valor automático ou herdado no aplicativo.",
          provenanceRefs: [`app-request:${operation.requestId}`]
        })
      }
    );
    const mutationRevision = revision(mutation?.revision);
    const resolution = await this.#executeRemote(
      "gerirDesenhoInstrucional",
      {
        operation: "resolve_effective",
        workspaceId: operation.workspaceId,
        requestId: derivedRequestId(operation.requestId, "resolve"),
        expectedRevision: mutationRevision,
        microsequencePath: context.slice.scopePath.slice(1).map(({ ref }) => ref),
        payloadJson: "{}"
      }
    );
    return {
      accepted: true,
      revision: revision(resolution?.revision),
      assignmentRef: mutation?.result?.assignmentRef || assignmentRef || null,
      resolution: structuredClone(resolution?.result || null)
    };
  }

  #synchronizeDesign(workspace, path) {
    return this.#designStore().synchronize({
      workspaceId: workspace,
      microsequenceRef: path[3],
      loadRemoteContext: () => this.#loadDesignRemoteContext(workspace, path),
      submit: (operation, context) => this.#submitParameterOperation(operation, context)
    });
  }

  async loadAuthoringDesign({
    workspaceId: workspaceValue,
    microsequencePath,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    const workspace = workspaceId(workspaceValue);
    const path = normalizeMicrosequencePath(microsequencePath);
    const offlineStore = this.#designStore();
    let cached;
    let stale = !online;
    let cacheWriteFailed = false;
    if (online) {
      try {
        const queueBefore = await offlineStore.readQueue({ workspaceId: workspace });
        if (queueBefore.operations.some((operation) => (
          operation.microsequenceRef === path[3] && operation.status === "pending"
        ))) await this.#synchronizeDesign(workspace, path);
        const remote = await this.#loadDesignRemoteContext(workspace, path);
        cached = remote.slice;
        cacheWriteFailed = remote.cacheWriteFailed;
      } catch (error) {
        if (!transportFailure(error)) throw error;
        cached = await offlineStore.readRemoteSlice({
          workspaceId: workspace,
          microsequenceRef: path[3]
        });
        if (!cached) throw error;
        stale = true;
      }
    } else {
      cached = await offlineStore.readRemoteSlice({
        workspaceId: workspace,
        microsequenceRef: path[3]
      });
      if (!cached) throw new Error("Conecte-se uma vez para consultar este desenho offline.");
    }
    const queue = await offlineStore.readQueue({ workspaceId: workspace });
    return {
      ...projectAuthoringDesignSlice({
        slice: cached,
        pendingOperations: queue.operations.filter((operation) => operation.microsequenceRef === path[3]),
        capability: text(cached?.state?.appCapability) || "read",
        stale
      }),
      cacheWriteFailed
    };
  }

  async setAuthoringParameter({
    workspaceId: workspaceValue,
    microsequencePath,
    parameterKey,
    value,
    expectedRevision = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    const workspace = workspaceId(workspaceValue);
    const path = normalizeMicrosequencePath(microsequencePath);
    const design = await this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online });
    const parameter = design.parameters.find((entry) => entry.parameterKey === parameterKey);
    if (!parameter) throw new TypeError("Parâmetro não disponível nesta microssequência.");
    if (parameter.locked) {
      const error = new Error("O parâmetro está bloqueado pela condição de pesquisa.");
      error.code = "research_lock_conflict";
      throw error;
    }
    if (!design.capabilities.design || parameter.conflict) {
      const error = new Error(parameter.conflict
        ? "Resolva o conflito deste parâmetro antes de alterá-lo."
        : "Sua autorização atual não permite alterar este parâmetro.");
      error.code = parameter.conflict ? "workspace_revision_conflict" : "design_override_forbidden";
      error.conflict = parameter.conflict;
      throw error;
    }
    const expected = expectedRevision == null ? design.revision : Number(expectedRevision);
    if (expected !== design.revision) {
      const error = new Error("O workspace mudou. Releia o desenho antes de salvar.");
      error.code = "workspace_revision_conflict";
      error.conflict = true;
      throw error;
    }
    await this.#designStore().queueManualOverride({
      requestId: requestId(),
      action: "set_manual_override",
      workspaceId: workspace,
      microsequenceRef: path[3],
      definitionRef: parameter.definitionRef,
      scope: { kind: "microsequence", ref: path[3] },
      value: normalizeParameterValue(value, parameter.control?.kind),
      expectedRevision: expected,
      observedCapability: "author",
      observedResearchLock: false
    });
    if (online) await this.#synchronizeDesign(workspace, path);
    return this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online });
  }

  async restoreAuthoringParameterAuto({
    workspaceId: workspaceValue,
    microsequencePath,
    parameterKey,
    expectedRevision = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    const workspace = workspaceId(workspaceValue);
    const path = normalizeMicrosequencePath(microsequencePath);
    let design;
    try {
      design = await this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online: false });
    } catch {
      design = await this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online });
    }
    let parameter = design.parameters.find((entry) => entry.parameterKey === parameterKey);
    if (!parameter) throw new TypeError("Parâmetro não disponível nesta microssequência.");
    if (parameter.locked || !design.capabilities.design) {
      const error = new Error(parameter.locked
        ? "O parâmetro está bloqueado pela condição de pesquisa."
        : "Sua autorização atual não permite alterar este parâmetro.");
      error.code = parameter.locked ? "research_lock_conflict" : "design_override_forbidden";
      throw error;
    }
    const cancelled = await this.#designStore().cancelPendingOverrideForSlot({
      workspaceId: workspace,
      microsequenceRef: path[3],
      definitionRef: parameter.definitionRef,
      scope: { kind: "microsequence", ref: path[3] }
    });
    if (!online && cancelled.cancelled > 0
        && !parameter.assignmentRef && ["auto", "inherited"].includes(parameter.origin)) {
      return this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online });
    }
    if (online) {
      design = await this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online });
      parameter = design.parameters.find((entry) => entry.parameterKey === parameterKey);
      if (!parameter) throw new TypeError("Parâmetro não disponível nesta microssequência.");
    }
    const queue = await this.#designStore().readQueue({ workspaceId: workspace });
    const retainedSet = queue.operations.some((operation) => (
      operation.microsequenceRef === path[3]
      && operation.action === "set_manual_override"
      && isSameRef(operation.definitionRef, parameter.definitionRef)
    ));
    if (!parameter.assignmentRef && ["auto", "inherited"].includes(parameter.origin)
        && !retainedSet) return design;
    if (parameter.locked || !design.capabilities.design || parameter.conflict) {
      const error = new Error(parameter.locked
        ? "O parâmetro foi bloqueado pela condição de pesquisa."
        : parameter.conflict
          ? "Resolva o conflito deste parâmetro antes de restaurar Auto."
          : "Sua autorização atual não permite restaurar Auto.");
      error.code = parameter.locked
        ? "research_lock_conflict"
        : parameter.conflict ? "workspace_revision_conflict" : "design_override_forbidden";
      error.conflict = parameter.conflict === true;
      throw error;
    }
    const expected = expectedRevision == null ? design.revision : Number(expectedRevision);
    if (expected !== design.revision) {
      const error = new Error("O workspace mudou. Releia o desenho antes de salvar.");
      error.code = "workspace_revision_conflict";
      error.conflict = true;
      throw error;
    }
    await this.#designStore().queueManualOverride({
      requestId: requestId(),
      action: "restore_auto",
      workspaceId: workspace,
      microsequenceRef: path[3],
      definitionRef: parameter.definitionRef,
      scope: { kind: "microsequence", ref: path[3] },
      assignmentRef: parameter.assignmentRef,
      expectedRevision: expected,
      observedCapability: "author",
      observedResearchLock: false
    });
    if (online) await this.#synchronizeDesign(workspace, path);
    return this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online });
  }

  async retryAuthoringParameterChange({
    workspaceId: workspaceValue,
    microsequencePath,
    requestId: operationRequestId,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    const workspace = workspaceId(workspaceValue);
    const path = normalizeMicrosequencePath(microsequencePath);
    const design = await this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online });
    const queue = await this.#designStore().readQueue({ workspaceId: workspace });
    const operation = queue.operations.find((entry) => entry.requestId === operationRequestId);
    if (!operation) throw new TypeError("Alteração em conflito não encontrada.");
    const parameter = design.parameters.find((entry) => isSameRef(entry.definitionRef, operation.definitionRef));
    await this.#designStore().retryConflict({
      workspaceId: workspace,
      requestId: operationRequestId,
      expectedRevision: design.revision,
      observedCapability: design.capabilities.design ? "author" : "read",
      observedResearchLock: parameter?.locked === true
    });
    if (online) await this.#synchronizeDesign(workspace, path);
    return this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online });
  }

  async discardAuthoringParameterChange({
    workspaceId: workspaceValue,
    microsequencePath,
    requestId: operationRequestId,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    const workspace = workspaceId(workspaceValue);
    const path = normalizeMicrosequencePath(microsequencePath);
    await this.#designStore().discardOperation({ workspaceId: workspace, requestId: operationRequestId });
    return this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online });
  }

  async resolveAuthoringFindingTarget({ workspaceId: workspaceValue, overview = null, findingId } = {}) {
    const current = overview || await this.loadAuthoringWorkspaceOverview(workspaceValue);
    return resolveProjectedFindingTarget(current, findingId);
  }

  async getPendingAuthoringChangeSummary() {
    const offlineStore = this.#designStore();
    const workspaces = await offlineStore.listQueuedWorkspaces();
    return {
      pendingCount: workspaces.reduce((total, item) => total + item.pendingCount, 0),
      conflictCount: workspaces.reduce((total, item) => total + item.conflictCount, 0),
      workspaces
    };
  }

  async synchronizePendingAuthoringChanges({ online = true, limit = 50 } = {}) {
    if (!online || globalThis.navigator?.onLine === false) {
      const remaining = await this.getPendingAuthoringChangeSummary();
      return {
        outcomes: [],
        synchronized: 0,
        conflicts: 0,
        pending: 0,
        pendingCount: remaining.pendingCount,
        conflictCount: remaining.conflictCount,
        truncated: false,
        offline: true
      };
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new TypeError("Limite de sincronização inválido.");
    }
    const offlineStore = this.#designStore();
    const queuedWorkspaces = await offlineStore.listQueuedWorkspaces();
    const targets = [];
    for (const item of queuedWorkspaces) {
      const queue = await offlineStore.readQueue({ workspaceId: item.workspaceId });
      for (const operation of queue.operations) {
        if (operation.status !== "pending") continue;
        const key = `${item.workspaceId}\u0000${operation.microsequenceRef}`;
        if (!targets.some((target) => target.key === key)) {
          targets.push({ key, workspaceId: item.workspaceId, microsequenceRef: operation.microsequenceRef });
        }
        if (targets.length >= limit) break;
      }
      if (targets.length >= limit) break;
    }
    const outcomes = [];
    for (const target of targets) {
      const cached = await offlineStore.readRemoteSlice(target);
      const path = list(cached?.scopePath).slice(1).map(({ ref }) => text(ref));
      if (path.length !== 4 || path.some((entry) => !entry)) {
        outcomes.push({ ...target, status: "pending", message: "Caminho offline indisponível." });
        continue;
      }
      const result = await this.#synchronizeDesign(target.workspaceId, path);
      const conflict = result.some((entry) => entry?.status === "conflict");
      const pending = result.some((entry) => entry?.status === "pending");
      outcomes.push({
        workspaceId: target.workspaceId,
        microsequencePath: path,
        status: conflict ? "conflict" : pending ? "pending" : "synchronized"
      });
    }
    const remaining = await this.getPendingAuthoringChangeSummary();
    return {
      outcomes,
      synchronized: outcomes.filter(({ status }) => status === "synchronized").length,
      conflicts: outcomes.filter(({ status }) => status === "conflict").length,
      pending: outcomes.filter(({ status }) => status === "pending").length,
      pendingCount: remaining.pendingCount,
      conflictCount: remaining.conflictCount,
      truncated: targets.length >= limit
    };
  }

  async #readCompleteResourceSet(workspace, path, resourceSetRef) {
    const normalizedRef = normalizeResourceSetRef(resourceSetRef);
    const cacheKey = `${workspace}:${refKey(normalizedRef)}`;
    const cached = this.#resourceSetCache.get(cacheKey);
    if (cached) return structuredClone(cached);
    let cursor = null;
    let metadata = null;
    let facets = null;
    let constraints = null;
    const packages = [];
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      const response = await this.#executeRemote(
        "gerirDesenhoInstrucional",
        {
          operation: "read_slice",
          workspaceId: workspace,
          microsequencePath: path,
          view: "resource_set",
          resourceSetRef: normalizedRef,
          ...(cursor == null ? {} : { cursor }),
          limit: 100
        }
      );
      const value = response?.result?.resourceSet;
      if (response?.result?.view !== "resource_set" || !value || !Array.isArray(value.packages)) {
        throw new Error("O conjunto de Resources devolveu uma página inválida.");
      }
      if (!isSameRef(value.metadata?.ref, normalizedRef)) {
        throw new Error("O conjunto de Resources mudou durante a paginação.");
      }
      metadata ||= structuredClone(value.metadata);
      facets ||= structuredClone(value.facets);
      constraints ||= structuredClone(value.constraints);
      packages.push(...value.packages.map((entry) => ({
        packageId: text(entry?.packageId), version: text(entry?.version)
      })));
      if (value.nextCursor == null) {
        if (packages.length !== Number(value.total)) {
          throw new Error("O conjunto de Resources terminou com contagem divergente.");
        }
        const complete = { metadata, facets, constraints, packages };
        this.#resourceSetCache.set(cacheKey, structuredClone(complete));
        return complete;
      }
      cursor = text(value.nextCursor);
      if (!cursor) throw new Error("O conjunto de Resources devolveu cursor inválido.");
    }
    throw new Error("O conjunto de Resources excedeu o limite seguro.");
  }

  async loadAuthoringResourceSetPage({
    workspaceId: workspaceValue,
    microsequencePath,
    resourceSetRef = null,
    selectedSetKey = "",
    cursor = null,
    limit = 40,
    query = "",
    facets = {},
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    if (!online) {
      const error = new Error("Conecte-se para consultar ou alterar a disponibilidade de Resources.");
      error.code = "resource_edit_requires_connection";
      throw error;
    }
    const workspace = workspaceId(workspaceValue);
    const path = normalizeMicrosequencePath(microsequencePath);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new TypeError("Limite de Resources inválido.");
    }
    const [design, outline] = await Promise.all([
      this.loadAuthoringDesign({ workspaceId: workspace, microsequencePath: path, online: true }),
      this.#loadWorkspace(workspace, "outline")
    ]);
    const rawSets = list(design?.resources?.sets || design?.resources?.effectiveSets
      || design?.resources?.items);
    const scopeLabel = (scope) => {
      if (scope?.kind === "course" && scope.ref === path[0]) return "Este curso";
      if (scope?.kind === "module" && scope.ref === path[1]) return "Este módulo";
      if (scope?.kind === "lesson" && scope.ref === path[2]) return "Esta lição";
      if (scope?.kind === "microsequence" && scope.ref === path[3]) {
        return "Esta microssequência";
      }
      if (scope?.kind === "workspace") return "Todo o workspace";
      return "Disponibilidade herdada";
    };
    const labelCounts = new Map();
    const setChoices = rawSets.map((set) => {
      const baseLabel = scopeLabel(set.scope);
      const occurrence = (labelCounts.get(baseLabel) || 0) + 1;
      labelCounts.set(baseLabel, occurrence);
      const count = Number(set.packageCount) || 0;
      return {
        key: refKey(set.ref),
        label: `${baseLabel}${occurrence > 1 ? ` · opção ${occurrence}` : ""}`
          + ` · ${count} ${count === 1 ? "Resource" : "Resources"}`,
        ref: structuredClone(set.ref),
        scope: structuredClone(set.scope),
        selected: false
      };
    });
    let chosenRef = resourceSetRef;
    if (!chosenRef && selectedSetKey) {
      chosenRef = setChoices.find((choice) => choice.key === selectedSetKey)?.ref || null;
    }
    if (!chosenRef && setChoices.length === 1) chosenRef = setChoices[0].ref;
    if (chosenRef) {
      chosenRef = normalizeResourceSetRef(chosenRef);
      if (!setChoices.some((choice) => isSameRef(choice.ref, chosenRef))) {
        throw new Error("O conjunto escolhido não pertence ao desenho efetivo corrente.");
      }
      setChoices.forEach((choice) => { choice.selected = isSameRef(choice.ref, chosenRef); });
    }
    const requiresSetChoice = setChoices.length > 1 && !chosenRef;
    const parameter = design.parameters.find((entry) => entry.parameterKey === "available_resource_set_refs");
    const current = chosenRef
      ? await this.#readCompleteResourceSet(workspace, path, chosenRef)
      : null;
    const catalogVersion = current?.metadata?.resolvedCatalogVersion || RESOURCE_CATALOG.catalogVersion;
    const catalogCompatible = catalogVersion === RESOURCE_CATALOG.catalogVersion;
    const selectedKeys = current?.packages?.map(packageKey) || [];
    const selected = new Set(selectedKeys);
    const explore = RESOURCE_CATALOG.explore();
    const normalizedQuery = normalizedSearchText(query);
    const facetFields = {
      families: "familyIds",
      disciplines: "disciplineIds",
      structures: "structureIds",
      cognitiveOperations: "operationIds",
      practiceModalities: "practiceModeIds"
    };
    const profiles = profileList().filter((profile) => {
      if (normalizedQuery && !normalizedSearchText([
        profile.label, profile.purpose, ...profile.knowledgeObjects
      ].join(" ")).includes(normalizedQuery)) return false;
      return Object.entries(facetFields).every(([key, field]) => {
        const requested = list(facets?.[key]).map(text).filter(Boolean);
        return !requested.length || requested.some((value) => list(profile[field]).includes(value));
      });
    });
    const offset = cursor == null || cursor === "" ? 0 : Number(cursor);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > profiles.length) {
      throw new TypeError("Cursor de Resources inválido.");
    }
    const page = profiles.slice(offset, offset + limit);
    const nextCursor = offset + page.length < profiles.length ? String(offset + page.length) : null;
    return {
      revision: design.revision,
      summary: requiresSetChoice
        ? "Escolha qual conjunto deseja editar"
        : chosenRef ? `${selectedKeys.length} Resources disponíveis` : "Auto · catálogo completo",
      items: page.map((profile) => ({
        key: packageKey(profile),
        label: profile.label,
        familyLabel: RESOURCE_CATALOG.families.find(({ id }) => id === profile.primaryFamilyId)?.label || "",
        selected: selected.has(packageKey(profile))
      })),
      selectedKeys,
      selectedCount: selectedKeys.length,
      selectionComplete: !requiresSetChoice && catalogCompatible,
      nextCursor,
      total: profiles.length,
      facets: { families: explore.families, ...explore.facets },
      setChoices,
      requiresSetChoice,
      selectedSetKey: chosenRef ? refKey(chosenRef) : "",
      resourceSetRef: chosenRef ? structuredClone(chosenRef) : null,
      resourceScopes: scopeChoices(outline, path),
      editable: design.resources?.editable === true && parameter?.locked !== true
        && !design.stale && catalogCompatible && !requiresSetChoice,
      limitation: !catalogCompatible
        ? "O catálogo deste conjunto difere da versão instalada; releia após atualizar."
        : requiresSetChoice ? "Conjuntos efetivos diferentes não são unidos automaticamente." : ""
    };
  }

  async #executeWithReplay(tool, args) {
    try {
      return await this.#executeRemote(tool, args);
    } catch (error) {
      if (!transportFailure(error)) throw error;
      return this.#executeRemote(tool, args);
    }
  }

  #assertResourceMutationContext(context, definitionRef, {
    resourceScope = null,
    resourceSetRef = null,
    requireAssignment = false
  } = {}) {
    const result = context?.response?.result || {};
    const definition = list(result?.parameterDefinitions?.relevant).find((entry) => (
      isSameRef(entry, definitionRef)
    ));
    const locked = list(result?.locks).some((entry) => isSameRef(entry?.definitionRef, definitionRef));
    if (!definition) {
      const error = new Error("A definição de disponibilidade mudou; releia o desenho antes de continuar.");
      error.code = "resource_parameter_contract_changed";
      error.conflict = true;
      throw error;
    }
    if (!context.canOverride || locked) {
      const error = new Error(locked
        ? "A disponibilidade de Resources foi bloqueada pela condição de pesquisa."
        : "Sua autorização atual já não permite alterar os Resources.");
      error.code = locked ? "research_lock_conflict" : "design_override_forbidden";
      error.conflict = locked;
      throw error;
    }
    if (requireAssignment) {
      const expectedValue = refKey(resourceSetRef);
      const assignment = list(result?.assignments).find((entry) => (
        isSameRef(entry?.definitionRef, definitionRef)
        && entry?.scope?.kind === resourceScope?.kind
        && text(entry?.scope?.ref) === text(resourceScope?.ref)
        && entry?.mode === "manual_override"
        && list(entry?.value?.values).map(text).includes(expectedValue)
      ));
      if (!assignment) {
        const error = new Error(
          "A atribuição de Resources mudou em outra sessão; releia antes de concluir."
        );
        error.code = "resource_assignment_changed";
        error.conflict = true;
        error.partialState = "assignment_superseded_before_resolution";
        throw error;
      }
    }
    return revision(context.revision);
  }

  async #saveResourceSelectionForTarget({
    workspace,
    path,
    scopeKind,
    profiles,
    sourceSet,
    baseRequestId,
    targetIndex,
    expectedRevision = null
  }) {
    const design = await this.loadAuthoringDesign({
      workspaceId: workspace,
      microsequencePath: path,
      online: true
    });
    if (expectedRevision != null && Number(expectedRevision) !== design.revision) {
      const error = new Error("O workspace mudou. Releia os Resources antes de salvar.");
      error.code = "workspace_revision_conflict";
      error.conflict = true;
      throw error;
    }
    const parameter = design.parameters.find((entry) => entry.parameterKey === "available_resource_set_refs");
    if (!parameter || parameter.locked || design.resources?.editable !== true) {
      const error = new Error(parameter?.locked
        ? "A disponibilidade de Resources está bloqueada pela condição de pesquisa."
        : "Sua autorização atual não permite alterar os Resources.");
      error.code = parameter?.locked ? "research_lock_conflict" : "design_override_forbidden";
      throw error;
    }
    const setRequestId = derivedRequestId(baseRequestId, `${targetIndex}:set`);
    const assignmentRequestId = derivedRequestId(baseRequestId, `${targetIndex}:assignment`);
    const resolveRequestId = derivedRequestId(baseRequestId, `${targetIndex}:resolve`);
    const resourceScope = scopeForPath(scopeKind, path);
    const resourceSet = {
      contract: "ResourceSet@1",
      modelVersion: "1.0.0",
      id: `app-resource-set-${setRequestId}`,
      version: "1.0.0",
      scope: resourceScope,
      packages: profiles.map(({ packageId, version }) => ({ packageId, version })),
      resolvedCatalogVersion: RESOURCE_CATALOG.catalogVersion,
      facetBasis: facetBasis(profiles),
      selectionConstraints: structuredClone(sourceSet?.constraints || defaultConstraints()),
      provenanceRefs: [`app-request:${baseRequestId}`]
    };
    const saved = await this.#executeWithReplay("gerirDesenhoInstrucional", {
      operation: "save_resource_set",
      workspaceId: workspace,
      requestId: setRequestId,
      expectedRevision: design.revision,
      microsequencePath: path,
      payloadJson: JSON.stringify(resourceSet)
    });
    const resourceSetRef = normalizeResourceSetRef(saved?.result?.resourceSetRef);
    let assignmentContext;
    try {
      assignmentContext = await this.#loadDesignRemoteContext(workspace, path);
      this.#assertResourceMutationContext(assignmentContext, parameter.definitionRef);
    } catch (error) {
      error.resourceSetRef = resourceSetRef;
      error.orphanedResourceSet = true;
      throw error;
    }
    const assignment = {
      contract: "DesignParameterAssignment@1",
      modelVersion: "1.0.0",
      id: assignmentRequestId,
      version: "1.0.0",
      definitionRef: structuredClone(parameter.definitionRef),
      scope: resourceScope,
      mode: "manual_override",
      value: { kind: "set", values: [refKey(resourceSetRef)] },
      authority: { kind: "author", actorRef: this.#userId(), locked: false },
      rationale: "Disponibilidade de Resources ajustada no aplicativo.",
      provenanceRefs: [`app-request:${baseRequestId}`]
    };
    try {
      await this.#executeWithReplay("gerirDesenhoInstrucional", {
        operation: "set_parameter",
        workspaceId: workspace,
        requestId: assignmentRequestId,
        expectedRevision: revision(assignmentContext.revision),
        microsequencePath: path,
        payloadJson: JSON.stringify(assignment)
      });
    } catch (error) {
      error.resourceSetRef = resourceSetRef;
      error.orphanedResourceSet = true;
      throw error;
    }
    let resolutionContext;
    try {
      resolutionContext = await this.#loadDesignRemoteContext(workspace, path);
      this.#assertResourceMutationContext(resolutionContext, parameter.definitionRef, {
        resourceScope,
        resourceSetRef,
        requireAssignment: true
      });
    } catch (error) {
      error.resourceSetRef = resourceSetRef;
      error.partialState ||= "assignment_saved_resolution_pending";
      throw error;
    }
    let resolved;
    try {
      resolved = await this.#executeWithReplay("gerirDesenhoInstrucional", {
        operation: "resolve_effective",
        workspaceId: workspace,
        requestId: resolveRequestId,
        expectedRevision: revision(resolutionContext.revision),
        microsequencePath: path,
        payloadJson: "{}"
      });
    } catch (error) {
      error.resourceSetRef = resourceSetRef;
      error.partialState = "assignment_saved_resolution_pending";
      throw error;
    }
    if (resolved?.result?.status === "conflict") {
      const error = new Error("O conjunto foi atribuído, mas a resolução encontrou um conflito.");
      error.code = "resource_set_resolution_conflict";
      error.conflict = true;
      error.resourceSetRef = resourceSetRef;
      error.partialState = "assignment_saved_resolution_conflict";
      throw error;
    }
    const reread = await this.#loadDesignRemoteContext(workspace, path);
    if (!list(reread.response?.result?.effectiveResourceSets)
      .some((set) => isSameRef(set.ref, resourceSetRef))) {
      const error = new Error("A releitura não confirmou o novo conjunto de Resources.");
      error.code = "resource_set_confirmation_missing";
      throw error;
    }
    return { status: "succeeded", revision: revision(resolved.revision), resourceSetRef };
  }

  async saveAuthoringResourceSetSelection({
    workspaceId: workspaceValue,
    microsequencePath,
    selectedKeys,
    selectionComplete = false,
    scope = null,
    resourceSetRef = null,
    selectedSetKey = "",
    expectedRevision = null,
    requestId: suppliedRequestId = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    if (!online) {
      const error = new Error("A alteração de Resources exige conexão para validar catálogo e locks.");
      error.code = "resource_edit_requires_connection";
      throw error;
    }
    if (selectionComplete !== true) {
      throw new Error("Carregue a seleção completa antes de salvar; nenhum item oculto será removido.");
    }
    const baseRequestId = suppliedRequestId || requestId();
    if (!UUID_PATTERN.test(text(baseRequestId))) throw new TypeError("Request id inválido.");
    const workspace = workspaceId(workspaceValue);
    const currentPath = normalizeMicrosequencePath(microsequencePath);
    const profiles = selectedProfiles(selectedKeys);
    if (!profiles.length) {
      const error = new Error("Mantenha ao menos uma representação disponível.");
      error.code = "resource_set_no_adequate_representation";
      throw error;
    }
    const normalizedScope = scope || { kind: "microsequence", entityPath: currentPath };
    const kind = text(normalizedScope.kind);
    let targetPaths;
    if (kind === "microsequence_set") {
      targetPaths = list(normalizedScope.microsequencePaths || normalizedScope.entityPaths)
        .map(normalizeMicrosequencePath);
      if (!targetPaths.length) throw new TypeError("Escolha ao menos uma microssequência.");
    } else if (kind === "microsequence") {
      targetPaths = [normalizeMicrosequencePath(normalizedScope.entityPath || currentPath)];
    } else if (["lesson", "course"].includes(kind)) {
      const selectedPath = normalizeEntityPath(normalizedScope.entityPath || currentPath);
      const expectedLength = kind === "course" ? 1 : 3;
      if (selectedPath.length !== expectedLength || !selectedPath.every(
        (entry, index) => entry === currentPath[index]
      )) {
        throw new TypeError("O escopo escolhido não contém a microssequência corrente.");
      }
      targetPaths = [currentPath];
    } else {
      throw new TypeError("Escopo de Resources inválido.");
    }
    const currentOutline = await this.#loadWorkspace(workspace, "outline");
    const allowedTargets = new Set(
      flattenOutlineMicrosequences(currentOutline).map(({ entityPath }) => entityPath.join("\u0000"))
    );
    if (targetPaths.some((path) => !allowedTargets.has(path.join("\u0000")))) {
      throw new TypeError("Uma microssequência escolhida já não pertence ao workspace.");
    }
    const chosenRef = resourceSetRef || (selectedSetKey
      ? (() => {
          const at = selectedSetKey.lastIndexOf("@");
          return at > 0
            ? { id: selectedSetKey.slice(0, at), version: selectedSetKey.slice(at + 1) }
            : null;
        })()
      : null);
    const sourceSet = chosenRef
      ? await this.#readCompleteResourceSet(workspace, currentPath, chosenRef)
      : null;
    if (sourceSet?.metadata?.resolvedCatalogVersion
        && sourceSet.metadata.resolvedCatalogVersion !== RESOURCE_CATALOG.catalogVersion) {
      const error = new Error("O catálogo mudou; releia a seleção antes de salvar.");
      error.code = "resource_catalog_version_stale";
      error.conflict = true;
      throw error;
    }
    const outcomes = [];
    for (let index = 0; index < targetPaths.length; index += 1) {
      const path = targetPaths[index];
      try {
        const outcome = await this.#saveResourceSelectionForTarget({
          workspace,
          path,
          scopeKind: kind === "microsequence_set" ? "microsequence" : kind,
          profiles,
          sourceSet,
          baseRequestId,
          targetIndex: index,
          expectedRevision: index === 0 && !suppliedRequestId ? expectedRevision : null
        });
        outcomes.push({ entityPath: path, ...outcome });
      } catch (error) {
        outcomes.push({
          entityPath: path,
          status: error?.conflict === true || text(error?.code).includes("conflict")
            ? "conflict" : "failed",
          code: text(error?.code),
          message: error instanceof Error ? error.message : "Falha ao aplicar o conjunto.",
          ...(error?.resourceSetRef ? { resourceSetRef: error.resourceSetRef } : {}),
          ...(error?.orphanedResourceSet ? { orphanedResourceSet: true } : {}),
          ...(error?.partialState ? { partialState: error.partialState } : {})
        });
      }
    }
    const result = {
      requestId: baseRequestId,
      outcomes,
      succeeded: outcomes.filter(({ status }) => status === "succeeded").length,
      conflicts: outcomes.filter(({ status }) => status === "conflict").length,
      failed: outcomes.filter(({ status }) => status === "failed").length
    };
    result.partial = (result.succeeded > 0 && result.succeeded < outcomes.length)
      || outcomes.some((outcome) => outcome.partialState || outcome.orphanedResourceSet);
    if (result.partial) {
      result.recovery = {
        action: "retry_same_request",
        requestId: baseRequestId,
        message: "Tente novamente: as etapas já aceitas serão reconhecidas sem duplicação."
      };
    }
    if (outcomes.length === 1 && outcomes[0].status !== "succeeded" && !result.partial) {
      const error = new Error(outcomes[0].message);
      error.code = outcomes[0].code || (outcomes[0].status === "conflict"
        ? "workspace_revision_conflict" : "resource_set_save_failed");
      error.conflict = outcomes[0].status === "conflict";
      error.outcomes = outcomes;
      throw error;
    }
    return result;
  }
}
