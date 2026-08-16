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

function renderAudit(state) {
  const overview = state.overview;
  if (!overview) return renderLoading("Carregando auditoria…");
  const selectedPath = state.selectedMicrosequence?.entityPath;
  const findings = selectedPath
    ? overview.findings.filter((finding) => {
        const target = finding.readerTarget?.entityPath;
        if (!Array.isArray(target)) return false;
        const comparable = target.slice(0, Math.min(target.length, selectedPath.length));
        return comparable.every((value, index) => selectedPath[index] === value);
      })
    : overview.findings;
  const knownCount = selectedPath ? findings.length : Math.max(findings.length, overview.findingsTotal);
  const hasMore = overview.findingsTruncated;
  const canLoadMore = state.findingsAvailable && hasMore &&
    (!state.findingsPageLoaded || state.findingsNextCursor != null);
  const hasPending = knownCount > 0 || hasMore;
  const countLabel = hasMore && knownCount === 0
    ? "Resumo incompleto"
    : `${knownCount}${hasMore ? "+" : ""} ${knownCount === 1 && !hasMore ? "achado" : "achados"}`;
  return (
    '<section class="authoring-audit" aria-labelledby="authoring-destination-title">' +
    '<header class="authoring-audit-heading" tabindex="-1"><div><strong>' +
    (state.selectedMicrosequence ? escapeHtml(state.selectedMicrosequence.title) : "Workspace") +
    '</strong><span>' + escapeHtml(
      hasPending
        ? countLabel
        : "Sem pendência estrutural"
    ) + "</span></div>" + renderState(hasPending
      ? { key: "audit_pending", label: hasMore ? "Resumo incompleto" : "Auditoria pendente", icon: "review" }
      : { key: "ready", label: "Sem pendência corrente", icon: "ready-state" }) + "</header>" +
    (selectedPath
      ? '<button class="authoring-text-button authoring-clear-audit-scope" type="button"' +
        ' data-authoring-action="clear-audit-scope">Ver todos os achados</button>'
      : "") +
    (findings.length
      ? '<div class="authoring-finding-list" aria-label="Achados">' +
        findings.map((finding) => (
          '<button class="authoring-finding" type="button"' +
          (finding.targetAvailable === false
            ? ' disabled aria-disabled="true"'
            : ' data-authoring-action="open-finding"') +
          ' data-finding-id="' + escapeHtml(finding.findingId) + '">' +
          '<span class="authoring-finding-copy"><strong>' + escapeHtml(finding.summary) + "</strong>" +
          '<span>Gravidade ' + escapeHtml((SEVERITY_LABELS[finding.severity] || "Não classificada").toLocaleLowerCase("pt-BR")) +
          "</span>" + (finding.targetAvailable === false
            ? '<span class="authoring-finding-unavailable">Conteúdo indisponível</span>'
            : "") + "</span>" +
          icon(finding.targetAvailable === false ? "remove-state" : "arrow-right", "authoring-card-arrow") +
          "</button>"
        )).join("") + "</div>"
      : hasMore
        ? '<div class="authoring-empty"><p>O resumo foi truncado; outros achados podem existir.</p></div>'
        : '<div class="authoring-empty"><p>Nenhum achado ativo.</p></div>') +
    (hasMore && findings.length
      ? '<p class="authoring-audit-more">Lista resumida; outros achados podem existir fora deste recorte.</p>'
      : "") +
    (canLoadMore
      ? '<button class="authoring-text-button authoring-load-more-findings" type="button"' +
        ' data-authoring-action="load-more-findings"' + (state.findingsLoading ? " disabled" : "") + '>' +
        (state.findingsLoading
          ? "Carregando…"
          : state.findingsPageLoaded ? "Carregar mais achados" : "Carregar achados") + "</button>"
      : state.findingsOfflineLimited
        ? '<p class="authoring-audit-more">Conecte-se para carregar os achados que não estão neste dispositivo.</p>'
        : "") +
    "</section>"
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
    "</section>"
  );
}

export function renderAuthoringWorkspaceSurface(state, destinations) {
  return state.workspaceId ? renderWorkspace(state, destinations) : renderLanding(state);
}
