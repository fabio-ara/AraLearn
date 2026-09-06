const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function renderBibliographicReference(reference) {
  if (!reference) return "";
  if (!Array.isArray(reference.runs) || !reference.runs.length) return escape(reference.text || "");
  return reference.runs.map(run => {
    let text = escape(run.text);
    if (run.italic === true) text = `<em>${text}</em>`;
    if (run.bold === true) text = `<strong>${text}</strong>`;
    if (run.verticalAlign === "sup") text = `<sup>${text}</sup>`;
    if (run.verticalAlign === "sub") text = `<sub>${text}</sub>`;
    return text;
  }).join("");
}
