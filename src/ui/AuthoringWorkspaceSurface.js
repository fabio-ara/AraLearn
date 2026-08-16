import {
  createAuthoringDestinationRegistry,
  normalizeAuthoringDesign,
  normalizeAuthoringWorkspaceList,
  normalizeAuthoringWorkspaceOverview,
  sameEntityPath
} from "./authoringWorkspaceViewModel.js";
import { renderAuthoringWorkspaceSurface } from "./renderAuthoringWorkspace.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function online() {
  return globalThis.navigator?.onLine !== false;
}

function conflictError(error) {
  const code = text(error?.code || error?.response?.code).toLowerCase();
  const message = text(error?.message).toLowerCase();
  return code.includes("revision") || code.includes("conflict") || code.includes("stale") ||
    /revis[aã]o|conflito|estado mudou|stale/u.test(message);
}

function userMessage(error, fallback) {
  if (conflictError(error)) return "O desenho mudou. O estado foi relido antes de continuar.";
  return text(error?.message) || fallback;
}

function parsePath(value) {
  try {
    const path = JSON.parse(value || "[]");
    return Array.isArray(path) && path.length === 4 && path.every((item) => text(item))
      ? path
      : null;
  } catch {
    return null;
  }
}

function selectorValue(value) {
  if (typeof globalThis.CSS?.escape === "function") return globalThis.CSS.escape(String(value || ""));
  return String(value || "").replace(/["\\]/gu, "\\$&");
}

const RESOURCE_FACET_DEFINITIONS = Object.freeze([
  Object.freeze({ sourceKey: "families", requestKey: "families", label: "Famílias" }),
  Object.freeze({ sourceKey: "disciplines", requestKey: "disciplines", label: "Disciplinas" }),
  Object.freeze({ sourceKey: "structures", requestKey: "structures", label: "Estruturas" }),
  Object.freeze({ sourceKey: "operations", requestKey: "cognitiveOperations", label: "Operações" }),
  Object.freeze({ sourceKey: "practiceModes", requestKey: "practiceModalities", label: "Prática" })
]);

function resourceFacets(value, previous = null) {
  const source = value && typeof value === "object" ? value : {};
  const previousSelections = previous?.facetSelections && typeof previous.facetSelections === "object"
    ? previous.facetSelections
    : {};
  const facetSelections = {};
  const groups = RESOURCE_FACET_DEFINITIONS.flatMap((definition) => {
    const options = (Array.isArray(source[definition.sourceKey]) ? source[definition.sourceKey] : [])
      .flatMap((option) => {
        const key = text(option?.id || option?.key || option?.value);
        const label = text(option?.label || option?.name);
        if (!key || !label) return [];
        return [{
          key,
          label,
          count: Number.isSafeInteger(Number(option?.count)) ? Number(option.count) : null
        }];
      });
    if (!options.length) return [];
    const allowed = new Set(options.map((option) => option.key));
    facetSelections[definition.requestKey] = new Set(
      previousSelections[definition.requestKey] instanceof Set
        ? [...previousSelections[definition.requestKey]].filter((key) => allowed.has(key))
        : []
    );
    return [{ ...definition, options }];
  });
  return { groups, facetSelections };
}

function resourceFacetPayload(editor) {
  return Object.fromEntries(
    Object.entries(editor?.facetSelections || {}).map(([key, values]) => [
      key,
      values instanceof Set ? [...values] : []
    ])
  );
}

function resourcePage(value, previous = null) {
  const source = value?.resourceSet || value || {};
  const hasLocalSelection = previous?.selectionLoaded === true && previous?.selectedKeys instanceof Set;
  const existingSelections = hasLocalSelection
    ? new Set(previous.selectedKeys)
    : new Set(Array.isArray(source.selectedKeys) ? source.selectedKeys.map(String) : []);
  const pageItems = Array.isArray(source.items || source.packages) ? source.items || source.packages : [];
  const items = pageItems.flatMap((item) => {
    const key = text(item?.key || item?.packageRef || item?.contractRef || item?.id);
    if (!key) return [];
    const selected = hasLocalSelection ? existingSelections.has(key) :
      item?.selected === true || existingSelections.has(key);
    if (selected) existingSelections.add(key);
    return [{
      key,
      label: text(item?.label || item?.title || item?.name) || "Resource",
      familyLabel: text(item?.familyLabel || item?.family),
      selected
    }];
  });
  const setChoices = (Array.isArray(source.setChoices) ? source.setChoices : []).flatMap((choice, index) => {
    const key = text(choice?.key) || `choice-${index}`;
    const label = text(choice?.label);
    if (!label) return [];
    return [{
      key,
      label,
      ref: choice?.ref && typeof choice.ref === "object" ? structuredClone(choice.ref) : choice?.ref || null,
      scope: choice?.scope && typeof choice.scope === "object" ? structuredClone(choice.scope) : null,
      selected: choice?.selected === true || key === text(source.selectedSetKey)
    }];
  });
  const resourceScopes = (Array.isArray(source.resourceScopes) ? source.resourceScopes : []).flatMap((scope) => {
    const key = text(scope?.key);
    const label = text(scope?.label);
    if (!key || !label || !["microsequence", "lesson", "course", "microsequence_set"].includes(key)) return [];
    const targets = (Array.isArray(scope?.targets) ? scope.targets : []).flatMap((target, index) => {
      const entityPath = Array.isArray(target?.entityPath)
        ? target.entityPath.map((entry) => text(entry))
        : null;
      if (!entityPath?.length || entityPath.some((entry) => !entry)) return [];
      return [{
        key: text(target?.key) || `target-${index}`,
        label: text(target?.label) || `Microssequência ${index + 1}`,
        entityPath,
        selected: target?.selected === true
      }];
    });
    return [{
      key,
      label,
      available: scope?.available !== false,
      entityPath: Array.isArray(scope?.entityPath) ? scope.entityPath.map((entry) => text(entry)) : null,
      targets
    }];
  });
  const previousScopeKey = text(previous?.scopeKey);
  const fallbackScope = resourceScopes.find((scope) => scope.key === "microsequence" && scope.available) ||
    resourceScopes.find((scope) => scope.available) || null;
  const scopeKey = resourceScopes.some((scope) => scope.available && scope.key === previousScopeKey)
    ? previousScopeKey
    : fallbackScope?.key || "microsequence";
  const hasLocalTargetSelections = previous?.targetSelectionLoaded === true &&
    previous?.targetSelections instanceof Set;
  const targetSelections = new Set(
    hasLocalTargetSelections
      ? previous.targetSelections
      : resourceScopes.find((scope) => scope.key === "microsequence_set")?.targets
        .filter((target) => target.selected).map((target) => target.key) || []
  );
  const requiresSetChoice = source.requiresSetChoice === true;
  const selectedSetKey = text(source.selectedSetKey) ||
    setChoices.find((choice) => choice.selected)?.key || text(previous?.selectedSetKey);
  const facets = resourceFacets(source.facets, previous);
  return {
    summary: text(source.summary),
    items,
    selectedKeys: existingSelections,
    selectedCount: hasLocalSelection
      ? existingSelections.size
      : Number.isSafeInteger(Number(source.selectedCount))
      ? Number(source.selectedCount)
      : existingSelections.size,
    selectionComplete: previous?.selectionComplete === true ||
      Array.isArray(source.selectedKeys) || source.selectionComplete === true,
    selectionLoaded: Array.isArray(source.selectedKeys) || source.selectionComplete === true ||
      previous?.selectionLoaded === true,
    nextCursor: text(source.nextCursor),
    total: Number.isSafeInteger(Number(source.total)) ? Number(source.total) : items.length,
    query: previous?.query || "",
    facets: facets.groups,
    facetSelections: facets.facetSelections,
    facetsOpen: previous?.facetsOpen === true,
    setChoices,
    requiresSetChoice,
    selectedSetKey,
    resourceSetRef: setChoices.find((choice) => choice.key === selectedSetKey)?.ref ||
      previous?.resourceSetRef || null,
    resourceScopes,
    scopeKey,
    scopeOpen: previous?.scopeOpen === true,
    targetQuery: previous?.targetQuery || "",
    targetVisibleLimit: Number.isSafeInteger(previous?.targetVisibleLimit)
      ? previous.targetVisibleLimit
      : 24,
    targetSelections,
    targetSelectionLoaded: hasLocalTargetSelections ||
      resourceScopes.some((scope) => scope.key === "microsequence_set"),
    editable: source.editable !== false,
    limitation: text(source.limitation),
    resultMessage: text(previous?.resultMessage),
    recovery: previous?.recovery && typeof previous.recovery === "object"
      ? structuredClone(previous.recovery)
      : null,
    retryPayload: previous?.retryPayload && typeof previous.retryPayload === "object"
      ? structuredClone(previous.retryPayload)
      : null,
    loading: false,
    canSave: false
  };
}

function resourceScopePayload(editor, selectedMicrosequencePath) {
  const scope = editor?.resourceScopes?.find((item) => item.key === editor.scopeKey && item.available);
  const currentPath = Array.isArray(selectedMicrosequencePath) ? selectedMicrosequencePath : [];
  if (!scope) return null;
  if (scope.key === "microsequence_set") {
    const microsequencePaths = scope.targets
      .filter((target) => editor.targetSelections.has(target.key))
      .map((target) => [...target.entityPath]);
    return microsequencePaths.length ? { kind: "microsequence_set", microsequencePaths } : null;
  }
  const fallbackLength = { course: 1, lesson: 3, microsequence: 4 }[scope.key];
  const entityPath = Array.isArray(scope.entityPath) && scope.entityPath.length
    ? [...scope.entityPath]
    : currentPath.slice(0, fallbackLength);
  return entityPath.length === fallbackLength ? { kind: scope.key, entityPath } : null;
}

function resourcesCanSave(editor, selectedMicrosequencePath) {
  return Boolean(
    editor?.editable && !editor.recovery && !editor.loading && editor.selectionComplete &&
    editor.selectedKeys instanceof Set && editor.selectedKeys.size > 0 &&
    !editor.requiresSetChoice &&
    resourceScopePayload(editor, selectedMicrosequencePath) && typeof editor.save === "function"
  );
}

function activeMicrosequence(overview, selectedPath, selectedKey = "") {
  return overview?.parts.flatMap((part) => part.microsequences).find((item) =>
    (selectedPath && sameEntityPath(item.entityPath, selectedPath)) ||
    (!selectedPath && selectedKey && item.key === selectedKey)
  ) || null;
}

export function createAuthoringWorkspaceSurface({
  root,
  controller,
  onOpenCollections = async () => {},
  onOpenSettings = async () => {},
  onOpenContent = async () => false,
  onClose = () => {},
  additionalDestinations = [],
  documentValue = globalThis.document
} = {}) {
  if (!root || !controller) throw new TypeError("Dependências da Autoria ausentes.");
  const registry = createAuthoringDestinationRegistry(additionalDestinations);
  let listEpoch = 0;
  let workspaceEpoch = 0;
  let designEpoch = 0;
  let resourceEpoch = 0;
  let findingEpoch = 0;
  let pendingFocusSelector = "";
  let returnFocusTarget = null;
  let searchTimer = null;
  const state = {
    opened: false,
    loading: false,
    workspaceList: null,
    workspaceId: "",
    workspaceTitle: "",
    overview: null,
    destination: "map",
    expandedPartId: "",
    selectedMicrosequence: null,
    design: null,
    designLoading: false,
    parameterEditor: null,
    parameterDraftValue: null,
    resourceEditor: null,
    resourcesAvailable: typeof controller.loadAuthoringResourceSetPage === "function",
    findingsAvailable: typeof controller.loadAuthoringFindingsPage === "function" ||
      typeof controller.listAuthoringFindings === "function",
    findingsLoading: false,
    findingsPageLoaded: false,
    findingsNextCursor: null,
    findingsOfflineLimited: false,
    statusMessage: "",
    errorMessage: ""
  };

  const loadFindingsFromController = typeof controller.loadAuthoringFindingsPage === "function"
    ? controller.loadAuthoringFindingsPage.bind(controller)
    : typeof controller.listAuthoringFindings === "function"
      ? controller.listAuthoringFindings.bind(controller)
      : null;

  function resetFindingsPagination(overview = null) {
    ++findingEpoch;
    state.findingsLoading = false;
    state.findingsPageLoaded = overview?.findingsNextCursor != null;
    state.findingsNextCursor = overview?.findingsNextCursor == null
      ? null
      : structuredClone(overview.findingsNextCursor);
    state.findingsOfflineLimited = false;
  }

  function normalizeFindingItems(value) {
    const normalized = normalizeAuthoringWorkspaceOverview({
      workspaceId: state.overview.workspaceId,
      title: state.overview.title,
      findings: {
        items: Array.isArray(value?.items) ? value.items : [],
        total: value?.total,
        truncated: value?.truncated === true
      }
    });
    return normalized.findings;
  }

  async function loadMoreFindings({ restoreFocus = true } = {}) {
    if (!loadFindingsFromController || !state.overview || state.findingsLoading) return false;
    if (state.findingsPageLoaded && state.findingsNextCursor == null) return false;
    const epoch = ++findingEpoch;
    const cursor = state.findingsPageLoaded ? state.findingsNextCursor : null;
    let focusAfterLoad = '[data-authoring-action="load-more-findings"]';
    state.findingsLoading = true;
    state.errorMessage = "";
    render();
    try {
      const result = await loadFindingsFromController({
        workspaceId: state.workspaceId,
        cursor,
        limit: 50,
        online: online()
      });
      if (epoch !== findingEpoch || !state.opened || !state.overview) return false;
      const pageItems = normalizeFindingItems(result);
      const existingIds = new Set(state.overview.findings.map((finding) => finding.findingId));
      const firstNewFinding = pageItems.find((finding) => !existingIds.has(finding.findingId));
      const merged = new Map(state.overview.findings.map((finding) => [finding.findingId, finding]));
      pageItems.forEach((finding) => merged.set(finding.findingId, finding));
      const findings = Object.freeze([...merged.values()]);
      const findingsTotal = Math.max(
        findings.length,
        Number.isSafeInteger(Number(result?.total)) ? Number(result.total) : 0,
        state.overview.findingsTotal
      );
      state.findingsPageLoaded = true;
      state.findingsNextCursor = result?.nextCursor == null ? null : structuredClone(result.nextCursor);
      state.findingsOfflineLimited = result?.stale === true && result?.truncated === true &&
        state.findingsNextCursor == null;
      state.overview = Object.freeze({
        ...state.overview,
        findings,
        findingsTotal,
        findingsTruncated: result?.truncated === true || state.findingsNextCursor != null
      });
      if (state.findingsNextCursor == null) {
        focusAfterLoad = firstNewFinding?.targetAvailable === false
          ? ".authoring-audit-heading"
          : firstNewFinding
            ? `[data-finding-id="${selectorValue(firstNewFinding.findingId)}"]`
            : ".authoring-audit-heading";
      }
      return true;
    } catch (error) {
      if (epoch !== findingEpoch || !state.opened) return false;
      state.errorMessage = userMessage(error, "Não foi possível carregar os demais achados.");
      return false;
    } finally {
      if (epoch === findingEpoch && state.opened) {
        state.findingsLoading = false;
        render({ focus: restoreFocus ? focusAfterLoad : "" });
      }
    }
  }

  root.hidden = true;
  root.classList.add("authoring-app-root");

  function availableDestinations() {
    return registry.filter((definition) => definition.available({
      overview: state.overview,
      selectedMicrosequence: state.selectedMicrosequence
    }));
  }

  function syncSelectedMicrosequence() {
    if (!state.overview) {
      state.selectedMicrosequence = null;
      return;
    }
    const previousPath = state.selectedMicrosequence?.entityPath;
    const previousKey = state.selectedMicrosequence?.key;
    state.selectedMicrosequence = activeMicrosequence(
      state.overview,
      previousPath,
      previousKey
    );
  }

  function applyOverviewSyncMessage() {
    if (!state.overview) return;
    if (state.overview.conflict) {
      state.errorMessage = "O workspace possui uma alteração em conflito. Releia o estado antes de ajustar.";
      state.statusMessage = "";
    } else if (state.overview.stale) {
      state.statusMessage = "Exibindo o último estado disponível neste dispositivo.";
      state.errorMessage = "";
    } else if (state.overview.pending) {
      state.statusMessage = "Há alteração pendente neste dispositivo.";
      state.errorMessage = "";
    }
  }

  function applyDesignSyncMessage() {
    if (!state.design) return;
    if (state.design.conflict) {
      state.errorMessage = "O desenho possui uma alteração em conflito. Resolva-a antes de continuar.";
      state.statusMessage = "";
    } else if (state.design.stale) {
      state.statusMessage = "Exibindo o último desenho disponível neste dispositivo.";
      state.errorMessage = "";
    } else if (state.design.pending) {
      state.statusMessage = "Alteração salva neste dispositivo e aguardando sincronização.";
      state.errorMessage = "";
    }
  }

  function render({ focus = "" } = {}) {
    if (!state.opened) return;
    if (focus) pendingFocusSelector = focus;
    root.innerHTML = renderAuthoringWorkspaceSurface(state, availableDestinations());
    root.setAttribute("aria-busy", String(state.loading || state.designLoading));
    if (pendingFocusSelector) {
      const selector = pendingFocusSelector;
      pendingFocusSelector = "";
      globalThis.queueMicrotask?.(() => root.querySelector(selector)?.focus());
    }
  }

  async function loadWorkspaceList({ preserveStatus = false } = {}) {
    const epoch = ++listEpoch;
    state.loading = true;
    if (!preserveStatus) {
      state.statusMessage = "";
      state.errorMessage = "";
    }
    render();
    try {
      const result = await controller.listAuthoringWorkspaces({ online: online() });
      if (epoch !== listEpoch || !state.opened) return false;
      state.workspaceList = normalizeAuthoringWorkspaceList(result);
      if (state.workspaceList.stale && !state.statusMessage) {
        state.statusMessage = "Exibindo o último estado disponível neste dispositivo.";
      }
      return true;
    } catch (error) {
      if (epoch !== listEpoch || !state.opened) return false;
      state.errorMessage = userMessage(error, "Não foi possível carregar os workspaces.");
      return false;
    } finally {
      if (epoch === listEpoch && state.opened) {
        state.loading = false;
        render();
      }
    }
  }

  async function loadDesign({ preserveStatus = false } = {}) {
    if (!state.workspaceId || !state.selectedMicrosequence?.entityPath) return false;
    const epoch = ++designEpoch;
    state.designLoading = true;
    state.design = null;
    if (!preserveStatus) {
      state.statusMessage = "";
      state.errorMessage = "";
    }
    render();
    try {
      const result = await controller.loadAuthoringDesign({
        workspaceId: state.workspaceId,
        microsequencePath: state.selectedMicrosequence.entityPath,
        view: "parameters",
        online: online()
      });
      if (epoch !== designEpoch || !state.opened) return false;
      state.design = normalizeAuthoringDesign(result);
      applyDesignSyncMessage();
      return true;
    } catch (error) {
      if (epoch !== designEpoch || !state.opened) return false;
      state.errorMessage = userMessage(error, "Não foi possível carregar o desenho.");
      return false;
    } finally {
      if (epoch === designEpoch && state.opened) {
        state.designLoading = false;
        render();
      }
    }
  }

  async function loadWorkspace(workspaceId, { destination = "map" } = {}) {
    const normalizedWorkspaceId = text(workspaceId);
    if (!normalizedWorkspaceId) return false;
    const epoch = ++workspaceEpoch;
    state.workspaceId = normalizedWorkspaceId;
    state.workspaceTitle = state.workspaceList?.items.find((item) =>
      item.workspaceId === normalizedWorkspaceId
    )?.title || "Workspace";
    state.destination = availableDestinations().some((item) => item.key === destination)
      ? destination
      : "map";
    state.overview = null;
    state.design = null;
    state.selectedMicrosequence = null;
    state.expandedPartId = "";
    resetFindingsPagination();
    state.loading = true;
    state.statusMessage = "";
    state.errorMessage = "";
    render();
    try {
      const result = await controller.loadAuthoringWorkspaceOverview(normalizedWorkspaceId, {
        online: online()
      });
      if (epoch !== workspaceEpoch || !state.opened || state.workspaceId !== normalizedWorkspaceId) {
        return false;
      }
      state.overview = normalizeAuthoringWorkspaceOverview(result);
      resetFindingsPagination(state.overview);
      state.workspaceTitle = state.overview.title;
      state.expandedPartId = state.overview.parts.find((part) =>
        part.state.key !== "ready"
      )?.partId || state.overview.parts[0]?.partId || "";
      syncSelectedMicrosequence();
      applyOverviewSyncMessage();
      if (state.destination === "design") await loadDesign({ preserveStatus: true });
      return true;
    } catch (error) {
      if (epoch !== workspaceEpoch || !state.opened) return false;
      state.errorMessage = userMessage(error, "Não foi possível abrir o workspace.");
      return false;
    } finally {
      if (epoch === workspaceEpoch && state.opened) {
        state.loading = false;
        render();
      }
    }
  }

  async function reloadCurrentWorkspace({ reloadDesign = false, preserveStatus = true } = {}) {
    if (!state.workspaceId) return false;
    if (!preserveStatus) {
      state.statusMessage = "";
      state.errorMessage = "";
    }
    const selectedPath = state.selectedMicrosequence?.entityPath;
    const destination = state.destination;
    const result = await controller.loadAuthoringWorkspaceOverview(state.workspaceId, { online: online() });
    state.overview = normalizeAuthoringWorkspaceOverview(result);
    resetFindingsPagination(state.overview);
    state.selectedMicrosequence = activeMicrosequence(state.overview, selectedPath);
    if (reloadDesign && state.selectedMicrosequence?.entityPath) {
      const design = await controller.loadAuthoringDesign({
        workspaceId: state.workspaceId,
        microsequencePath: state.selectedMicrosequence.entityPath,
        view: "parameters",
        online: online()
      });
      state.design = normalizeAuthoringDesign(design);
      applyDesignSyncMessage();
    } else {
      applyOverviewSyncMessage();
    }
    state.destination = destination;
    render();
    return true;
  }

  async function changeDestination(destination) {
    if (!availableDestinations().some((item) => item.key === destination)) return;
    state.destination = destination;
    state.parameterEditor = null;
    state.resourceEditor = null;
    state.errorMessage = "";
    render({ focus: `[data-authoring-destination="${destination}"]` });
    if (destination === "design" && state.selectedMicrosequence && !state.design) {
      await loadDesign();
    }
  }

  function selectMicrosequence(node) {
    const path = parsePath(node.dataset.entityPath);
    const microsequence = activeMicrosequence(state.overview, path, node.dataset.microsequenceKey);
    if (!microsequence) return;
    state.selectedMicrosequence = microsequence;
    state.design = null;
    state.statusMessage = "";
    state.errorMessage = "";
    render({
      focus: `[data-authoring-action="select-microsequence"][data-microsequence-key="${selectorValue(microsequence.key)}"]`
    });
  }

  function editParameter(parameterKey) {
    const parameter = state.design?.parameters.find((item) => item.key === parameterKey);
    if (!parameter?.editable || state.design?.conflict) return;
    state.parameterEditor = parameter;
    state.parameterDraftValue = Number.isFinite(Number(parameter.editableValue))
      ? Number(parameter.editableValue)
      : parameter.range.min;
    render({ focus: '[data-authoring-dialog="parameter"] button' });
  }

  function closeParameterEditor() {
    const parameterKey = state.parameterEditor?.key;
    state.parameterEditor = null;
    state.parameterDraftValue = null;
    render({
      focus: parameterKey
        ? `[data-authoring-action="edit-parameter"][data-parameter-key="${selectorValue(parameterKey)}"]`
        : ""
    });
  }

  async function setParameterValue(value) {
    const parameter = state.parameterEditor;
    if (!parameter || state.loading || state.design?.conflict) return;
    state.loading = true;
    state.errorMessage = "";
    render();
    try {
      const result = await controller.setAuthoringParameter({
        workspaceId: state.workspaceId,
        microsequencePath: state.selectedMicrosequence.entityPath,
        parameterKey: parameter.key,
        value,
        scope: "microsequence",
        expectedRevision: state.design?.revision || state.overview?.revision,
        online: online()
      });
      state.parameterEditor = null;
      state.parameterDraftValue = null;
      state.statusMessage = result?.pending === true
        ? "Alteração salva neste dispositivo e aguardando sincronização."
        : "Parâmetro atualizado.";
      await reloadCurrentWorkspace({ reloadDesign: true });
    } catch (error) {
      state.parameterEditor = null;
      state.parameterDraftValue = null;
      state.errorMessage = userMessage(error, "Não foi possível ajustar o parâmetro.");
      if (conflictError(error)) {
        try {
          await reloadCurrentWorkspace({ reloadDesign: true });
        } catch {
          // A mensagem de releitura permanece visível; não há merge silencioso.
        }
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  async function restoreParameterAuto() {
    const parameter = state.parameterEditor;
    if (!parameter || state.loading || state.design?.conflict) return;
    state.loading = true;
    state.errorMessage = "";
    render();
    try {
      const result = await controller.restoreAuthoringParameterAuto({
        workspaceId: state.workspaceId,
        microsequencePath: state.selectedMicrosequence.entityPath,
        parameterKey: parameter.key,
        scope: "microsequence",
        expectedRevision: state.design?.revision || state.overview?.revision,
        online: online()
      });
      state.parameterEditor = null;
      state.parameterDraftValue = null;
      state.statusMessage = result?.pending === true
        ? "Auto restaurado neste dispositivo; sincronização pendente."
        : "Auto restaurado.";
      await reloadCurrentWorkspace({ reloadDesign: true });
    } catch (error) {
      state.parameterEditor = null;
      state.parameterDraftValue = null;
      state.errorMessage = userMessage(error, "Não foi possível restaurar Auto.");
      if (conflictError(error)) {
        try {
          await reloadCurrentWorkspace({ reloadDesign: true });
        } catch {
          // O conflito continua explícito para nova tentativa.
        }
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  async function openResources() {
    if (!state.resourcesAvailable || !state.selectedMicrosequence?.entityPath ||
        !state.design?.resources.editable || state.design?.conflict) return;
    const epoch = ++resourceEpoch;
    state.resourceEditor = {
      summary: state.design?.resources.summary,
      items: [],
      selectedKeys: new Set(),
      selectionLoaded: false,
      selectedCount: 0,
      selectionComplete: false,
      nextCursor: "",
      query: "",
      facets: [],
      facetSelections: {},
      facetsOpen: false,
      setChoices: [],
      requiresSetChoice: false,
      selectedSetKey: "",
      resourceSetRef: null,
      resourceScopes: [],
      scopeKey: "microsequence",
      scopeOpen: false,
      targetQuery: "",
      targetVisibleLimit: 24,
      targetSelections: new Set(),
      targetSelectionLoaded: false,
      editable: true,
      limitation: "",
      resultMessage: "",
      recovery: null,
      retryPayload: null,
      loading: true,
      canSave: false,
      save: typeof controller.saveAuthoringResourceSetSelection === "function"
        ? controller.saveAuthoringResourceSetSelection.bind(controller)
        : null
    };
    render({ focus: '[data-authoring-dialog="resources"] button' });
    try {
      const result = await controller.loadAuthoringResourceSetPage({
        workspaceId: state.workspaceId,
        microsequencePath: state.selectedMicrosequence.entityPath,
        cursor: null,
        limit: 40,
        online: online()
      });
      if (epoch !== resourceEpoch || !state.resourceEditor) return;
      state.resourceEditor = resourcePage(result, state.resourceEditor);
      state.resourceEditor.save = typeof controller.saveAuthoringResourceSetSelection === "function"
        ? controller.saveAuthoringResourceSetSelection.bind(controller)
        : null;
      state.resourceEditor.canSave = resourcesCanSave(
        state.resourceEditor,
        state.selectedMicrosequence.entityPath
      );
    } catch (error) {
      if (epoch !== resourceEpoch || !state.resourceEditor) return;
      state.resourceEditor.loading = false;
      state.errorMessage = userMessage(error, "Não foi possível carregar Resources.");
    }
    render({ focus: "[data-authoring-resource-search]" });
  }

  async function loadResourcePage({
    append = false,
    query = state.resourceEditor?.query || "",
    resourceSetChoice = null
  } = {}) {
    if (!state.resourceEditor) return;
    const epoch = ++resourceEpoch;
    const previous = state.resourceEditor;
    previous.loading = true;
    previous.query = query;
    if (resourceSetChoice) {
      previous.selectedSetKey = resourceSetChoice.key;
      previous.resourceSetRef = resourceSetChoice.ref;
      previous.selectedKeys = new Set();
      previous.selectionLoaded = false;
      previous.selectionComplete = false;
      previous.targetSelections = new Set();
      previous.targetSelectionLoaded = false;
    }
    render();
    try {
      const result = await controller.loadAuthoringResourceSetPage({
        workspaceId: state.workspaceId,
        microsequencePath: state.selectedMicrosequence.entityPath,
        cursor: append ? previous.nextCursor || null : null,
        limit: 40,
        query,
        facets: resourceFacetPayload(previous),
        resourceSetRef: previous.resourceSetRef,
        online: online()
      });
      if (epoch !== resourceEpoch || !state.resourceEditor) return;
      const next = resourcePage(result, resourceSetChoice ? {
        ...previous,
        selectedKeys: new Set(),
        selectionLoaded: false,
        selectedSetKey: resourceSetChoice.key,
        resourceSetRef: resourceSetChoice.ref,
        targetSelections: new Set(),
        targetSelectionLoaded: false
      } : previous);
      next.items = append ? [...previous.items, ...next.items] : next.items;
      next.save = typeof controller.saveAuthoringResourceSetSelection === "function"
        ? controller.saveAuthoringResourceSetSelection.bind(controller)
        : null;
      next.canSave = resourcesCanSave(next, state.selectedMicrosequence.entityPath);
      state.resourceEditor = next;
    } catch (error) {
      if (epoch !== resourceEpoch || !state.resourceEditor) return;
      state.resourceEditor.loading = false;
      state.errorMessage = userMessage(error, "Não foi possível carregar Resources.");
    }
    render();
  }

  function toggleResource(index, checked) {
    const editor = state.resourceEditor;
    const item = editor?.items[index];
    if (!item) return;
    item.selected = checked;
    if (checked) editor.selectedKeys.add(item.key);
    else editor.selectedKeys.delete(item.key);
    editor.selectedCount = editor.selectedKeys.size;
    editor.canSave = resourcesCanSave(editor, state.selectedMicrosequence.entityPath);
    render({ focus: `[data-resource-index="${index}"]` });
  }

  function selectResourceSet(index) {
    const choice = state.resourceEditor?.setChoices?.[index];
    if (!choice || choice.key === state.resourceEditor.selectedSetKey && !state.resourceEditor.requiresSetChoice) {
      return;
    }
    void loadResourcePage({ query: "", resourceSetChoice: choice });
  }

  function selectResourceScope(index) {
    const editor = state.resourceEditor;
    const scope = editor?.resourceScopes?.[index];
    if (!scope?.available) return;
    editor.scopeKey = scope.key;
    if (scope.key === "microsequence_set") {
      editor.targetQuery = "";
      editor.targetVisibleLimit = 24;
    }
    editor.canSave = resourcesCanSave(editor, state.selectedMicrosequence.entityPath);
    render({ focus: `[data-authoring-resource-scope-index="${index}"]` });
  }

  function toggleResourceFacet(groupIndex, optionIndex, checked) {
    const editor = state.resourceEditor;
    const group = editor?.facets?.[groupIndex];
    const option = group?.options?.[optionIndex];
    const selection = group ? editor.facetSelections?.[group.requestKey] : null;
    if (!option || !(selection instanceof Set)) return;
    if (checked) selection.add(option.key);
    else selection.delete(option.key);
    void loadResourcePage({ query: editor.query });
  }

  function toggleResourceTarget(index, checked) {
    const editor = state.resourceEditor;
    const scope = editor?.resourceScopes?.find((item) => item.key === "microsequence_set");
    const target = scope?.targets?.[index];
    if (!target) return;
    if (checked) editor.targetSelections.add(target.key);
    else editor.targetSelections.delete(target.key);
    editor.canSave = resourcesCanSave(editor, state.selectedMicrosequence.entityPath);
    render({ focus: `[data-resource-target-index="${index}"]` });
  }

  async function saveResources({ retry = false } = {}) {
    const editor = state.resourceEditor;
    if (state.loading || (!retry && !editor?.canSave) || (retry && !editor?.retryPayload) ||
        typeof editor?.save !== "function") return;
    state.loading = true;
    state.errorMessage = "";
    render();
    try {
      const scope = resourceScopePayload(editor, state.selectedMicrosequence.entityPath);
      if (!scope && !retry) return;
      const payload = retry
        ? structuredClone(editor.retryPayload)
        : {
            workspaceId: state.workspaceId,
            microsequencePath: state.selectedMicrosequence.entityPath,
            selectedKeys: [...editor.selectedKeys].sort((left, right) => left.localeCompare(right)),
            selectionComplete: true,
            scope,
            resourceSetRef: editor.resourceSetRef,
            selectedSetKey: editor.selectedSetKey,
            expectedRevision: state.design?.revision || state.overview?.revision,
            online: online()
          };
      payload.online = online();
      const result = await editor.save(payload);
      if (result?.partial === true || Number(result?.conflicts) > 0 || Number(result?.failed) > 0) {
        editor.resultMessage = [
          `${Number(result?.succeeded) || 0} concluída(s)`,
          `${Number(result?.conflicts) || 0} com conflito`,
          `${Number(result?.failed) || 0} não concluída(s)`
        ].join(" · ");
        editor.canSave = false;
        const recoveryRequestId = text(result?.recovery?.requestId);
        editor.recovery = recoveryRequestId ? {
          requestId: recoveryRequestId,
          message: text(result?.recovery?.message) || "Tente concluir a mesma aplicação."
        } : null;
        editor.retryPayload = recoveryRequestId ? {
          workspaceId: payload.workspaceId,
          microsequencePath: structuredClone(payload.microsequencePath),
          selectedKeys: structuredClone(payload.selectedKeys),
          selectionComplete: true,
          scope: structuredClone(payload.scope),
          resourceSetRef: payload.resourceSetRef == null ? null : structuredClone(payload.resourceSetRef),
          selectedSetKey: payload.selectedSetKey,
          requestId: recoveryRequestId
        } : null;
        state.errorMessage = "A aplicação foi parcial. Revise os resultados antes de tentar novamente.";
        await reloadCurrentWorkspace({ reloadDesign: true });
        return;
      }
      state.resourceEditor = null;
      state.statusMessage = result?.pending === true
        ? "Resources salvos neste dispositivo; sincronização pendente."
        : "Resources atualizados.";
      await reloadCurrentWorkspace({ reloadDesign: true });
    } catch (error) {
      if (retry) {
        editor.resultMessage = userMessage(error, "Não foi possível retomar a aplicação.");
      } else {
        state.resourceEditor = null;
      }
      state.errorMessage = userMessage(error, "Não foi possível salvar Resources.");
      if (conflictError(error)) {
        try {
          await reloadCurrentWorkspace({ reloadDesign: true });
        } catch {
          // Não há merge silencioso da seleção.
        }
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  async function resolveParameterConflict(parameterKey, resolution) {
    if (state.loading || !state.selectedMicrosequence?.entityPath) return;
    const parameter = state.design?.parameters.find((item) => item.key === parameterKey);
    if (!parameter?.conflict) return;
    const requestId = parameter.pendingRequestId;
    const method = resolution === "discard"
      ? controller.discardAuthoringParameterChange
      : controller.retryAuthoringParameterChange;
    if (!requestId || typeof method !== "function") {
      await reloadCurrentWorkspace({ reloadDesign: true, preserveStatus: false });
      return;
    }
    state.loading = true;
    state.statusMessage = "";
    state.errorMessage = "";
    render();
    try {
      await method.call(controller, {
        workspaceId: state.workspaceId,
        microsequencePath: state.selectedMicrosequence.entityPath,
        requestId,
        online: online()
      });
      state.statusMessage = resolution === "discard"
        ? "Alteração local descartada."
        : "Alteração reenviada após releitura.";
      await reloadCurrentWorkspace({ reloadDesign: true });
    } catch (error) {
      state.errorMessage = userMessage(error, "Não foi possível resolver o conflito.");
      try {
        await reloadCurrentWorkspace({ reloadDesign: true });
      } catch {
        // O conflito continua explícito; nenhuma alteração é mesclada silenciosamente.
      }
    } finally {
      state.loading = false;
      render();
    }
  }

  async function openReaderTarget(target, returnDestination, returnDetails = {}) {
    const entityPath = Array.isArray(target?.entityPath) ? target.entityPath : null;
    if (!entityPath) {
      state.errorMessage = "O conteúdo correspondente ainda não está disponível.";
      render();
      return false;
    }
    state.loading = true;
    state.errorMessage = "";
    render();
    try {
      const opened = await onOpenContent({
        ...state.overview?.readerTarget,
        ...target,
        workspaceId: state.workspaceId,
        entityPath
      }, {
        workspaceId: state.workspaceId,
        destination: returnDestination,
        microsequencePath: state.selectedMicrosequence?.entityPath || null,
        ...returnDetails
      });
      if (opened === false) {
        state.errorMessage = "Não foi possível abrir este conteúdo no dispositivo.";
        return false;
      }
      state.opened = false;
      root.hidden = true;
      return true;
    } catch (error) {
      state.errorMessage = userMessage(error, "Não foi possível abrir o conteúdo.");
      return false;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function openFinding(findingId) {
    const finding = state.overview?.findings.find((item) => item.findingId === findingId);
    if (!finding) return;
    if (finding.targetAvailable === false) {
      state.errorMessage = "O conteúdo original deste achado não está mais disponível.";
      render();
      return;
    }
    let target = finding.readerTarget;
    if (!Array.isArray(target?.entityPath) && typeof controller.resolveAuthoringFindingTarget === "function") {
      const resolved = await controller.resolveAuthoringFindingTarget({
        workspaceId: state.workspaceId,
        findingId,
        overview: state.overview
      });
      target = resolved?.readerTarget || resolved;
    }
    await openReaderTarget(target, "audit", {
      findingId: text(finding.returnContext?.findingId) || finding.findingId
    });
  }

  function backToWorkspaces() {
    ++workspaceEpoch;
    ++designEpoch;
    state.workspaceId = "";
    state.workspaceTitle = "";
    state.overview = null;
    state.design = null;
    state.selectedMicrosequence = null;
    state.destination = "map";
    state.parameterEditor = null;
    state.resourceEditor = null;
    state.statusMessage = "";
    state.errorMessage = "";
    render({ focus: "[data-authoring-current-section]" });
  }

  function close() {
    ++listEpoch;
    ++workspaceEpoch;
    ++designEpoch;
    ++resourceEpoch;
    ++findingEpoch;
    globalThis.clearTimeout(searchTimer);
    state.opened = false;
    state.parameterEditor = null;
    state.resourceEditor = null;
    state.findingsLoading = false;
    root.hidden = true;
    onClose();
    const target = returnFocusTarget;
    returnFocusTarget = null;
    if (target?.isConnected !== false && typeof target?.focus === "function") target.focus();
  }

  async function open({ workspaceId = "", destination = "map" } = {}) {
    if (!state.opened) returnFocusTarget = documentValue.activeElement;
    state.opened = true;
    root.hidden = false;
    render();
    if (!state.workspaceList) await loadWorkspaceList();
    if (workspaceId) await loadWorkspace(workspaceId, { destination });
    else render({ focus: '[data-authoring-action="close"]' });
    return true;
  }

  async function resume({
    workspaceId = state.workspaceId,
    destination = state.destination,
    microsequencePath = null,
    findingId = ""
  } = {}) {
    state.opened = true;
    root.hidden = false;
    if (workspaceId && workspaceId !== state.workspaceId) {
      if (!await loadWorkspace(workspaceId, { destination })) return false;
    }
    if (microsequencePath) {
      state.selectedMicrosequence = activeMicrosequence(state.overview, microsequencePath) ||
        state.selectedMicrosequence;
    }
    state.destination = availableDestinations().some((item) => item.key === destination)
      ? destination
      : "map";
    const normalizedFindingId = text(findingId);
    if (state.destination === "audit" && normalizedFindingId) {
      const visitedCursors = new Set();
      while (!state.overview?.findings.some((finding) => finding.findingId === normalizedFindingId) &&
        state.overview?.findingsTruncated) {
        const cursorKey = JSON.stringify(state.findingsPageLoaded ? state.findingsNextCursor : null);
        if (visitedCursors.has(cursorKey)) break;
        visitedCursors.add(cursorKey);
        if (!await loadMoreFindings({ restoreFocus: false })) break;
      }
    }
    const findingAvailable = state.destination === "audit" && normalizedFindingId &&
      state.overview?.findings.some((finding) => finding.findingId === normalizedFindingId);
    if (state.destination === "audit" && normalizedFindingId && !findingAvailable) {
      state.statusMessage = "Este achado mudou ou já não está disponível no estado corrente.";
    }
    render({ focus: findingAvailable
      ? `[data-finding-id="${selectorValue(normalizedFindingId)}"]`
      : state.destination === "audit" && normalizedFindingId
        ? ".authoring-audit-heading"
        : `[data-authoring-destination="${state.destination}"]`
    });
    if (state.destination === "design" && state.selectedMicrosequence?.entityPath && !state.design) {
      await loadDesign({ preserveStatus: true });
    }
    return true;
  }

  function handleBack() {
    if (!state.opened) return false;
    if (state.parameterEditor) {
      closeParameterEditor();
      return true;
    }
    if (state.resourceEditor) {
      state.resourceEditor = null;
      render({ focus: '[data-authoring-action="open-resources"]' });
      return true;
    }
    if (state.workspaceId && state.destination !== "map") {
      void changeDestination("map");
      return true;
    }
    if (state.workspaceId) {
      backToWorkspaces();
      return true;
    }
    close();
    return true;
  }

  function trapDialogFocus(event) {
    const dialog = root.querySelector("[data-authoring-dialog]");
    if (!dialog || event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )].filter((node) => !node.hidden);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && documentValue.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && documentValue.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleBack();
      return;
    }
    trapDialogFocus(event);
    const tab = event.target.closest?.('[role="tab"][data-authoring-destination]');
    if (!tab || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      return;
    }
    const tabs = [...root.querySelectorAll('[role="tab"][data-authoring-destination]')];
    const index = tabs.indexOf(tab);
    if (index < 0) return;
    const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (backwards ? -1 : 1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[nextIndex].click();
  });

  root.addEventListener("input", (event) => {
    if (state.loading || state.resourceEditor?.recovery) return;
    if (event.target.matches?.("[data-authoring-resource-target-search]")) {
      if (!state.resourceEditor) return;
      state.resourceEditor.targetQuery = event.target.value;
      state.resourceEditor.targetVisibleLimit = 24;
      render({ focus: "[data-authoring-resource-target-search]" });
      return;
    }
    if (!event.target.matches?.("[data-authoring-resource-search]")) return;
    globalThis.clearTimeout(searchTimer);
    const query = event.target.value.trim();
    searchTimer = globalThis.setTimeout(() => void loadResourcePage({ query }), 250);
  });

  root.addEventListener("change", (event) => {
    if (state.loading || state.resourceEditor?.recovery) return;
    const facetGroupIndex = Number(event.target.dataset?.resourceFacetGroupIndex);
    const facetOptionIndex = Number(event.target.dataset?.resourceFacetOptionIndex);
    if (Number.isSafeInteger(facetGroupIndex) && Number.isSafeInteger(facetOptionIndex)) {
      toggleResourceFacet(facetGroupIndex, facetOptionIndex, event.target.checked === true);
      return;
    }
    const targetIndex = Number(event.target.dataset?.resourceTargetIndex);
    if (Number.isSafeInteger(targetIndex)) {
      toggleResourceTarget(targetIndex, event.target.checked === true);
      return;
    }
    const index = Number(event.target.dataset?.resourceIndex);
    if (!Number.isSafeInteger(index)) return;
    toggleResource(index, event.target.checked === true);
  });

  root.addEventListener("click", (event) => {
    const node = event.target.closest?.("[data-authoring-action], [data-authoring-destination]");
    if (!node || !root.contains(node)) return;
    if (node.classList.contains("authoring-dialog-backdrop") && event.target !== node) return;
    const destination = node.dataset.authoringDestination;
    if (destination) {
      void changeDestination(destination);
      return;
    }
    const action = node.dataset.authoringAction;
    if (state.loading && ![
      "close", "open-collections", "open-settings", "back-to-workspaces"
    ].includes(action)) return;
    if (state.resourceEditor?.recovery && action && ![
      "close-resources", "retry-resources"
    ].includes(action)) return;
    if (action === "close") close();
    else if (action === "open-collections") void onOpenCollections();
    else if (action === "open-settings") void onOpenSettings();
    else if (action === "open-workspace") void loadWorkspace(node.dataset.workspaceId);
    else if (action === "back-to-workspaces") backToWorkspaces();
    else if (action === "toggle-part") {
      state.expandedPartId = state.expandedPartId === node.dataset.partId ? "" : node.dataset.partId;
      render({ focus: `[data-part-id="${selectorValue(node.dataset.partId)}"]` });
    } else if (action === "select-microsequence") selectMicrosequence(node);
    else if (action === "edit-parameter") editParameter(node.dataset.parameterKey);
    else if (action === "close-parameter-editor") closeParameterEditor();
    else if (action === "set-parameter-option") {
      const option = state.parameterEditor?.options[Number(node.dataset.optionIndex)];
      if (option) void setParameterValue(option.value);
    } else if (action === "step-parameter") {
      const parameter = state.parameterEditor;
      const direction = Number(node.dataset.stepDirection);
      if (!parameter || ![-1, 1].includes(direction)) return;
      const current = Number(state.parameterDraftValue ?? parameter.range.min);
      state.parameterDraftValue = Math.max(
        parameter.range.min,
        Math.min(parameter.range.max, current + direction * parameter.range.step)
      );
      render({ focus: `[data-authoring-action="step-parameter"][data-step-direction="${direction}"]` });
    } else if (action === "apply-parameter-step") void setParameterValue(state.parameterDraftValue);
    else if (action === "restore-parameter-auto") void restoreParameterAuto();
    else if (action === "retry-parameter-change") {
      void resolveParameterConflict(node.dataset.parameterKey, "retry");
    } else if (action === "discard-parameter-change") {
      void resolveParameterConflict(node.dataset.parameterKey, "discard");
    } else if (action === "reload-current") {
      void reloadCurrentWorkspace({ reloadDesign: state.destination === "design", preserveStatus: false });
    }
    else if (action === "open-content") {
      void openReaderTarget(state.selectedMicrosequence?.readerTarget, "content");
    } else if (action === "open-finding") void openFinding(node.dataset.findingId);
    else if (action === "load-more-findings") void loadMoreFindings();
    else if (action === "clear-audit-scope") {
      state.selectedMicrosequence = null;
      render({ focus: '[data-authoring-action="clear-audit-scope"]' });
    }
    else if (action === "open-resources") void openResources();
    else if (action === "close-resources") {
      ++resourceEpoch;
      state.resourceEditor = null;
      render({ focus: '[data-authoring-action="open-resources"]' });
    } else if (action === "load-more-resources") void loadResourcePage({ append: true });
    else if (action === "toggle-resource-facets") {
      state.resourceEditor.facetsOpen = !state.resourceEditor.facetsOpen;
      render({ focus: '[data-authoring-action="toggle-resource-facets"]' });
    } else if (action === "load-more-resource-targets") {
      state.resourceEditor.targetVisibleLimit += 24;
      render({ focus: '[data-authoring-action="load-more-resource-targets"]' });
    }
    else if (action === "select-resource-set") selectResourceSet(Number(node.dataset.setChoiceIndex));
    else if (action === "toggle-resource-scope") {
      state.resourceEditor.scopeOpen = !state.resourceEditor.scopeOpen;
      render({ focus: '[data-authoring-action="toggle-resource-scope"]' });
    } else if (action === "select-resource-scope") {
      selectResourceScope(Number(node.dataset.authoringResourceScopeIndex));
    }
    else if (action === "save-resources") void saveResources();
    else if (action === "retry-resources") void saveResources({ retry: true });
  });

  return Object.freeze({
    open,
    close,
    resume,
    handleBack,
    refresh() {
      return state.workspaceId ? reloadCurrentWorkspace({ reloadDesign: state.destination === "design" }) : loadWorkspaceList();
    },
    get opened() {
      return state.opened;
    },
    get returnContext() {
      return Object.freeze({
        workspaceId: state.workspaceId,
        destination: state.destination,
        microsequencePath: state.selectedMicrosequence?.entityPath || null
      });
    }
  });
}
