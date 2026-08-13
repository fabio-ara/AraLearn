const GAP_MARKER = /\uE000[^\uE001]+\uE001/gu;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

let vizInstancePromise = null;

function vizAssetUrl() {
  const stylesheet = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((link) => link.href)
    .find((href) => /(?:^|\/)styles\.css(?:$|\?)/u.test(href));
  return stylesheet
    ? new URL("vendor/viz-global.js", stylesheet).href
    : new URL("public/vendor/viz-global.js", document.baseURI).href;
}

export function loadGraphvizInstance() {
  if (vizInstancePromise) return vizInstancePromise;
  vizInstancePromise = new Promise((resolve, reject) => {
    if (globalThis.Viz?.instance) {
      resolve(globalThis.Viz.instance());
      return;
    }
    const script = document.createElement("script");
    script.src = vizAssetUrl();
    script.async = true;
    script.addEventListener("load", () => globalThis.Viz?.instance
      ? resolve(globalThis.Viz.instance())
      : reject(new Error("Viz.js não inicializou.")));
    script.addEventListener("error", () => reject(new Error("Viz.js não pôde ser carregado.")));
    document.head.append(script);
  }).then((value) => value);
  return vizInstancePromise;
}

export function dotQuote(value) {
  return `"${String(value ?? "")
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, "\\n")}"`;
}

export function dotAttributes(attributes) {
  return `[${Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${dotQuote(value)}`)
    .join(", ")}]`;
}

export function escapeGraphvizHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

export function graphvizHtmlLines(value, lineLength = 32) {
  return wrapGraphvizLabel(value, lineLength)
    .split("\n")
    .map(escapeGraphvizHtml)
    .join("<BR/>");
}

export function dotAttributesWithHtmlLabel(attributes, htmlLabel) {
  const serialized = Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${dotQuote(value)}`);
  serialized.push(`label=<${String(htmlLabel || " ")}>`);
  return `[${serialized.join(", ")}]`;
}

export function plainGraphvizLabel(value) {
  return String(value || "")
    .replace(GAP_MARKER, (encoded) => {
      try {
        const marker = JSON.parse(decodeURIComponent(encoded.slice(1, -1)));
        return String(marker.value || marker.layoutText || "________");
      } catch {
        return "________";
      }
    })
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/\*([^*]+)\*/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim() || " ";
}

export function wrapGraphvizLabel(value, lineLength = 32) {
  const words = plainGraphvizLabel(value).split(/\s+/u);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > lineLength) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines.join("\n");
}

export function hasGraphvizGap(value) {
  GAP_MARKER.lastIndex = 0;
  return GAP_MARKER.test(String(value || ""));
}

export function graphvizGroupById(svg, id) {
  return [...svg.querySelectorAll("g")].find((group) => group.id === id) || null;
}

export function unionGraphvizTextBounds(elements) {
  const bounds = elements.reduce((current, element) => {
    const box = element.getBBox();
    if (!current) return { x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height };
    return {
      x: Math.min(current.x, box.x),
      y: Math.min(current.y, box.y),
      right: Math.max(current.right, box.x + box.width),
      bottom: Math.max(current.bottom, box.y + box.height)
    };
  }, null);
  return bounds && {
    x: bounds.x,
    y: bounds.y,
    width: bounds.right - bounds.x,
    height: bounds.bottom - bounds.y
  };
}

export function appendGraphvizForeignLabel(group, template, bounds, className) {
  if (!group || !template || !bounds) return null;
  const foreignObject = document.createElementNS(SVG_NAMESPACE, "foreignObject");
  foreignObject.setAttribute("x", String(bounds.x));
  foreignObject.setAttribute("y", String(bounds.y));
  foreignObject.setAttribute("width", String(Math.max(1, bounds.width)));
  foreignObject.setAttribute("height", String(Math.max(1, bounds.height)));
  foreignObject.setAttribute("class", className);
  foreignObject.append(template.content.cloneNode(true));
  group.append(foreignObject);
  return foreignObject;
}

export async function renderGraphvizSvg(canvas, {
  source,
  engine = "dot",
  className = "package-graphviz-svg"
} = {}) {
  if (!canvas || !source) throw new Error("Diagrama sem fonte Graphviz.");
  const viz = await loadGraphvizInstance();
  const svg = viz.renderSVGElement(source, { engine });
  svg.classList.add(className);
  const viewBox = svg.viewBox.baseVal;
  svg.setAttribute("width", String(viewBox.width));
  svg.setAttribute("height", String(viewBox.height));
  canvas.replaceChildren(svg);
  return svg;
}
