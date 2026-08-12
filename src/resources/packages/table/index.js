import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";

export const tablePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.table", version: "1.0.0", label: "Tabela",
    purpose: "Comparar atributos repetidos ou consultar valores organizados por linhas e colunas.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["compare-fields", "lookup", "classify", "contrast-cases"]),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Não introduz sozinha siglas, números ou categorias ainda não explicados.", "Evite tabelas densas em primeiro contato."]),
    accessibility: "Cabeçalhos e células usam semântica de tabela e leitura linear."
  }),
  authoringContract: Object.freeze({
    intent: "Declare uma comparação pequena, com cabeçalhos autoexplicativos e contexto anterior.",
    required: Object.freeze(["columns", "rows"]), optional: Object.freeze(["prompt", "caption", "layout"]),
    rules: Object.freeze(["Cada linha tem a mesma quantidade de células que columns.", "Explique antes toda sigla usada."]),
    example: Object.freeze({ prompt: "Compare a finalidade.", columns: ["Mecanismo", "Finalidade"], rows: [["Get", "Consultar um valor"]] })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["columns", "rows"],
    properties: {
      prompt: { type: "string", maxLength: 2000 }, caption: { type: "string", maxLength: 500 },
      layout: { type: "string", enum: ["compact", "auto", "wide"] },
      columns: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 1, maxLength: 300 } },
      rows: { type: "array", minItems: 1, maxItems: 30, items: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", maxLength: 2000 } } }
    }
  }),
  normalize(data) {
    return {
      ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}),
      ...(data?.caption ? { caption: String(data.caption).trim() } : {}),
      ...(data?.layout ? { layout: String(data.layout).trim() } : {}),
      columns: (data?.columns || []).map((value) => String(value).trim()),
      rows: (data?.rows || []).map((row) => (row || []).map((value) => String(value)))
    };
  },
  validate(data) {
    return data.rows.some((row) => row.length !== data.columns.length)
      ? ["Toda linha precisa ter a mesma quantidade de células que columns."] : [];
  },
  render(data) {
    const caption = data.caption ? `<caption>${renderPackageInline(data.caption)}</caption>` : "";
    const head = `<thead><tr>${data.columns.map((column) => `<th scope="col">${renderPackageInline(column)}</th>`).join("")}</tr></thead>`;
    const body = `<tbody>${data.rows.map((row) => `<tr>${row.map((cell) => `<td>${renderPackageProse(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    return `<div class="runtime-block runtime-table-block">${data.prompt ? renderPackageProse(data.prompt) : ""}<div class="runtime-table-scroll"><table class="runtime-table">${caption}${head}${body}</table></div></div>`;
  },
  accessibleText(data) { return [data.prompt, ...data.columns, ...data.rows.flat()].filter(Boolean).join(". "); },
  editableTargets(data) {
    return [
      ...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []),
      ...data.columns.map((_, index) => ({ path: `columns[${index}]`, label: `Editar cabeçalho ${index + 1}` })),
      ...data.rows.flatMap((row, rowIndex) => row.map((_, columnIndex) => ({ path: `rows[${rowIndex}][${columnIndex}]`, label: `Editar célula ${rowIndex + 1}, ${columnIndex + 1}` })))
    ];
  }
});
