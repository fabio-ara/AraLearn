import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function icon(name, className = "authoring-icon") {
  return renderUiIcon(name, className);
}

function pathAttribute(path) {
  return escapeHtml(JSON.stringify(Array.isArray(path) ? path : []));
}

function renderState(state, className = "") {
  return (
    '<span class="authoring-state ' + escapeHtml(className) + ' is-' + escapeHtml(state.key) + '"' +
    ' aria-label="' + escapeHtml(state.label) + '" title="' + escapeHtml(state.label) + '">' +
    icon(state.icon, "authoring-state-icon") +
    '<span>' + escapeHtml(state.label) + "</span></span>"
  );
}

function renderProductSwitch() {
  return (
    '<nav class="authoring-product-switch" aria-label="Área principal">' +
    '<button type="button" data-authoring-action="close"' +
    ' title="Abrir Estudo">' + icon("trail") + '<span>Estudo</span></button>' +
    '<button class="is-active" type="button" aria-current="page"' +
    ' data-authoring-current-area title="Autoria">' + icon("edit") + '<span>Autoria</span></button>' +
    "</nav>"
  );
}

function renderBrand() {
  return (
    '<span class="brand-title">' +
    '<img class="brand-mark" src="assets/brand/aralearn-mark-monochrome.svg" alt="" aria-hidden="true">' +
    '<span class="brand-text">AraLearn</span></span>'
  );
}

function renderLoading(label = "Carregando…") {
  return (
    '<div class="authoring-loading" role="status" aria-live="polite">' +
    icon("progress", "authoring-loading-icon") + '<span>' + escapeHtml(label) + "</span></div>"
  );
}

function renderLanding(state) {
  const workspaceList = state.workspaceList;
  const workspaceContent = state.loading && !workspaceList
    ? renderLoading("Carregando workspaces…")
    : workspaceList?.items.length
      ? '<div class="authoring-workspace-list" aria-label="Workspaces">' +
        workspaceList.items.map((workspace) => (
          '<button class="authoring-workspace-card" type="button"' +
          ' data-authoring-action="open-workspace" data-workspace-id="' +
          escapeHtml(workspace.workspaceId) + '">' +
          '<span class="authoring-workspace-copy"><strong>' + escapeHtml(workspace.title) + "</strong>" +
          renderState(workspace.state) +
          (workspace.conflict
            ? '<span class="authoring-sync-note is-conflict">Conflito · releitura necessária</span>'
            : workspace.pending
              ? '<span class="authoring-sync-note">Alteração pendente neste dispositivo</span>'
              : workspace.stale
                ? '<span class="authoring-sync-note">Último estado disponível</span>'
                : "") +
          "</span>" + icon("arrow-right", "authoring-card-arrow") +
          "</button>"
        )).join("") + "</div>"
      : '<p class="authoring-empty">Nenhum workspace disponível.</p>';

  return (
    '<section class="authoring-screen authoring-landing-screen">' +
    '<header class="authoring-landing-header"><div class="authoring-brand">' + renderBrand() + "</div>" +
    '<div class="authoring-landing-actions">' + renderProductSwitch() +
    '<button class="icon-ghost" type="button" data-authoring-action="open-settings"' +
    ' title="Conta e aparência" aria-label="Conta e aparência">' + icon("more") + "</button></div></header>" +
    '<main class="authoring-landing-content">' +
    '<nav class="authoring-entry-switch" aria-label="Autoria">' +
    '<button class="is-active" type="button" aria-current="page" data-authoring-current-section>' +
    icon("graph") + '<span>Workspaces</span></button>' +
    '<button type="button" data-authoring-action="open-collections">' +
    icon("folder") + '<span>Coleções</span></button>' +
    "</nav>" +
    '<section class="authoring-workspaces" aria-labelledby="authoring-workspaces-title">' +
    '<h1 id="authoring-workspaces-title" class="sr-only">Workspaces</h1>' + workspaceContent +
    "</section></main>" +
    renderStatus(state) +
    "</section>"
  );
}

function renderWorkspaceNavigation(state, destinations) {
  return (
    '<nav class="authoring-workspace-nav" role="tablist" aria-label="Workspace">' +
    destinations.map((destination) => {
      const selected = destination.key === state.destination;
      return (
        '<button type="button" role="tab" data-authoring-destination="' + escapeHtml(destination.key) + '"' +
        ' aria-selected="' + String(selected) + '"' + (selected ? "" : ' tabindex="-1"') +
        ' title="' + escapeHtml(destination.label) + '" class="' + (selected ? "is-active" : "") + '">' +
        icon(destination.icon) + '<span>' + escapeHtml(destination.label) + "</span></button>"
      );
    }).join("") + "</nav>"
  );
}

function renderMap(state) {
  const overview = state.overview;
  if (!overview) return renderLoading("Carregando mapa…");
  if (!overview.parts.length) {
    return '<div class="authoring-empty"><p>O planejamento ainda não possui Partes.</p></div>';
  }
  return (
    '<section class="authoring-map" aria-labelledby="authoring-destination-title">' +
    overview.parts.map((part) => {
      const expanded = state.expandedPartId === part.partId;
      return (
        '<article class="authoring-part' + (expanded ? " is-expanded" : "") + '">' +
        '<button class="authoring-part-heading" type="button" data-authoring-action="toggle-part"' +
        ' data-part-id="' + escapeHtml(part.partId) + '" aria-expanded="' + String(expanded) + '">' +
        '<span><strong>' + escapeHtml(part.title) + "</strong>" + renderState(part.state) + "</span>" +
        icon(expanded ? "arrow-up" : "arrow-right", "authoring-part-arrow") + "</button>" +
        (expanded
          ? '<div class="authoring-microsequence-list" aria-label="Microssequências de ' +
            escapeHtml(part.title) + '">' +
            (part.microsequences.length
              ? part.microsequences.map((microsequence) => {
                  const selected = state.selectedMicrosequence?.key === microsequence.key;
                  const available = Array.isArray(microsequence.entityPath) &&
                    microsequence.entityPath.length === 4 && microsequence.state.key !== "missing";
                  return (
                    '<button class="authoring-microsequence' + (selected ? " is-selected" : "") +
                    '" type="button"' + (available
                      ? ' data-authoring-action="select-microsequence"'
                      : ' disabled aria-disabled="true"') +
                    ' data-entity-path="' + pathAttribute(microsequence.entityPath) + '" data-microsequence-key="' +
                    escapeHtml(microsequence.key) + '" aria-pressed="' + String(selected) + '">' +
                    '<span class="authoring-microsequence-copy"><strong>' + escapeHtml(microsequence.title) +
                    "</strong>" + renderState(microsequence.state) +
                    (microsequence.conflict
                      ? '<span class="authoring-sync-note is-conflict">Conflito · releitura necessária</span>'
                      : microsequence.pending
                        ? '<span class="authoring-sync-note">Alteração pendente</span>'
                        : "") + "</span>" +
                    (available ? icon("arrow-right", "authoring-card-arrow") : "") + "</button>"
                  );
                }).join("")
              : '<p class="authoring-empty">Nenhuma microssequência nesta Parte.</p>') +
            "</div>"
          : "") +
        "</article>"
      );
    }).join("") + "</section>"
  );
}

function renderScopeChooser(state) {
  if (state.selectedMicrosequence) return "";
  return (
    '<div class="authoring-empty authoring-scope-empty">' + icon("microsequence") +
    '<p>Escolha uma microssequência no Mapa.</p>' +
    '<button class="authoring-text-button" type="button" data-authoring-destination="map">Abrir Mapa</button>' +
    "</div>"
  );
}

function renderParameter(parameter, designConflict = false) {
  const editable = parameter.editable && !designConflict;
  const buttonAttributes = editable
    ? ' data-authoring-action="edit-parameter" data-parameter-key="' + escapeHtml(parameter.key) + '"'
    : ' disabled aria-disabled="true"';
  return (
    '<article class="authoring-parameter-wrap' + (parameter.conflict ? " is-conflict" : "") + '">' +
    '<button class="authoring-parameter" type="button"' + buttonAttributes + '>' +
    '<span class="authoring-parameter-copy"><strong>' + escapeHtml(parameter.label) + "</strong>" +
    '<span class="authoring-parameter-origin">' + escapeHtml(parameter.sourceLabel) + "</span></span>" +
    '<span class="authoring-parameter-value">' + escapeHtml(parameter.valueText) +
    (parameter.unitLabel ? '<small>' + escapeHtml(parameter.unitLabel) + "</small>" : "") + "</span>" +
    (parameter.locked ? icon("key", "authoring-lock-icon") :
      parameter.conflict ? icon("review", "authoring-lock-icon") :
        editable ? icon("arrow-right", "authoring-card-arrow") : "") +
    (parameter.conflict
      ? '<span class="sr-only">Conflito de alteração</span>'
      : parameter.pending ? '<span class="sr-only">Alteração pendente</span>' : "") +
    "</button>" +
    (parameter.conflict
      ? '<div class="authoring-conflict-actions" role="group" aria-label="Resolver conflito de ' +
        escapeHtml(parameter.label) + '">' +
        '<span>Outra versão foi salva.</span>' +
        '<button class="authoring-text-button" type="button" data-authoring-action="retry-parameter-change"' +
        ' data-parameter-key="' + escapeHtml(parameter.key) + '"' +
        (parameter.pendingRequestId ? "" : " disabled") + '>Tentar novamente</button>' +
        '<button class="authoring-text-button" type="button" data-authoring-action="discard-parameter-change"' +
        ' data-parameter-key="' + escapeHtml(parameter.key) + '"' +
        (parameter.pendingRequestId ? "" : " disabled") + '>Descartar alteração local</button>' +
        "</div>"
      : "") +
    "</article>"
  );
}

function renderDesign(state) {
  if (!state.selectedMicrosequence) return renderScopeChooser(state);
  if (state.designLoading && !state.design) return renderLoading("Carregando desenho…");
  if (!state.design) {
    return '<div class="authoring-empty"><p>O desenho ainda não está disponível.</p></div>';
  }
  const design = state.design;
  return (
    '<section class="authoring-design" aria-labelledby="authoring-destination-title">' +
    '<header class="authoring-scope-heading"><span>' + icon("microsequence") + "</span><div><h3>" +
    escapeHtml(design.scopeTitle || state.selectedMicrosequence.title) +
    '</h3><p>Valores efetivos</p></div></header>' +
    '<div class="authoring-parameter-list">' +
    (design.parameters.length
      ? design.parameters.map((parameter) => renderParameter(parameter, design.conflict)).join("")
      : '<p class="authoring-empty">Nenhum parâmetro aplicável.</p>') +
    "</div>" +
    '<button class="authoring-resources-summary" type="button"' +
    (state.resourcesAvailable && design.resources.editable && !design.conflict
      ? ' data-authoring-action="open-resources"'
      : ' disabled aria-disabled="true"') + '>' +
    '<span>' + icon("folder") + '<span><strong>Resources</strong><small>' +
    escapeHtml(design.resources.summary) + "</small></span></span>" +
    (state.resourcesAvailable && design.resources.editable && !design.conflict
      ? icon("arrow-right", "authoring-card-arrow")
      : icon("key", "authoring-lock-icon")) +
    "</button>" +
    "</section>"
  );
}

function renderContent(state) {
  if (!state.selectedMicrosequence) return renderScopeChooser(state);
  return (
    '<section class="authoring-content-link" aria-labelledby="authoring-destination-title">' +
    '<div class="authoring-content-symbol">' + icon("card") + "</div>" +
    '<h3>' + escapeHtml(state.selectedMicrosequence.title) + "</h3>" +
    '<p>Abra o conteúdo no leitor atual.</p>' +
    '<button class="open-main authoring-open-content" type="button"' +
    ' data-authoring-action="open-content" title="Abrir conteúdo" aria-label="Abrir conteúdo">' +
    icon("play") + "</button></section>"
  );
}

const SEVERITY_LABELS = Object.freeze({
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica"
});

const FINDING_STATUS_LABELS = Object.freeze({
  open: "Aguardando decisão",
  approved: "Aprovado para reparo",
  rejected: "Rejeitado",
  repaired: "Reparado · falta reauditar",
  resolved: "Resolvido após reauditoria"
});

const FINDING_ORIGIN_LABELS = Object.freeze({
  deterministic: "Verificação do sistema",
  semantic_audit: "Revisão instrucional",
  legacy: "Revisão anterior"
});

const FINDING_CODE_LABELS = Object.freeze({
  actual_cards_match_artifact_refs: "Cards coerentes com os artefatos registrados",
  actual_resources_match_manifest: "Resources coerentes com a materialização registrada",
  actual_resources_preserve_resource_set_condition: "Resources coerentes com a condição disponível",
  applicable_explanation_coverage: "Cobertura das explicações necessárias",
  blueprint_contract: "Integridade do plano de construção",
  card_role_matches_materialized_step: "Papel do card coerente com o passo construído",
  declared_distinct_practice_range: "Variedade de prática planejada",
  evidence_requirement_coverage: "Cobertura das evidências necessárias",
  instructional_contract_bundle: "Integridade dos contratos instrucionais",
  manifest_tracks_current_materialization: "Registro coerente com o conteúdo corrente",
  materialized_card_contracts: "Integridade dos cards construídos",
  new_units_per_theory_step_ceiling: "Limite de novidades por passo de teoria",
  part_microsequence_audit_coverage: "Cobertura da auditoria na Parte",
  planned_materialized_alignment: "Alinhamento entre planejamento e conteúdo",
  practice_after_required_theory: "Prática depois da fundamentação necessária",
  research_lock_preserved: "Condição de pesquisa preservada",
  semantic_excessive_compression: "Conteúdo comprimido em excesso",
  semantic_explanation_only_mentioned: "Explicação apenas mencionada",
  semantic_practice_operation_mismatch: "Prática desalinhada à operação pretendida",
  semantic_representation_mismatch: "Representação inadequada ao conteúdo",
  simultaneous_new_units_per_coordination_set_ceiling: "Limite de novidades simultâneas"
});

const AUDIT_STATUS = Object.freeze({
  conformant: Object.freeze({ label: "Conforme", icon: "ready-state" }),
  finding: Object.freeze({ label: "Com achado", icon: "review" }),
  not_checked: Object.freeze({ label: "Não verificada", icon: "draft-state" })
});

function readableIdentifier(value) {
  const normalized = String(value || "").trim().replaceAll(/[_-]+/gu, " ").replaceAll(/\s+/gu, " ");
  return normalized ? normalized.replace(/^./u, (character) => character.toLocaleUpperCase("pt-BR")) : "Critério registrado";
}

function findingCodeLabel(value) {
  return FINDING_CODE_LABELS[String(value || "").trim()] || readableIdentifier(value);
}

function renderAuditSummary(summary, { part = false } = {}) {
  const dimensions = (summary?.dimensions || []).filter((item) => part || item.partOnly !== true);
  if (!dimensions.length) return "";
  return (
    '<ul class="authoring-audit-summary" aria-label="Resumo da auditoria">' +
    dimensions.map((dimension) => {
      const status = AUDIT_STATUS[dimension.status] || AUDIT_STATUS.not_checked;
      const count = dimension.status === "finding" && dimension.findingCount > 0
        ? ` · ${dimension.findingCount}`
        : "";
      return '<li class="is-' + escapeHtml(dimension.status) + '">' + icon(status.icon) +
        '<span><strong>' + escapeHtml(dimension.label) + '</strong><small>' +
        escapeHtml(status.label + count) + "</small></span></li>";
    }).join("") + "</ul>"
  );
}

function findingWithinPart(finding, part) {
  const target = finding.readerTarget?.entityPath || finding.entityPath;
  return finding.auditPartId === part.coordinationPartId ||
    finding.auditPartId === part.partId || (Array.isArray(target) && part.microsequences.some(
    (microsequence) => Array.isArray(microsequence.entityPath) && microsequence.entityPath.every(
      (entry, index) => target[index] === entry
    )
  ));
}

function renderAuditPartList(state) {
  if (state.selectedMicrosequence || state.auditPartId || !state.overview?.parts.length) return "";
  const parts = state.overview.parts.filter((part) => part.coordinationPartId);
  if (!parts.length) return "";
  return (
    '<section class="authoring-audit-parts" aria-labelledby="authoring-audit-parts-title">' +
    '<h3 id="authoring-audit-parts-title">Por Parte</h3><div>' + parts.map((part) => {
      const findings = state.overview.findings.filter((finding) => findingWithinPart(finding, part));
      const summary = part.auditSummary;
      const checked = summary?.dimensions?.filter(({ partOnly }) => partOnly !== true) || [];
      const conformant = checked.filter(({ status }) => status === "conformant").length;
      const notChecked = checked.every(({ status }) => status === "not_checked");
      const label = findings.length
        ? `${findings.length}${state.overview.findingsTruncated ? "+" : ""} ${findings.length === 1 ? "achado" : "achados"}`
        : state.overview.findingsTruncated
          ? "Resumo parcial"
          : !part.auditRunRef || notChecked ? "Ainda não verificada" : `${conformant} verificações conformes`;
      return '<button type="button" data-authoring-action="open-audit-part" data-part-id="' +
        escapeHtml(part.partId) + '"' + (state.loading ? " disabled" : "") + '><span><strong>' +
        escapeHtml(part.title) + '</strong><small>' +
        escapeHtml(label) + '</small></span>' + icon("arrow-right", "authoring-card-arrow") + "</button>";
    }).join("") + "</div></section>"
  );
}

function renderAuditComponents(state, part) {
  const components = state.auditSlice?.components;
  if (!part || !components || (!components.items.length && !components.count)) return "";
  const rows = components.items.map((component, index) => {
    const microsequence = part.microsequences.find((item) => (
      item.key === component.microsequenceRef ||
      item.entityPath?.[3] === component.microsequenceRef ||
      (Array.isArray(component.microsequencePath) && Array.isArray(item.entityPath) &&
        component.microsequencePath.every((entry, pathIndex) => item.entityPath[pathIndex] === entry))
    ));
    const available = Boolean(
      microsequence && component.status === "complete" && component.targetAvailable !== false &&
      component.childAuditRunRef && Array.isArray(microsequence.entityPath)
    );
    const status = component.targetAvailable === false
      ? { key: "missing", label: "Conteúdo indisponível", icon: "remove-state" }
      : available
        ? { key: "ready", label: "Auditoria disponível", icon: "ready-state" }
        : component.status === "complete"
          ? { key: "missing", label: "Rodada indisponível", icon: "remove-state" }
        : { key: "planned", label: "Ainda não auditada", icon: "draft-state" };
    return '<button type="button" class="authoring-audit-component" data-component-index="' + index + '"' +
      (available ? ' data-authoring-action="open-audit-component"' : ' disabled aria-disabled="true"') + '>' +
      '<span><strong>' + escapeHtml(microsequence?.title || "Microssequência indisponível") + "</strong>" +
      renderState(status) + "</span>" + (available ? icon("arrow-right", "authoring-card-arrow") : "") +
      "</button>";
  });
  const shown = components.items.length;
  const total = Math.max(shown, components.count);
  return (
    '<section class="authoring-audit-components" aria-labelledby="authoring-audit-components-title">' +
    '<header><h3 id="authoring-audit-components-title" class="authoring-audit-components-heading" tabindex="-1">' +
    'Microssequências da Parte</h3><span>' + escapeHtml(components.truncated
      ? `${shown} de ${total}`
      : `${total}`) + "</span></header>" +
    '<div class="authoring-audit-component-list">' + rows.join("") + "</div>" +
    (components.truncated && components.nextCursor != null
      ? '<button class="authoring-text-button" type="button" data-authoring-action="load-more-audit-components"' +
        (state.auditComponentsLoading || state.loading ? " disabled" : "") + '>' +
        (state.auditComponentsLoading ? "Carregando…" : "Carregar mais microssequências") + "</button>"
      : "") +
    "</section>"
  );
}

function renderAudit(state) {
  const overview = state.overview;
  if (!overview) return renderLoading("Carregando auditoria…");
  const selectedPath = state.selectedMicrosequence?.entityPath;
  const selectedPart = state.auditPartId
    ? overview.parts.find((part) => part.partId === state.auditPartId)
    : null;
  const scoped = Boolean(selectedPart || selectedPath);
  const findings = scoped && state.auditSlice
    ? state.auditSlice.findings
    : selectedPart
      ? overview.findings.filter((finding) => findingWithinPart(finding, selectedPart))
      : selectedPath
        ? overview.findings.filter((finding) => {
            const target = finding.readerTarget?.entityPath;
            return Array.isArray(target) && selectedPath.every((value, index) => target[index] === value);
          })
        : overview.findings;
  const scopedTotal = scoped && state.auditSlice
    ? Math.max(findings.length, state.auditSlice.total)
    : findings.length;
  const knownCount = scoped ? scopedTotal : Math.max(findings.length, overview.findingsTotal);
  const hasMore = scoped && state.auditSlice
    ? state.auditSlice.truncated
    : overview.findingsTruncated;
  const canLoadMore = hasMore && (scoped && state.auditSlice
    ? state.auditSlice.nextCursor != null
    : state.findingsAvailable && (!state.findingsPageLoaded || state.findingsNextCursor != null));
  const offlineLimited = scoped && state.auditSlice
    ? state.auditSlice.stale && hasMore && state.auditSlice.nextCursor == null
    : state.findingsOfflineLimited;
  const activeCount = scoped
    ? findings.filter(({ status }) => ["open", "approved", "repaired"].includes(status)).length
    : knownCount;
  const hasPending = activeCount > 0 || hasMore;
  const summary = state.auditSlice?.summary || selectedPart?.auditSummary ||
    state.selectedMicrosequence?.auditSummary || overview.audit?.summary;
  const run = state.auditSlice?.latestAuditRun || null;
  const runCompleted = run?.status === "complete";
  const runHistorical = runCompleted && run?.current !== true;
  const runPending = Boolean(run && !runCompleted);
  const countLabel = hasMore && activeCount === 0
    ? "Resumo incompleto"
    : `${activeCount}${hasMore ? "+" : ""} ${activeCount === 1 && !hasMore
      ? "achado pendente"
      : "achados pendentes"}`;
  return (
    '<section class="authoring-audit" aria-labelledby="authoring-destination-title">' +
    '<header class="authoring-audit-heading" tabindex="-1"><div><strong>' +
    (state.selectedMicrosequence
      ? escapeHtml(state.selectedMicrosequence.title)
      : selectedPart ? escapeHtml(selectedPart.title) : "Workspace") +
    '</strong><span>' + escapeHtml(
      runHistorical
        ? `${knownCount}${hasMore ? "+" : ""} ${knownCount === 1 && !hasMore
          ? "achado registrado"
          : "achados registrados"} · histórico`
      : hasPending
        ? countLabel
        : runCompleted
          ? "Sem achado ativo neste recorte"
          : runPending ? "Revisão instrucional pendente" : "Ainda não verificada"
    ) + "</span></div>" + renderState(runHistorical
      ? { key: "planned", label: "Rodada histórica", icon: "review" }
      : hasPending
        ? { key: "audit_pending", label: hasMore ? "Resumo incompleto" : "Auditoria pendente", icon: "review" }
        : runCompleted
        ? { key: "ready", label: "Auditoria concluída", icon: "ready-state" }
        : runPending
          ? { key: "building", label: "Auditoria em andamento", icon: "progress" }
        : { key: "planned", label: "Não verificada", icon: "draft-state" }) + "</header>" +
    (scoped
      ? '<button class="authoring-text-button authoring-clear-audit-scope" type="button"' +
        ' data-authoring-action="clear-audit-scope"' + (state.loading ? " disabled" : "") +
        '>' + escapeHtml(state.auditParentPartId ? "Voltar à Parte" : "Ver o workspace") + "</button>"
      : "") +
    (state.auditLoading ? renderLoading("Carregando evidências…") : renderAuditSummary(summary, { part: Boolean(selectedPart) })) +
    renderAuditPartList(state) +
    renderAuditComponents(state, selectedPart) +
    (findings.length
      ? '<div class="authoring-finding-list" aria-label="Achados">' +
        findings.map((finding) => (
          '<button class="authoring-finding" type="button" data-authoring-action="open-finding-detail"' +
          ' data-finding-id="' + escapeHtml(finding.findingId) + '"' + (state.loading ? " disabled" : "") + '>' +
          '<span class="authoring-finding-copy"><strong>' + escapeHtml(finding.summary) + "</strong>" +
          '<span>' + escapeHtml(FINDING_ORIGIN_LABELS[finding.origin] || FINDING_ORIGIN_LABELS.legacy) +
          ' · Gravidade ' + escapeHtml((SEVERITY_LABELS[finding.severity] || "Não classificada").toLocaleLowerCase("pt-BR")) +
          "</span>" + (finding.targetAvailable === false
            ? '<span class="authoring-finding-unavailable">Conteúdo indisponível</span>'
            : "") + "</span>" +
          icon("arrow-right", "authoring-card-arrow") +
          "</button>"
        )).join("") + "</div>"
      : hasMore
        ? '<div class="authoring-empty"><p>O resumo foi truncado; outros achados podem existir.</p></div>'
        : '<div class="authoring-empty"><p>' + (runCompleted
          ? "Nenhum achado ativo nesta rodada."
          : runPending
            ? "A rodada ainda não concluiu a revisão instrucional."
            : "Este recorte ainda não possui auditoria concluída.") + "</p></div>") +
    (hasMore && findings.length
      ? '<p class="authoring-audit-more">Lista resumida; outros achados podem existir fora deste recorte.</p>'
      : "") +
    (canLoadMore
      ? '<button class="authoring-text-button authoring-load-more-findings" type="button"' +
        ' data-authoring-action="load-more-findings"' +
        (state.findingsLoading || state.loading ? " disabled" : "") + '>' +
        (state.findingsLoading
          ? "Carregando…"
          : state.findingsPageLoaded ? "Carregar mais achados" : "Carregar achados") + "</button>"
      : offlineLimited
        ? '<p class="authoring-audit-more">Conecte-se para carregar os achados que não estão neste dispositivo.</p>'
        : "") +
    (state.auditOperational && state.auditActionCapabilities?.prepare &&
      findings.some(({ status, targetAvailable }) => status === "approved" && targetAvailable !== false)
      ? '<div class="authoring-audit-actions"><button class="authoring-apply-button" type="button"' +
        ' data-authoring-action="prepare-finding-repairs"' +
        (!state.auditActionsOnline || state.loading || !state.auditActionCapabilities?.prepare ? " disabled" : "") +
        '>Preparar reparos (' + escapeHtml(findings.filter(({ status, targetAvailable }) => (
          status === "approved" && targetAvailable !== false
        )).length) +
        ")</button>" + (!state.auditActionsOnline
          ? '<p role="note">Conecte-se para registrar decisões.</p>'
          : "") + "</div>"
      : "") +
    "</section>"
  );
}

function renderFindingProvenance(finding) {
  const artifacts = Object.entries(finding.artifactRefs || {});
  const artifactLabels = Object.freeze({
    analysisRef: "Análise instrucional",
    effectiveSnapshotRef: "Parâmetros efetivos",
    blueprintRef: "Blueprint",
    bindingRef: "Vínculo pedagógico",
    manifestRef: "Manifesto de materialização",
    effectiveResourceSetRefs: "Conjuntos de Resources",
    resourceSetRefs: "Conjuntos de Resources",
    microsequenceRefs: "Microssequências auditadas"
  });
  if (!finding.auditRunRef && finding.auditRevision == null && !artifacts.length) return "";
  return (
    '<details class="authoring-finding-provenance"><summary>Proveniência</summary><dl>' +
    (finding.auditRevision == null ? "" : '<div><dt>Revisão auditada</dt><dd>' +
      escapeHtml(finding.auditRevision) + "</dd></div>") +
    (finding.auditRunRef?.version ? '<div><dt>Protocolo da rodada</dt><dd>Versão ' +
      escapeHtml(finding.auditRunRef.version) + "</dd></div>" : "") +
    artifacts.map(([key, reference]) => {
      if (reference && !Array.isArray(reference) && Array.isArray(reference.items)) {
        const shown = reference.items.length;
        const total = Math.max(Number(reference.count) || 0, shown);
        const bounded = reference.truncated === true || total > shown;
        return '<div><dt>' + escapeHtml(artifactLabels[key] || readableIdentifier(key)) + '</dt><dd>' +
          escapeHtml(bounded ? `${shown} de ${total} registrados` : `${total} registrados`) + "</dd></div>";
      }
      const values = Array.isArray(reference) ? reference : [reference];
      const versions = values.map((item) => item?.version).filter(Boolean);
      return '<div><dt>' + escapeHtml(artifactLabels[key] || readableIdentifier(key)) + '</dt><dd>' +
        escapeHtml(versions.length ? `Versão ${versions.join(", ")}` : "Registrado") + "</dd></div>";
    }).join("") + "</dl></details>"
  );
}

function renderFindingDialog(state) {
  const finding = state.findingEditor;
  if (!finding) return "";
  const statusLabel = FINDING_STATUS_LABELS[finding.status] || "Estado registrado";
  const structuredRun = finding.legacyCompatible !== true;
  const runCurrentAndComplete = structuredRun
    ? state.findingAuditStatus === "complete" && state.auditOperational
    : true;
  const originRunComplete = state.overview?.stale !== true && (structuredRun
    ? ["complete", "historical"].includes(state.findingAuditStatus)
    : true);
  const canDecide = finding.targetAvailable !== false && finding.status === "open" && runCurrentAndComplete &&
    state.auditActionCapabilities?.decide;
  const part = state.overview?.parts.find((item) => item.partId === state.findingPartId);
  const canReaudit = finding.targetAvailable !== false && finding.status === "repaired" && originRunComplete &&
    !state.reauditBlockedByRepairs && state.auditActionCapabilities?.reaudit;
  const actionDisabled = state.loading || !state.auditActionsOnline;
  return (
    '<div class="authoring-dialog-backdrop authoring-finding-backdrop" data-authoring-action="close-finding-detail">' +
    '<section class="authoring-dialog authoring-finding-dialog" role="dialog" aria-modal="true"' +
    ' aria-labelledby="authoring-finding-title" data-authoring-dialog="finding">' +
    '<header><div><p>' + escapeHtml(FINDING_ORIGIN_LABELS[finding.origin] || FINDING_ORIGIN_LABELS.legacy) +
    '</p><h2 id="authoring-finding-title">' + escapeHtml(finding.summary) +
    '</h2></div><button class="icon-ghost" type="button" data-authoring-action="close-finding-detail"' +
    ' title="Fechar" aria-label="Fechar">' + icon("remove-state") + "</button></header>" +
    '<div class="authoring-dialog-content authoring-finding-detail">' +
    '<div class="authoring-finding-badges"><span>' + escapeHtml(statusLabel) + '</span><span>Gravidade ' +
    escapeHtml((SEVERITY_LABELS[finding.severity] || "Não classificada").toLocaleLowerCase("pt-BR")) +
    "</span></div>" +
    (finding.publicEvidence
      ? '<section><h3>Evidência</h3><p>' + escapeHtml(finding.publicEvidence) + "</p></section>"
      : '<p class="authoring-audit-more">A rodada anterior não registrou evidência pública separada.</p>') +
    (finding.ruleRef
      ? '<section><h3>Critério</h3><p>' + escapeHtml(findingCodeLabel(finding.ruleRef.id)) + "</p></section>"
      : "") +
    (finding.code
      ? '<p class="authoring-finding-type"><strong>Tipo</strong> ' + escapeHtml(findingCodeLabel(finding.code)) + "</p>"
      : "") +
    (finding.proposedRepair
      ? '<details class="authoring-finding-repair"><summary>Possível reparo</summary><p>' +
        escapeHtml(finding.proposedRepair) + "</p></details>"
      : "") +
    renderFindingProvenance(finding) +
    (finding.targetAvailable === false
      ? '<p class="authoring-finding-unavailable" role="note">O conteúdo original não está mais disponível.</p>'
      : '<button class="authoring-text-button authoring-open-finding-target" type="button"' +
        ' data-authoring-action="open-finding-target">Abrir conteúdo</button>') +
    (structuredRun && !runCurrentAndComplete
      ? '<p class="authoring-finding-run-note" role="note">' +
        (state.findingAuditStatus === "semantic_pending"
          ? "A revisão instrucional desta rodada ainda não terminou. Decida depois da conclusão."
          : state.findingAuditStatus === "stale"
            ? "Esta rodada está disponível somente para consulta offline. Reconecte e releia antes de decidir."
          : state.findingAuditStatus === "historical"
            ? "Esta rodada pertence a um estado anterior. Consulte-a como histórico e solicite uma nova auditoria antes de decidir."
          : "Abra a Parte ou microssequência desta rodada para confirmar sua conclusão antes de decidir.") +
        "</p>"
      : "") +
    (structuredRun && !runCurrentAndComplete && state.findingAuditStatus !== "historical" && state.findingScopeAction
      ? '<button class="authoring-text-button authoring-open-finding-run" type="button"' +
        ' data-authoring-action="open-finding-audit-scope"' +
        (state.auditLoading ? " disabled" : "") + '>' +
        escapeHtml(["semantic_pending", "stale"].includes(state.findingAuditStatus)
          ? "Atualizar rodada"
          : state.findingScopeAction.label) + "</button>"
      : "") +
    (finding.status === "repaired" && state.reauditBlockedByRepairs
      ? '<p class="authoring-finding-run-note" role="note">Conclua os outros reparos preparados antes de iniciar uma nova auditoria.</p>'
      : "") +
    (!state.auditActionsOnline && (canDecide || canReaudit)
      ? '<p class="authoring-finding-offline" role="note">Conecte-se para registrar esta decisão.</p>'
      : "") +
    '</div><footer class="authoring-finding-actions">' +
    (canDecide
      ? '<button type="button" class="authoring-secondary-button" data-authoring-action="decide-finding"' +
        ' data-finding-decision="rejected"' + (actionDisabled ? " disabled" : "") + '>Rejeitar</button>' +
        '<button type="button" class="authoring-apply-button" data-authoring-action="decide-finding"' +
        ' data-finding-decision="approved"' + (actionDisabled ? " disabled" : "") +
        '>Aprovar para reparo</button>'
      : canReaudit
        ? '<button type="button" class="authoring-apply-button" data-authoring-action="request-reaudit"' +
          (actionDisabled ? " disabled" : "") + '>Solicitar reauditoria ' +
          (part ? "da Parte" : "do workspace") + "</button>"
        : structuredRun && !runCurrentAndComplete
          ? '<span class="authoring-finding-state">' +
            escapeHtml(state.findingAuditStatus === "historical"
              ? "Rodada histórica"
              : "Auditoria ainda não confirmada") + "</span>"
          : finding.status === "repaired" && state.reauditBlockedByRepairs
            ? '<span class="authoring-finding-state">Outros reparos em andamento</span>'
        : '<span class="authoring-finding-state">' + escapeHtml(statusLabel) + "</span>") +
    "</footer></section></div>"
  );
}

function renderDestination(state) {
  if (state.destination === "design") return renderDesign(state);
  if (state.destination === "content") return renderContent(state);
  if (state.destination === "audit") return renderAudit(state);
  return renderMap(state);
}

function renderParameterDialog(state) {
  const parameter = state.parameterEditor;
  if (!parameter) return "";
  const hasRange = parameter.range.min !== null && parameter.range.max !== null;
  const draft = Number.isFinite(Number(state.parameterDraftValue))
    ? Number(state.parameterDraftValue)
    : parameter.range.min;
  return (
    '<div class="authoring-dialog-backdrop" data-authoring-action="close-parameter-editor">' +
    '<section class="authoring-dialog" role="dialog" aria-modal="true" aria-labelledby="authoring-parameter-title"' +
    ' data-authoring-dialog="parameter">' +
    '<header><div><h2 id="authoring-parameter-title">' + escapeHtml(parameter.label) +
    '</h2><p>' + escapeHtml(parameter.sourceLabel) + '</p></div><button class="icon-ghost" type="button"' +
    ' data-authoring-action="close-parameter-editor" title="Fechar" aria-label="Fechar">' +
    icon("remove-state") + "</button></header>" +
    '<div class="authoring-dialog-content">' +
    '<button class="authoring-auto-option' + (parameter.source === "auto" ? " is-selected" : "") +
    '" type="button" data-authoring-action="restore-parameter-auto">' +
    '<span><strong>Auto</strong><small>Usar o valor resolvido</small></span>' +
    (parameter.source === "auto" ? icon("ready-state") : "") + "</button>" +
    (parameter.options.length
      ? '<div class="authoring-option-grid" role="group" aria-label="Valores disponíveis">' +
        parameter.options.map((option, index) => (
          '<button type="button" data-authoring-action="set-parameter-option" data-option-index="' + index + '">' +
          escapeHtml(option.label) + "</button>"
        )).join("") + "</div>"
      : "") +
    (hasRange
      ? '<div class="authoring-stepper" role="group" aria-label="Ajustar valor">' +
        '<button class="icon-ghost" type="button" data-authoring-action="step-parameter" data-step-direction="-1"' +
        (draft <= parameter.range.min ? " disabled" : "") + ' title="Diminuir" aria-label="Diminuir">' +
        icon("remove-state") + "</button>" +
        '<output aria-live="polite">' + escapeHtml(draft) +
        (parameter.unitLabel ? '<small>' + escapeHtml(parameter.unitLabel) + "</small>" : "") + "</output>" +
        '<button class="icon-ghost" type="button" data-authoring-action="step-parameter" data-step-direction="1"' +
        (draft >= parameter.range.max ? " disabled" : "") + ' title="Aumentar" aria-label="Aumentar">' +
        icon("add") + "</button></div>" +
        '<button class="authoring-apply-button" type="button" data-authoring-action="apply-parameter-step">Aplicar</button>'
      : "") +
    "</div></section></div>"
  );
}

function renderResourceSetChoices(editor, disabled = false) {
  if (!editor.setChoices?.length) return "";
  return (
    '<section class="authoring-resource-sets" aria-labelledby="authoring-resource-set-title">' +
    '<h3 id="authoring-resource-set-title">Conjunto</h3>' +
    '<div role="radiogroup" aria-label="Conjunto de Resources">' +
    editor.setChoices.map((choice, index) => {
      const selected = choice.key === editor.selectedSetKey && !editor.requiresSetChoice;
      return (
        '<button type="button" role="radio" aria-checked="' + String(selected) + '"' +
        (disabled ? " disabled" : "") +
        ' class="authoring-resource-set-choice' + (selected ? " is-selected" : "") + '"' +
        ' data-authoring-action="select-resource-set" data-set-choice-index="' + index + '">' +
        '<span>' + escapeHtml(choice.label) + "</span>" + (selected ? icon("ready-state") : "") + "</button>"
      );
    }).join("") + "</div></section>"
  );
}

function renderResourceFacets(editor, disabled = false) {
  if (!editor.facets?.length) return "";
  const selectedCount = Object.values(editor.facetSelections || {}).reduce(
    (total, selection) => total + (selection instanceof Set ? selection.size : 0),
    0
  );
  return (
    '<section class="authoring-resource-facets">' +
    '<button class="authoring-resource-facets-toggle" type="button"' +
    (disabled ? " disabled" : "") +
    ' data-authoring-action="toggle-resource-facets" aria-expanded="' + String(editor.facetsOpen) + '">' +
    '<span><small>Explorar por</small><strong>Famílias e facetas' +
    (selectedCount ? " · " + escapeHtml(selectedCount) : "") + "</strong></span>" +
    icon(editor.facetsOpen ? "arrow-up" : "arrow-right") + "</button>" +
    (editor.facetsOpen
      ? '<div class="authoring-resource-facet-groups">' + editor.facets.map((group, groupIndex) => {
          const selection = editor.facetSelections?.[group.requestKey];
          const groupCount = selection instanceof Set ? selection.size : 0;
          return (
            '<details class="authoring-resource-facet-group"' + (groupCount ? " open" : "") + ">" +
            '<summary>' + escapeHtml(group.label) + (groupCount ? " · " + escapeHtml(groupCount) : "") +
            "</summary><div>" + group.options.map((option, optionIndex) => (
              '<label><input type="checkbox" data-resource-facet-group-index="' + groupIndex +
              '" data-resource-facet-option-index="' + optionIndex + '"' +
              (disabled ? " disabled" : "") +
              (selection?.has(option.key) ? " checked" : "") + '><span>' + escapeHtml(option.label) +
              (option.count === null ? "" : " <small>(" + escapeHtml(option.count) + ")</small>") +
              "</span></label>"
            )).join("") + "</div></details>"
          );
        }).join("") + "</div>"
      : "") +
    "</section>"
  );
}

function normalizedSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function renderResourceScope(editor, disabled = false) {
  const scopes = editor.resourceScopes?.filter((scope) => scope.available) || [];
  if (!scopes.length) return "";
  const selectedScope = scopes.find((scope) => scope.key === editor.scopeKey) || scopes[0];
  const selectedSourceIndex = editor.resourceScopes.indexOf(selectedScope);
  const targetQuery = normalizedSearchText(editor.targetQuery);
  const matchingTargets = selectedScope.key === "microsequence_set"
    ? selectedScope.targets.map((target, index) => ({ target, index })).filter(({ target }) => (
        !targetQuery || normalizedSearchText(target.label).includes(targetQuery)
      ))
    : [];
  const visibleTargets = matchingTargets.slice(0, editor.targetVisibleLimit || 24);
  return (
    '<section class="authoring-resource-scope">' +
    '<button class="authoring-resource-scope-toggle" type="button"' +
    (disabled ? " disabled" : "") +
    ' data-authoring-action="toggle-resource-scope" aria-expanded="' + String(editor.scopeOpen) + '">' +
    '<span><small>Aplicar em</small><strong>' + escapeHtml(selectedScope.label) + "</strong></span>" +
    icon(editor.scopeOpen ? "arrow-up" : "arrow-right") + "</button>" +
    (editor.scopeOpen
      ? '<div class="authoring-resource-scope-options" role="radiogroup" aria-label="Escopo de aplicação">' +
        scopes.map((scope) => {
          const index = editor.resourceScopes.indexOf(scope);
          const selected = index === selectedSourceIndex;
          return (
            '<button type="button" role="radio" aria-checked="' + String(selected) + '"' +
            (disabled ? " disabled" : "") +
            ' data-authoring-action="select-resource-scope" data-authoring-resource-scope-index="' + index + '"' +
            ' class="' + (selected ? "is-selected" : "") + '">' +
            '<span>' + escapeHtml(scope.label) + "</span>" + (selected ? icon("ready-state") : "") + "</button>"
          );
        }).join("") + "</div>"
      : "") +
    (editor.scopeOpen && selectedScope.key === "microsequence_set"
      ? '<div class="authoring-resource-target-picker">' +
        '<label class="authoring-resource-target-search">' + icon("search") +
        '<input type="search" value="' + escapeHtml(editor.targetQuery || "") +
        '"' + (disabled ? " disabled" : "") +
        ' placeholder="Localizar microssequência" aria-label="Localizar microssequência"' +
        ' data-authoring-resource-target-search></label>' +
        '<p class="authoring-resource-target-count">' + escapeHtml(editor.targetSelections.size) +
        " escolhida(s) · " + escapeHtml(matchingTargets.length) + " encontrada(s)</p>" +
        '<div class="authoring-resource-targets" role="group" aria-label="Microssequências escolhidas">' +
        (visibleTargets.length
          ? visibleTargets.map(({ target, index }) => (
              '<label><input type="checkbox" data-resource-target-index="' + index + '"' +
              (disabled ? " disabled" : "") +
              (editor.targetSelections.has(target.key) ? " checked" : "") + '><span>' +
              escapeHtml(target.label) + "</span></label>"
            )).join("")
          : '<p class="authoring-empty">Nenhuma microssequência encontrada.</p>') +
        "</div>" +
        (visibleTargets.length < matchingTargets.length
          ? '<button class="authoring-text-button" type="button"' +
            (disabled ? " disabled" : "") +
            ' data-authoring-action="load-more-resource-targets">Ver mais microssequências</button>'
          : "") +
        "</div>"
      : "") +
    "</section>"
  );
}

function renderResourcesDialog(state) {
  const editor = state.resourceEditor;
  if (!editor) return "";
  const awaitingSetChoice = editor.requiresSetChoice;
  const frozen = state.loading || Boolean(editor.recovery);
  return (
    '<div class="authoring-dialog-backdrop" data-authoring-action="close-resources">' +
    '<section class="authoring-dialog authoring-resources-dialog" role="dialog" aria-modal="true"' +
    ' aria-labelledby="authoring-resources-title" data-authoring-dialog="resources">' +
    '<header><div><h2 id="authoring-resources-title">Resources</h2><p>' +
    escapeHtml(editor.summary || state.design?.resources.summary || "") +
    '</p></div><button class="icon-ghost" type="button" data-authoring-action="close-resources"' +
    (state.loading ? " disabled" : "") +
    ' title="Fechar" aria-label="Fechar">' + icon("remove-state") + "</button></header>" +
    '<div class="authoring-dialog-content">' +
    renderResourceSetChoices(editor, frozen) +
    (awaitingSetChoice
      ? '<p class="authoring-resource-guidance">Escolha qual conjunto deseja ajustar. Nenhum conjunto foi combinado automaticamente.</p>'
      : '<label class="authoring-resource-search">' + icon("search") +
        '<input type="search" value="' + escapeHtml(editor.query || "") +
        '"' + (frozen ? " disabled" : "") +
        ' placeholder="Pesquisar Resources" aria-label="Pesquisar Resources" data-authoring-resource-search></label>') +
    (!awaitingSetChoice ? renderResourceFacets(editor, frozen) : "") +
    (editor.limitation
      ? '<p class="authoring-resource-limitation" role="note">' + escapeHtml(editor.limitation) + "</p>"
      : "") +
    (editor.loading
      ? renderLoading("Carregando Resources…")
      : awaitingSetChoice
        ? ""
        : editor.items?.length
        ? '<div class="authoring-resource-list" role="group" aria-label="Resources disponíveis">' +
          editor.items.map((item, index) => (
            '<label class="authoring-resource-option"><input type="checkbox" data-resource-index="' + index + '"' +
            (frozen ? " disabled" : "") +
            (item.selected ? " checked" : "") + '><span><strong>' + escapeHtml(item.label) + "</strong>" +
            (item.familyLabel ? '<small>' + escapeHtml(item.familyLabel) + "</small>" : "") +
            "</span></label>"
          )).join("") + "</div>"
        : '<p class="authoring-empty">Nenhum Resource encontrado.</p>') +
    (!awaitingSetChoice && editor.nextCursor
      ? '<button class="authoring-text-button" type="button" data-authoring-action="load-more-resources"' +
        (frozen ? " disabled" : "") + '>Ver mais</button>'
      : "") +
    (!awaitingSetChoice ? renderResourceScope(editor, frozen) : "") +
    (editor.resultMessage
      ? '<p class="authoring-resource-result" role="status">' + escapeHtml(editor.resultMessage) + "</p>"
      : "") +
    (editor.recovery
      ? '<div class="authoring-resource-recovery"><p>' + escapeHtml(editor.recovery.message) + '</p>' +
        '<button class="authoring-text-button" type="button" data-authoring-action="retry-resources"' +
        (state.loading ? " disabled" : "") + '>' +
        "Tentar concluir</button></div>"
      : "") +
    (!awaitingSetChoice && Number(editor.selectedCount) === 0
      ? '<p class="authoring-resource-guidance" role="note">Escolha ao menos um Resource.</p>'
      : "") +
    '<footer class="authoring-resource-actions"><span>' + escapeHtml(editor.selectedCount || 0) +
    ' selecionados</span><button class="authoring-apply-button" type="button"' +
    ' data-authoring-action="save-resources"' + (editor.canSave && !frozen ? "" : " disabled") +
    '>Aplicar</button></footer>' +
    "</div></section></div>"
  );
}

function renderStatus(state) {
  if (!state.statusMessage && !state.errorMessage) return "";
  return (
    '<div class="authoring-status' + (state.errorMessage ? " is-error" : "") + '" role="' +
    (state.errorMessage ? "alert" : "status") + '" aria-live="polite">' +
    '<span>' + escapeHtml(state.errorMessage || state.statusMessage) + "</span>" +
    ((state.overview?.conflict || state.design?.conflict)
      ? '<button class="authoring-text-button" type="button" data-authoring-action="reload-current">Reler</button>'
      : "") + "</div>"
  );
}

function renderWorkspace(state, destinations) {
  const overview = state.overview;
  const title = overview?.title || state.workspaceTitle || "Workspace";
  const destination = destinations.find((item) => item.key === state.destination) || destinations[0];
  return (
    '<section class="authoring-screen authoring-workspace-screen">' +
    '<header class="authoring-workspace-header">' +
    '<button class="icon-ghost" type="button" data-authoring-action="back-to-workspaces"' +
    ' title="Voltar aos workspaces" aria-label="Voltar aos workspaces">' + icon("arrow-left") + "</button>" +
    '<div class="authoring-workspace-title"><h1>' + escapeHtml(title) + "</h1>" +
    (overview ? renderState(overview.state) : "") + "</div>" +
    '<div class="authoring-workspace-header-actions">' +
    '<button class="icon-ghost" type="button" data-authoring-action="open-settings"' +
    ' title="Conta e aparência" aria-label="Conta e aparência">' + icon("more") + "</button>" +
    '<button class="icon-ghost" type="button" data-authoring-action="close" title="Abrir Estudo"' +
    ' aria-label="Abrir Estudo">' + icon("trail") + "</button></div></header>" +
    '<div class="authoring-workspace-layout">' +
    renderWorkspaceNavigation(state, destinations) +
    '<main class="authoring-destination" role="tabpanel" aria-labelledby="authoring-destination-title">' +
    '<h2 id="authoring-destination-title" class="authoring-destination-title">' +
    escapeHtml(destination.label) + "</h2>" +
    (state.loading && !overview ? renderLoading("Carregando workspace…") : renderDestination(state)) +
    "</main></div>" +
    renderStatus(state) + renderParameterDialog(state) + renderResourcesDialog(state) +
    renderFindingDialog(state) +
    "</section>"
  );
}

export function renderAuthoringWorkspaceSurface(state, destinations) {
  return state.workspaceId ? renderWorkspace(state, destinations) : renderLanding(state);
}
