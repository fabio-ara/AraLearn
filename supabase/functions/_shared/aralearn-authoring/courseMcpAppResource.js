export const COURSE_MCP_APP_RESOURCE_URI =
  "ui://aralearn/course-inspector/0.0.23.html";
export const COURSE_MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

const PUBLISHED_APP_ORIGIN = "https://fabio-ara.github.io";
const PUBLISHED_APP_BASE = `${PUBLISHED_APP_ORIGIN}/AraLearn`;
const PUBLISHED_RENDERER =
  `${PUBLISHED_APP_BASE}/src/render/renderPackageStudyUnit.js?v=0.0.23`;
const PUBLISHED_REGISTRY =
  `${PUBLISHED_APP_BASE}/src/resources/packages/index.js?v=0.0.23`;

const COURSE_MCP_APP_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Inspeção do Curso no AraLearn</title>
  <link rel="stylesheet" href="${PUBLISHED_APP_BASE}/styles-tokens.css?v=0.0.23">
  <link rel="stylesheet" href="${PUBLISHED_APP_BASE}/styles.css?v=0.0.23">
  <style>
    :root {
      color-scheme: light dark;
      --mcp-host-safe-top: 0px;
      --mcp-host-safe-right: 0px;
      --mcp-host-safe-bottom: 0px;
      --mcp-host-safe-left: 0px;
      font-family: var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      background: var(--surface-canvas, var(--color-background-primary, Canvas));
      color: var(--text-primary, var(--color-text-primary, CanvasText));
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 0; background: transparent; }
    main { display: grid; gap: 1rem; padding: max(.75rem, env(safe-area-inset-top), var(--mcp-host-safe-top)) max(.75rem, env(safe-area-inset-right), var(--mcp-host-safe-right)) max(.75rem, env(safe-area-inset-bottom), var(--mcp-host-safe-bottom)) max(.75rem, env(safe-area-inset-left), var(--mcp-host-safe-left)); }
    h1, h2, p { margin-block: 0; }
    h1 { font-size: 1.15rem; line-height: 1.3; }
    h2 { font-size: 1rem; line-height: 1.35; }
    .mcp-app-context { color: var(--text-secondary, #5f6368); font-size: .875rem; line-height: 1.45; }
    .mcp-app-notice { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: .75rem; padding: .75rem; line-height: 1.45; }
    .mcp-app-notice[role="alert"] { border-color: #b42318; }
    .mcp-app-section { display: grid; gap: .75rem; min-width: 0; }
    .mcp-app-bars { display: grid; gap: .55rem; margin: 0; padding: 0; list-style: none; }
    .mcp-app-bar { display: grid; grid-template-columns: minmax(7rem, 1fr) minmax(5rem, 2fr) auto; gap: .5rem; align-items: center; }
    .mcp-app-bar-track { height: .75rem; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, currentColor 12%, transparent); }
    .mcp-app-bar-value { display: block; height: 100%; min-width: 2px; border-radius: inherit; background: var(--action-primary, #3b63dd); }
    .mcp-app-table-wrap { max-width: 100%; overflow-x: auto; border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: .75rem; }
    table { width: 100%; border-collapse: collapse; font-size: .875rem; }
    th, td { padding: .55rem .65rem; text-align: left; vertical-align: top; border-block-end: 1px solid color-mix(in srgb, currentColor 12%, transparent); }
    th { font-weight: 650; }
    tr:last-child > * { border-block-end: 0; }
    .mcp-app-study-unit { min-width: 0; overflow: clip; }
    .mcp-app-study-unit .card { margin: 0; max-width: 100%; }
    .mcp-app-link { width: fit-content; color: var(--action-primary, #3159c7); text-underline-offset: .18em; }
    .mcp-app-empty { color: var(--text-secondary, #5f6368); }
    @media (max-width: 430px) {
      main { padding-inline: max(.625rem, env(safe-area-inset-left), var(--mcp-host-safe-left)) max(.625rem, env(safe-area-inset-right), var(--mcp-host-safe-right)); }
      .mcp-app-bar { grid-template-columns: minmax(6.5rem, 1fr) minmax(3.5rem, 1.4fr) auto; font-size: .82rem; }
      th, td { padding: .5rem; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
  </style>
</head>
<body>
  <main id="app" aria-live="polite">
    <p class="mcp-app-empty">Aguardando o resultado autorizado do AraLearn.</p>
  </main>
  <script type="module">
    const app = document.getElementById("app");
    const pending = new Map();
    const TEXT_ONLY_PACKAGE_IDS = new Set([
      "aralearn.resource.bpmn_process",
      "aralearn.resource.database_schema",
      "aralearn.resource.entity_relationship",
      "aralearn.resource.flow",
      "aralearn.resource.graph",
      "aralearn.resource.network_topology",
      "aralearn.resource.relation_map",
      "aralearn.resource.software_container",
      "aralearn.resource.software_system_context",
      "aralearn.resource.state_machine",
      "aralearn.resource.system_internal_block",
      "aralearn.resource.tree"
    ]);
    const MAX_REPORTED_DIMENSION = 32768;
    let nextRequestId = 1;
    let renderVersion = 0;
    let resizeFrame = null;
    let resizeObserver = null;
    let lastReportedSize = "";
    let tornDown = false;
    let initializedView = false;
    let hostContext = {};
    let hostCapabilities = {};

    function request(method, params) {
      const id = nextRequestId++;
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }

    function notify(method, params = {}) {
      window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
    }

    function respond(id, result = {}) {
      window.parent.postMessage({ jsonrpc: "2.0", id, result }, "*");
    }

    function boundedDimension(value) {
      return Math.min(MAX_REPORTED_DIMENSION, Math.max(1, Math.ceil(value || 0)));
    }

    function boundedInset(value) {
      return Math.min(256, Math.max(0, Number.isFinite(value) ? value : 0));
    }

    function constrainedDimension(value, axis) {
      const dimensions = hostContext.containerDimensions || {};
      const fixed = dimensions[axis];
      if (Number.isFinite(fixed) && fixed > 0) return boundedDimension(fixed);
      const maximum = dimensions[axis === "width" ? "maxWidth" : "maxHeight"];
      return Number.isFinite(maximum) && maximum > 0
        ? Math.min(boundedDimension(value), boundedDimension(maximum))
        : boundedDimension(value);
    }

    function applyHostContext(patch) {
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) return;
      hostContext = { ...hostContext, ...patch };
      const theme = hostContext.theme;
      if (theme === "light" || theme === "dark") {
        document.documentElement.dataset.colorMode = theme;
        document.documentElement.style.colorScheme = theme;
      }
      const dimensions = hostContext.containerDimensions || {};
      document.documentElement.style.height = Number.isFinite(dimensions.height) && dimensions.height > 0
        ? "100vh"
        : "";
      document.documentElement.style.maxHeight = Number.isFinite(dimensions.maxHeight) && dimensions.maxHeight > 0
        ? boundedDimension(dimensions.maxHeight) + "px"
        : "";
      document.documentElement.style.width = Number.isFinite(dimensions.width) && dimensions.width > 0
        ? "100vw"
        : "";
      document.documentElement.style.maxWidth = Number.isFinite(dimensions.maxWidth) && dimensions.maxWidth > 0
        ? boundedDimension(dimensions.maxWidth) + "px"
        : "";
      const insets = hostContext.safeAreaInsets || {};
      for (const side of ["top", "right", "bottom", "left"]) {
        document.documentElement.style.setProperty(
          "--mcp-host-safe-" + side,
          boundedInset(insets[side]) + "px"
        );
      }
      scheduleSizeReport();
    }

    function reportSize() {
      resizeFrame = null;
      if (tornDown) return;
      const width = constrainedDimension(Math.max(
        app.getBoundingClientRect().width,
        app.scrollWidth,
        document.body.scrollWidth,
        document.documentElement.scrollWidth
      ), "width");
      const height = constrainedDimension(Math.max(
        app.getBoundingClientRect().height,
        app.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      ), "height");
      const key = width + "x" + height;
      if (key === lastReportedSize) return;
      lastReportedSize = key;
      notify("ui/notifications/size-changed", { width, height });
    }

    function scheduleSizeReport() {
      if (tornDown || !initializedView || resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(reportSize);
    }

    function startSizeObserver() {
      if (tornDown || resizeObserver !== null) return;
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(scheduleSizeReport);
        resizeObserver.observe(app);
      }
      scheduleSizeReport();
    }

    function teardown(id) {
      if (!tornDown) {
        tornDown = true;
        renderVersion += 1;
        resizeObserver?.disconnect();
        resizeObserver = null;
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        resizeFrame = null;
      }
      if (typeof id === "string" || typeof id === "number") respond(id);
    }

    function clear() {
      while (app.firstChild) app.firstChild.remove();
    }

    function element(name, text = null, className = null) {
      const node = document.createElement(name);
      if (text !== null) node.textContent = String(text);
      if (className) node.className = className;
      return node;
    }

    function boundedArray(value, maximum = 200) {
      return Array.isArray(value) ? value.slice(0, maximum) : [];
    }

    function safeCount(value) {
      return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }

    function fitLabel(value) {
      return ({ canonical: "Canônico", versatile: "Versátil", substitute: "Substituto" })[value] || "Não informado";
    }

    function unitLabel(value) {
      return ({
        count: "Contagem",
        milliseconds: "Milissegundos",
        ratio: "Proporção",
        percentage: "Porcentagem"
      })[value] || "Não informada";
    }

    function safeLink(value) {
      try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" && url.hostname === "fabio-ara.github.io" &&
          url.pathname.startsWith("/AraLearn/") ? url.href : null;
      } catch {
        return null;
      }
    }

    function requiresTextOnlyPreview(studyUnit) {
      const instances = [
        ...boundedArray(studyUnit?.content, 128),
        ...boundedArray(studyUnit?.feedback, 128)
      ];
      if (studyUnit?.response && typeof studyUnit.response === "object") {
        instances.push(studyUnit.response);
      }
      return instances.some((instance) => TEXT_ONLY_PACKAGE_IDS.has(instance?.package));
    }

    function appendHeader(title, context) {
      app.append(element("h1", title));
      if (context) app.append(element("p", context, "mcp-app-context"));
    }

    function appendLink(value, label = "Abrir no AraLearn") {
      const href = safeLink(value);
      if (!href || !hostCapabilities || typeof hostCapabilities !== "object" ||
          !Object.hasOwn(hostCapabilities, "openLinks")) return;
      const link = element("a", label, "mcp-app-link");
      link.href = href;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (tornDown) return;
        void request("ui/open-link", { url: href }).catch(() => {});
      });
      app.append(link);
    }

    function appendTable(columns, rows, captionText) {
      const wrapper = element("div", null, "mcp-app-table-wrap");
      const table = element("table");
      const caption = element("caption", captionText);
      caption.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
      table.append(caption);
      const head = element("thead");
      const headRow = element("tr");
      columns.forEach((column) => headRow.append(element("th", column.label)));
      head.append(headRow);
      table.append(head);
      const body = element("tbody");
      rows.forEach((row) => {
        const tr = element("tr");
        columns.forEach((column) => tr.append(element("td", row[column.key] ?? "Dado ausente")));
        body.append(tr);
      });
      table.append(body);
      wrapper.append(table);
      app.append(wrapper);
    }

    function renderBars(series) {
      const values = boundedArray(series, 32).map((entry) => ({
        label: String(entry?.label || "Sem rótulo"),
        value: safeCount(entry?.value)
      }));
      const maximum = Math.max(1, ...values.map(({ value }) => value ?? 0));
      const list = element("ul", null, "mcp-app-bars");
      values.forEach(({ label, value }) => {
        const item = element("li", null, "mcp-app-bar");
        item.append(element("span", label));
        const track = element("span", null, "mcp-app-bar-track");
        const bar = element("span", null, "mcp-app-bar-value");
        bar.style.width = value === null ? "0" : String((value / maximum) * 100) + "%";
        track.append(bar);
        item.append(track, element("span", value === null ? "Ausente" : value));
        list.append(item);
      });
      app.append(list);
    }

    async function renderStudyUnit(data, version) {
      const preview = data?.result;
      const studyUnit = preview?.studyUnit;
      clear();
      appendHeader("Prévia da Unidade de estudo", preview?.catalogVersion ? "Catálogo " + preview.catalogVersion : null);
      if (!preview?.structural?.valid || !studyUnit || typeof studyUnit !== "object") {
        app.append(element("p", "A composição não passou pela validação estrutural.", "mcp-app-notice"));
        return;
      }
      if (requiresTextOnlyPreview(studyUnit)) {
        app.append(element(
          "p",
          "Este componente usa processamento gráfico que a política do cliente não permite nesta visualização. A descrição textual equivalente aparece a seguir.",
          "mcp-app-notice"
        ));
        app.append(element(
          "p",
          String(preview?.accessibleText || "Descrição textual indisponível."),
          "mcp-app-context"
        ));
        appendLink(preview?.deepLink);
        return;
      }
      const host = element("section", null, "mcp-app-study-unit");
      host.setAttribute("aria-label", "Representação final da Unidade de estudo");
      app.append(host);
      try {
        const rendererModule = await import("${PUBLISHED_RENDERER}");
        const registryModule = await import("${PUBLISHED_REGISTRY}");
        if (tornDown || version !== renderVersion || !host.isConnected) return;
        host.innerHTML = rendererModule.renderPackageStudyUnitArticle(studyUnit);
        await registryModule.RESOURCE_PACKAGE_REGISTRY.hydrate(host);
        if (tornDown || version !== renderVersion || !host.isConnected) {
          host.remove();
          return;
        }
      } catch {
        if (tornDown || version !== renderVersion || !host.isConnected) return;
        host.remove();
        const accessibleText = String(preview?.accessibleText || "").trim();
        app.append(element("p", accessibleText || "A prévia visual não pôde ser carregada. Abra a Unidade no AraLearn.", "mcp-app-notice"));
      }
      if (tornDown || version !== renderVersion) return;
      appendLink(preview?.deepLink);
    }

    function renderAnalytics(data) {
      clear();
      appendHeader("Pesquisa na Autoria", "Revisão " + String(data.courseRevision ?? "não informada"));
      const overview = data.overview || {};
      const question = String(overview.question || data.question || "Fatos observáveis do processo de Autoria");
      app.append(element("p", question, "mcp-app-context"));
      const series = boundedArray(overview.series, 32);
      if (series.length) {
        app.append(element("h2", String(overview.title || "Distribuição")));
        renderBars(series);
        appendTable([
          { key: "label", label: "Categoria" },
          { key: "value", label: "Valor" },
          { key: "unit", label: "Unidade" },
          { key: "denominator", label: "Denominador" }
        ], series.map((entry) => ({
          label: entry?.label,
          value: safeCount(entry?.value),
          unit: unitLabel(entry?.unit),
          denominator: entry?.denominator ?? "Não se aplica"
        })), "Dados equivalentes à visualização");
      } else {
        app.append(element("p", "Não há linhas para este recorte. A ausência foi preservada e não foi convertida em zero.", "mcp-app-empty"));
      }
      const limitations = boundedArray(data.limitations, 12).map(String).filter(Boolean);
      if (limitations.length) {
        const section = element("section", null, "mcp-app-section");
        section.append(element("h2", "Limites de interpretação"));
        const list = element("ul");
        limitations.forEach((item) => list.append(element("li", item)));
        section.append(list);
        app.append(section);
      }
      appendLink(data.deepLink);
    }

    function renderVariantComparison(data) {
      clear();
      const planning = data.planning || {};
      appendHeader(
        "Comparação de variantes",
        "Planejamento comum · revisão " + String(planning.courseRevision ?? "não informada") +
          " · versão " + String(planning.planVersion ?? "não informada")
      );
      const members = boundedArray(data.members, 8);
      if (!members.length) {
        app.append(element("p", "Nenhuma variante comparável está disponível neste conjunto.", "mcp-app-empty"));
        return;
      }
      const differences = data.differences || {};
      const differenceCount = (field, courseId) => boundedArray(differences[field], 256)
        .filter((entry) => entry?.courseId === courseId).length;
      appendTable([
        { key: "label", label: "Variante" },
        { key: "role", label: "Papel" },
        { key: "revision", label: "Revisão" },
        { key: "parameters", label: "Parâmetros efetivos" },
        { key: "policies", label: "Políticas efetivas" },
        { key: "parts", label: "Partes" },
        { key: "units", label: "Unidades" },
        { key: "references", label: "Fontes / Âncoras / PDFs" },
        { key: "declared", label: "Declaradas / observadas" },
        { key: "deviations", label: "Desvios / fatos" },
        { key: "missing", label: "Dados ausentes" }
      ], members.map((member) => ({
        label: member?.label || member?.title || member?.courseId,
        role: member?.courseId === differences.referenceCourseId ? "Referência" : "Comparada",
        revision: member?.currentCourseRevision ?? "Não informada",
        parameters: boundedArray(member?.effectiveParameters, 1024).length,
        policies: boundedArray(member?.effectiveComponentPolicies, 256).length,
        parts: safeCount(member?.materialization?.plannedPartCount),
        units: safeCount(member?.materialization?.studyUnitCount),
        references: [
          safeCount(member?.references?.sourceCount),
          safeCount(member?.references?.anchorCount),
          safeCount(member?.references?.pdfCount)
        ].join(" / "),
        declared: differenceCount("declared", member?.courseId) + " / " +
          differenceCount("observedExpected", member?.courseId),
        deviations: differenceCount("accidentalDeviations", member?.courseId) + " / " +
          differenceCount("factual", member?.courseId),
        missing: differenceCount("missingData", member?.courseId) || "Nenhum"
      })), "Comparação tabular das variantes");
      appendLink(data.deepLink);
    }

    function renderComponentLibrary(data) {
      clear();
      const result = data?.result || {};
      const operationLabels = {
        explore: "Exploração do catálogo",
        search: "Busca de componentes",
        inspect: "Inspeção de componentes",
        contracts: "Contrato de componente",
        validate_study_unit: "Validação de Unidade de estudo",
        audit_representation: "Auditoria da representação"
      };
      appendHeader(
        "Biblioteca de componentes didáticos",
        (operationLabels[data?.operation] || "Consulta") +
          (result.catalogVersion ? " · catálogo " + result.catalogVersion : "")
      );
      if (Number.isSafeInteger(result.packageCount)) {
        app.append(element("p", "Componentes disponíveis no recorte: " + String(result.packageCount) + ".", "mcp-app-notice"));
      }
      const candidates = boundedArray(result.candidates, 8);
      if (candidates.length) {
        appendTable([
          { key: "label", label: "Componente" },
          { key: "fit", label: "Encaixe" },
          { key: "reason", label: "Justificativa" }
        ], candidates.map((candidate) => ({
          label: candidate?.label || candidate?.title || candidate?.packageId || "Componente",
          fit: fitLabel(candidate?.fit),
          reason: candidate?.reason || "Não informada"
        })), "Candidatos encontrados");
      }
      const items = boundedArray(result.items, 8);
      if (items.length) {
        appendTable([
          { key: "label", label: "Componente" },
          { key: "status", label: "Situação" }
        ], items.map((item) => ({
          label: item?.profile?.label || item?.profile?.packageId || item?.packageId || "Componente",
          status: item?.status === "ok" ? "Disponível" : "Não encontrado"
        })), "Componentes inspecionados");
      }
      if (typeof result.valid === "boolean" || typeof result.structural?.valid === "boolean") {
        const valid = result.valid ?? result.structural.valid;
        app.append(element(
          "p",
          valid
            ? "A Unidade de estudo satisfaz os contratos estruturais."
            : "A Unidade de estudo não satisfaz os contratos estruturais.",
          "mcp-app-notice"
        ));
      }
      if (result.overallFit) {
        app.append(element("p", "Encaixe representacional: " + fitLabel(result.overallFit) + ".", "mcp-app-context"));
      }
      const notices = [
        ...boundedArray(result.errors, 3),
        ...boundedArray(result.warnings, 3)
      ].map(String).filter(Boolean).slice(0, 3);
      if (notices.length) {
        const list = element("ul", null, "mcp-app-section");
        notices.forEach((notice) => list.append(element("li", notice)));
        app.append(list);
      }
      if (!result.packageCount && !candidates.length && !items.length &&
          typeof result.valid !== "boolean" && typeof result.structural?.valid !== "boolean" &&
          !result.overallFit && !notices.length) {
        app.append(element("p", "A consulta foi concluída; os detalhes permanecem disponíveis na resposta textual.", "mcp-app-empty"));
      }
    }

    function renderGeneric(data) {
      clear();
      appendHeader("Leitura do Curso", data?.courseRevision ? "Revisão " + data.courseRevision : null);
      const summary = String(data?.summary?.text || data?.message || data?.title || "A leitura foi concluída. Consulte a resposta textual ou abra o Curso para os detalhes.");
      app.append(element("p", summary, "mcp-app-notice"));
      appendLink(data?.deepLink);
    }

    async function render(structuredContent) {
      if (tornDown) return;
      const version = ++renderVersion;
      const envelope = structuredContent && typeof structuredContent === "object" ? structuredContent : null;
      if (!envelope?.ok) {
        clear();
        const message = envelope?.error?.message || "O resultado autorizado não está disponível.";
        const alert = element("p", message, "mcp-app-notice");
        alert.setAttribute("role", "alert");
        app.append(alert);
        return;
      }
      const data = envelope.data;
      if (data?.contract === "aralearn.instructional-component-library.v1" &&
          data.operation === "preview_study_unit") {
        await renderStudyUnit(data, version);
      } else if (data?.contract === "aralearn.instructional-component-library.v1") {
        renderComponentLibrary(data);
      } else if (data?.contract === "aralearn.course-authoring-analytics.v1") {
        renderAnalytics(data);
      } else if (data?.contract === "aralearn.course-variant-comparison.v1" ||
          data?.comparisonSetId && Array.isArray(data?.members)) {
        renderVariantComparison(data);
      } else {
        renderGeneric(data);
      }
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;
      if (message.method === "ui/resource-teardown") {
        teardown(message.id);
        return;
      }
      if (tornDown) return;
      if (message.method === "ui/notifications/tool-result") {
        void render(message.params?.structuredContent);
        return;
      }
      if (message.method === "ui/notifications/host-context-changed") {
        applyHostContext(message.params);
        return;
      }
      if (typeof message.method === "string") return;
      if (message.id !== undefined && pending.has(message.id)) {
        const operation = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) operation.reject(message.error);
        else operation.resolve(message.result);
      }
    }, { passive: true });

    try {
      const initialized = await request("ui/initialize", {
        protocolVersion: "2026-01-26",
        appInfo: { name: "AraLearn Course Inspector", version: "0.0.23" },
        appCapabilities: { availableDisplayModes: ["inline"] }
      });
      if (!tornDown) {
        hostCapabilities = initialized?.hostCapabilities || {};
        applyHostContext(initialized?.hostContext);
        notify("ui/notifications/initialized");
        initializedView = true;
        startSizeObserver();
      }
    } catch {
      // A representação textual do resultado continua disponível no host.
    }
  </script>
</body>
</html>`;

const RESOURCE_DESCRIPTOR = Object.freeze({
  uri: COURSE_MCP_APP_RESOURCE_URI,
  name: "aralearn-course-inspector",
  title: "Inspeção visual do Curso",
  description: "Apresenta prévias compatíveis de Unidades de estudo, descrições textuais para componentes gráficos restritos, indicadores de Pesquisa, comparações de variantes e consultas da biblioteca a partir do resultado autorizado das ferramentas de Curso.",
  mimeType: COURSE_MCP_APP_MIME_TYPE
});

export function courseMcpAppToolMeta() {
  return {
    ui: { resourceUri: COURSE_MCP_APP_RESOURCE_URI },
    "openai/outputTemplate": COURSE_MCP_APP_RESOURCE_URI
  };
}

export function listCourseMcpAppResources() {
  return [structuredClone(RESOURCE_DESCRIPTOR)];
}

export function readCourseMcpAppResource(uri) {
  if (uri !== COURSE_MCP_APP_RESOURCE_URI) return null;
  return {
    uri: COURSE_MCP_APP_RESOURCE_URI,
    mimeType: COURSE_MCP_APP_MIME_TYPE,
    text: COURSE_MCP_APP_HTML,
    _meta: {
      ui: {
        prefersBorder: true,
        csp: {
          connectDomains: [],
          resourceDomains: [PUBLISHED_APP_ORIGIN]
        }
      }
    }
  };
}
