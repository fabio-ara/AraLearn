import { academicProfile } from "../../sdk/academic.js";
import { escapePackageAttribute, escapePackageHtml, renderPackageInline, renderPackageProse } from "../../sdk/html.js";

function renderMatrix(values, name = "", delimiters = "brackets") {
  const dimensions = `${values.length} por ${values[0]?.length || 0}`;
  const accessibleName = name ? `Matriz ${name}, ${dimensions}` : `Matriz ${dimensions}`;
  const body = values.map((row) => `<mtr>${row.map((cell) => `<mtd><mtext>${renderPackageInline(cell)}</mtext></mtd>`).join("")}</mtr>`).join("");
  const bracket = (side) => `<svg class="runtime-matrix-delimiter is-${side}" viewBox="0 0 8 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${side === "left" ? "M7 1H1V99H7" : "M1 1H7V99H1"}" vector-effect="non-scaling-stroke"/></svg>`;
  const parenthesis = (side) => `<svg class="runtime-matrix-delimiter is-${side}" viewBox="0 0 8 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${side === "left" ? "M7 1C2 20 1 35 1 50S2 80 7 99" : "M1 1C6 20 7 35 7 50S6 80 1 99"}" vector-effect="non-scaling-stroke"/></svg>`;
  const delimiter = delimiters === "parentheses" ? parenthesis : bracket;
  const prefix = name ? `<math class="runtime-matrix-prefix" aria-hidden="true"><mrow><mi class="runtime-matrix-name">${escapePackageHtml(name)}</mi><mo>=</mo></mrow></math>` : "";
  return `<span class="runtime-matrix-item" role="group" aria-label="${escapePackageAttribute(accessibleName)}">${prefix}<span class="runtime-matrix-fenced">${delimiter("left")}<math class="runtime-matrix-values"><mtable class="runtime-matrix-grid">${body}</mtable></math>${delimiter("right")}</span></span>`;
}

export const matrixPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.matrix", version: "1.0.0", label: "Matriz", purpose: "Representar um arranjo retangular de escalares ou expressões e operações da álgebra linear.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["inspect-matrix", "calculate-matrix", "compare-matrices"]), academic: academicProfile({ domains: ["álgebra linear", "matemática discreta", "computação gráfica"], knowledgeObjects: ["matriz", "entrada", "dimensão", "operação matricial"], conventions: ["entradas sem grade de tabela", "delimitadores matriciais", "índices por linha e coluna"], appropriateWhen: ["as posições das entradas participam de uma operação algébrica"], avoidWhen: ["linhas são registros e colunas são atributos", "há cabeçalhos heterogêneos"], technologies: ["estrutura matemática sem grade tabular", "HTML acessível"], practiceModes: ["exposition", "gap", "typing", "selection"] }), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]), limitations: Object.freeze(["Não use como tabela de atributos."]), accessibility: "Cada matriz possui leitura por linhas e dimensões anunciadas." }),
  authoringContract: Object.freeze({ intent: "Declare uma matriz algébrica; use table para registros com cabeçalhos.", required: Object.freeze([]), optional: Object.freeze(["prompt", "name", "values", "sequence", "delimiters"]), rules: Object.freeze(["Use exatamente values ou sequence.", "Linhas têm o mesmo comprimento.", "Não inclua cabeçalhos nem nomes de atributos nas entradas."]), example: Object.freeze({ prompt: "Observe a matriz identidade de ordem três.", name: "I", delimiters: "brackets", values: [["1", "0", "0"], ["0", "1", "0"], ["0", "0", "1"]] }) }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    properties: {
      prompt: { type: "string" },
      name: { type: "string" },
      delimiters: { type: "string", enum: ["brackets", "parentheses"] },
      values: {
        type: "array",
        minItems: 1,
        items: {
          type: "array",
          minItems: 1,
          items: { anyOf: [{ type: "string", maxLength: 120 }, { type: "number" }] }
        }
      },
      sequence: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["values"],
          properties: {
            name: { type: "string" },
            connector: { type: "string" },
            delimiters: { type: "string", enum: ["brackets", "parentheses"] },
            values: {
              type: "array",
              minItems: 1,
              items: {
                type: "array",
                minItems: 1,
                items: { anyOf: [{ type: "string", maxLength: 120 }, { type: "number" }] }
              }
            }
          }
        }
      }
    }
  }),
  normalize(data) { const normalizeValues = (values) => (values || []).map((row) => row.map(String)); return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), ...(data?.name ? { name: String(data.name).trim() } : {}), ...(data?.delimiters ? { delimiters: String(data.delimiters) } : {}), ...(data?.values ? { values: normalizeValues(data.values) } : {}), ...(data?.sequence ? { sequence: data.sequence.map((item) => ({ ...(item?.name ? { name: String(item.name) } : {}), ...(item?.connector ? { connector: String(item.connector) } : {}), ...(item?.delimiters ? { delimiters: String(item.delimiters) } : {}), values: normalizeValues(item.values) })) } : {}) }; },
  validate(data) { const matrices = [...(data.values ? [data.values] : []), ...(data.sequence || []).map(({ values }) => values)]; const errors = []; if (matrices.length === 0 || (data.values && data.sequence)) errors.push("Matrix exige values ou sequence, exclusivamente."); if (matrices.some((values) => values.some((row) => row.length !== values[0].length))) errors.push("Linhas da matriz precisam ter o mesmo comprimento."); return errors; },
  render(data) { const sequence = data.values ? renderMatrix(data.values, data.name, data.delimiters) : data.sequence.map((item, index) => `<div class="runtime-matrix-sequence-group">${index ? `<span class="runtime-matrix-sequence-operator" aria-hidden="true">${renderPackageInline(item.connector || "→")}</span>` : ""}${renderMatrix(item.values, item.name, item.delimiters)}</div>`).join(""); return `<div class="runtime-block runtime-matrix-block">${data.prompt ? `<div class="runtime-matrix-prompt">${renderPackageProse(data.prompt)}</div>` : ""}<div class="runtime-matrix-wrap"><div class="runtime-matrix-equation${data.sequence ? " is-sequence" : ""}">${sequence}</div></div></div>`; },
  accessibleText(data) { const matrices = data.values ? [{ name: data.name, values: data.values }] : data.sequence; return matrices.map((item) => `${item.name || "Matriz"}: ${item.values.map((row) => row.join(", ")).join("; ")}`).join(". "); },
  editableTargets(data) { const matrices = data.values ? [{ prefix: "", value: data }] : data.sequence.map((value, index) => ({ prefix: `sequence[${index}].`, value })); return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...(data.name ? [{ path: "name", label: "Editar nome da matriz" }] : []), ...matrices.flatMap(({ prefix, value }, matrixIndex) => value.values.flatMap((row, rowIndex) => row.map((_, columnIndex) => ({ path: `${prefix}values[${rowIndex}][${columnIndex}]`, label: `Editar entrada ${matrixIndex + 1}, ${rowIndex + 1}, ${columnIndex + 1}` }))))]; },
  practiceTargets(data) { const matrices = data.values ? [{ prefix: "", value: data }] : data.sequence.map((value, index) => ({ prefix: `sequence[${index}].`, value })); return matrices.flatMap(({ prefix, value }, matrixIndex) => value.values.flatMap((row, rowIndex) => row.map((_, columnIndex) => ({ path: `${prefix}values[${rowIndex}][${columnIndex}]`, label: `Lacuna na entrada ${matrixIndex + 1}, ${rowIndex + 1}, ${columnIndex + 1}`, modes: ["gap", "typing"] })))); }
});
