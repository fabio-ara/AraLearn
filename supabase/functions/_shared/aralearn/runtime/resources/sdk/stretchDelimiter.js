const DELIMITER_PATHS = Object.freeze({
  "[": "M7 1H1V99H7",
  "]": "M1 1H7V99H1",
  "(": "M7 1C2 20 1 35 1 50S2 80 7 99",
  ")": "M1 1C6 20 7 35 7 50S6 80 1 99",
  "{": "M7 1C3 1 3 18 3 38C3 46 1 49 1 50C1 51 3 54 3 62C3 82 3 99 7 99",
  "}": "M1 1C5 1 5 18 5 38C5 46 7 49 7 50C7 51 5 54 5 62C5 82 5 99 1 99",
  "|": "M4 1V99",
  "‖": "M2 1V99M6 1V99",
  "⟨": "M7 1L1 50L7 99",
  "⟩": "M1 1L7 50L1 99"
});

export function renderStretchDelimiter(symbol, className = "") {
  const path = DELIMITER_PATHS[symbol];
  if (!path) throw new TypeError(`Delimitador elástico não suportado: ${symbol}`);
  const classes = ["resource-stretch-delimiter", className].filter(Boolean).join(" ");
  return `<svg class="${classes}" viewBox="0 0 8 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${path}" vector-effect="non-scaling-stroke"/></svg>`;
}
