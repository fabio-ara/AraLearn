export const FLOWCHART_PICKER_SHAPES = Object.freeze([
  { key: "terminal", label: "Terminal", pickerIcon: "◯" },
  { key: "process", label: "Processamento", pickerIcon: "▭" },
  { key: "input_output", label: "Entrada e saída", pickerIcon: "▱" },
  { key: "keyboard_input", label: "Entrada via teclado", pickerIcon: "▦" },
  { key: "screen_output", label: "Saída em vídeo", pickerIcon: "▣" },
  { key: "printed_output", label: "Saída impressa", pickerIcon: "▤" },
  { key: "decision", label: "Decisão", pickerIcon: "◇" },
  { key: "loop", label: "Laço para", pickerIcon: "⬡" },
  { key: "connector", label: "Conector", pickerIcon: "○" },
  { key: "page_connector", label: "Conector de página", pickerIcon: "⬟" }
]);

const SHAPE_LABELS = FLOWCHART_PICKER_SHAPES.reduce((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});

export function normalizeFlowchartShapeKey(value) {
  const key = String(value || "").trim().toLowerCase();
  return FLOWCHART_PICKER_SHAPES.some((item) => item.key === key) ? key : "process";
}

export function getFlowchartShapeLabel(shape) {
  const key = normalizeFlowchartShapeKey(shape);
  return SHAPE_LABELS[key] || SHAPE_LABELS.process;
}

export function renderFlowchartShapeSvg(shape) {
  const key = normalizeFlowchartShapeKey(shape);
  let body = "";

  switch (key) {
    case "terminal":
      body = '<rect x="10" y="8" width="100" height="44" rx="22" ry="22"></rect>';
      break;
    case "process":
      body = '<rect x="12" y="8" width="96" height="44" rx="4" ry="4"></rect>';
      break;
    case "input_output":
      body = '<polygon points="26,8 108,8 94,52 12,52"></polygon>';
      break;
    case "keyboard_input":
      body = '<polygon points="12,8 108,8 96,46 24,52"></polygon><line x1="26" y1="42" x2="92" y2="42"></line>';
      break;
    case "screen_output":
      body = '<path d="M14 8 H106 V40 H86 L78 52 H14 Z"></path>';
      break;
    case "printed_output":
      body = '<path d="M12 8 H108 V40 C98 48 88 44 78 50 C66 56 52 44 40 50 C30 56 20 48 12 44 Z"></path>';
      break;
    case "decision":
      body = '<polygon points="60,6 108,30 60,54 12,30"></polygon>';
      break;
    case "loop":
      body = '<polygon points="28,8 92,8 108,30 92,52 28,52 12,30"></polygon>';
      break;
    case "connector":
      body = '<circle cx="60" cy="30" r="22"></circle>';
      break;
    case "page_connector":
      body = '<polygon points="18,8 102,8 102,36 60,54 18,36"></polygon>';
      break;
    default:
      body = '<rect x="12" y="8" width="96" height="44" rx="4" ry="4"></rect>';
      break;
  }

  return (
    '<svg class="flowchart-shape-svg flowchart-shape-' +
    key +
    '" viewBox="0 0 120 60" aria-hidden="true" focusable="false">' +
    body +
    "</svg>"
  );
}
