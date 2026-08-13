const RUNTIME_ASSETS = Object.freeze([
  Object.freeze({ globalName: "vega", fileName: "vega.min.js" }),
  Object.freeze({ globalName: "vegaLite", fileName: "vega-lite.min.js" })
]);

let runtimePromise = null;

function assetUrl(fileName) {
  const stylesheet = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((link) => link.href)
    .find((href) => /(?:^|\/)styles\.css(?:$|\?)/u.test(href));
  return stylesheet
    ? new URL(`vendor/${fileName}`, stylesheet).href
    : new URL(`public/vendor/${fileName}`, document.baseURI).href;
}

function loadScript({ globalName, fileName }) {
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = assetUrl(fileName);
    script.async = false;
    script.addEventListener("load", () => globalThis[globalName]
      ? resolve(globalThis[globalName])
      : reject(new Error(`${fileName} não inicializou.`)));
    script.addEventListener("error", () => reject(new Error(`${fileName} não pôde ser carregado.`)));
    document.head.append(script);
  });
}

export function loadVegaRuntime() {
  if (!runtimePromise) {
    runtimePromise = RUNTIME_ASSETS.reduce(
      (promise, asset) => promise.then(() => loadScript(asset)),
      Promise.resolve()
    ).then(() => Object.freeze({ vega: globalThis.vega, vegaLite: globalThis.vegaLite }));
  }
  return runtimePromise;
}

export function readVegaTheme(container, colorSelectors = []) {
  const styles = getComputedStyle(container);
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const normalizeColor = (value, fallback) => {
    const candidate = value || fallback;
    const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/u.exec(candidate);
    if (srgb) {
      const channels = srgb.slice(1, 4).map((channel) => Math.round(Number(channel) * 255));
      return srgb[4]
        ? `rgba(${channels.join(", ")}, ${Number(srgb[4])})`
        : `rgb(${channels.join(", ")})`;
    }
    if (!context) return candidate;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000000";
    context.fillStyle = candidate;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    return alpha === 255 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
  };
  const read = (name, fallback) => normalizeColor(styles.getPropertyValue(name).trim(), fallback);
  const colors = colorSelectors.map((selector) => {
    const element = container.closest("figure")?.querySelector(selector);
    if (!element) return "";
    const elementStyles = getComputedStyle(element);
    const background = elementStyles.backgroundColor;
    return normalizeColor(background && background !== "rgba(0, 0, 0, 0)"
      ? background
      : elementStyles.fill, "");
  }).filter((value) => value && value !== "rgba(0, 0, 0, 0)");
  return Object.freeze({
    background: "transparent",
    text: read("--resource-text", "#111827"),
    secondaryText: read("--resource-text-secondary", "#475569"),
    border: read("--resource-border-strong", "#94a3b8"),
    grid: read("--resource-border", "#cbd5e1"),
    surface: read("--resource-surface-subtle", "#f8fafc"),
    accent: read("--resource-accent", "#2563eb"),
    colors: colors.length ? colors : [read("--resource-accent", "#2563eb")]
  });
}

export async function renderVegaLite(container, specification) {
  const { vega, vegaLite } = await loadVegaRuntime();
  const compiled = vegaLite.compile(specification).spec;
  const previous = container.__aralearnVegaView;
  if (previous) previous.finalize();
  container.replaceChildren();
  const view = new vega.View(vega.parse(compiled), {
    renderer: "svg",
    hover: false,
    logLevel: vega.Warn
  }).initialize(container);
  container.__aralearnVegaView = view;
  await view.runAsync();
  const svg = container.querySelector("svg");
  if (svg) {
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
  }
  container.dataset.vegaStatus = "ready";
  container.setAttribute("aria-busy", "false");
  return view;
}
