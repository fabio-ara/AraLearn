import { academicProfile } from "../../sdk/academic.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";

const VALUES = Object.freeze(["true", "false", "unknown"]);
const SYMBOLS = Object.freeze({ true: "V", false: "F", unknown: "—" });

export const truthTablePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.truth_table", version: "1.0.0", label: "Tabela-verdade",
    purpose: "Representar valorações e o resultado de uma fórmula proposicional segundo a convenção lógica.",
    slots: Object.freeze(["content", "feedback"]),
    taskOperations: Object.freeze(["evaluate-proposition", "compare-valuations", "identify-tautology", "inspect-equivalence"]),
    academic: academicProfile({ domains: ["lógica proposicional", "matemática discreta", "circuitos digitais"], knowledgeObjects: ["valoração", "fórmula proposicional", "coluna de resultado"], conventions: ["V e F por valoração", "uma linha por combinação", "subfórmulas em colunas quando necessárias"], appropriateWhen: ["é preciso observar o valor de uma fórmula em diferentes valorações"], avoidWhen: ["a tarefa é apenas definir um conectivo em prosa"], technologies: ["tabela HTML semântica"], practiceModes: ["exposition", "gap", "typing", "selection"] }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Use no máximo cinco variáveis por Unidade de estudo móvel.", "Explique os conectivos antes da primeira tabela densa."]),
    accessibility: "Cabeçalhos identificam variáveis, subfórmulas e resultado; cada valoração é uma linha."
  }),
  authoringContract: Object.freeze({
    intent: "Declare variáveis, colunas derivadas e linhas completas; não simule tabela-verdade com table genérica.",
    required: Object.freeze(["variables", "derivedColumns", "rows"]), optional: Object.freeze(["prompt"]),
    rules: Object.freeze(["Cada linha tem um valor por variável e por coluna derivada.", "A última coluna derivada deve corresponder ao objeto principal analisado."]),
    example: Object.freeze({ prompt: "Compare a implicação P → Q com sua forma equivalente ¬P ∨ Q e observe que elas coincidem em todas as valorações.", variables: ["P", "Q"], derivedColumns: ["P → Q", "¬P", "¬P ∨ Q", "(P → Q) ↔ (¬P ∨ Q)"], rows: [{ values: ["true", "true"], results: ["true", "false", "true", "true"] }, { values: ["true", "false"], results: ["false", "false", "false", "true"] }, { values: ["false", "true"], results: ["true", "true", "true", "true"] }, { values: ["false", "false"], results: ["true", "true", "true", "true"] }] })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["variables", "derivedColumns", "rows"], properties: {
    prompt: { type: "string", maxLength: 2000 }, variables: { type: "array", minItems: 1, maxItems: 5, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 80 } },
    derivedColumns: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 160 } },
    rows: { type: "array", minItems: 1, maxItems: 32, items: { type: "object", additionalProperties: false, required: ["values", "results"], properties: { values: { type: "array", minItems: 1, maxItems: 5, items: { type: "string", enum: VALUES } }, results: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", enum: VALUES } } } } }
  } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), variables: (data?.variables || []).map(String), derivedColumns: (data?.derivedColumns || []).map(String), rows: (data?.rows || []).map((row) => ({ values: (row?.values || []).map(String), results: (row?.results || []).map(String) })) }; },
  validate(data) { return data.rows.flatMap((row, index) => [row.values.length === data.variables.length ? "" : `Linha ${index + 1} não cobre todas as variáveis.`, row.results.length === data.derivedColumns.length ? "" : `Linha ${index + 1} não cobre todas as colunas derivadas.`]).filter(Boolean); },
  render(data) { const headers = [...data.variables, ...data.derivedColumns]; return `<div class="runtime-block package-truth-table">${data.prompt ? renderPackageProse(data.prompt) : ""}<div class="runtime-table-wrap"><div class="runtime-table-frame"><table class="runtime-table"><thead><tr>${headers.map((label, index) => `<th scope="col"${index >= data.variables.length ? ' class="is-derived"' : ""}>${renderPackageInline(label)}</th>`).join("")}</tr></thead><tbody>${data.rows.map((row) => `<tr>${[...row.values, ...row.results].map((value, index) => `<td${index >= data.variables.length ? ' class="is-derived"' : ""}>${SYMBOLS[value] || renderPackageInline(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div></div>`; },
  accessibleText(data) { return `${data.prompt || "Tabela-verdade."} ${data.rows.map((row) => [...row.values, ...row.results].map((value, index) => `${[...data.variables, ...data.derivedColumns][index]} ${SYMBOLS[value]}`).join(", ")).join("; ")}.`; },
  editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.variables.map((_, index) => ({ path: `variables[${index}]`, label: `Editar variável ${index + 1}` })), ...data.derivedColumns.map((_, index) => ({ path: `derivedColumns[${index}]`, label: `Editar fórmula ${index + 1}` }))]; },
  practiceTargets(data) { return [...data.rows.flatMap((row, rowIndex) => [...row.values.map((_, valueIndex) => ({ path: `rows[${rowIndex}].values[${valueIndex}]`, label: `Lacuna na valoração ${rowIndex + 1}.${valueIndex + 1}`, modes: ["gap", "typing"] })), ...row.results.map((_, resultIndex) => ({ path: `rows[${rowIndex}].results[${resultIndex}]`, label: `Lacuna no resultado ${rowIndex + 1}.${resultIndex + 1}`, modes: ["gap", "typing"] }))]), ...data.variables.map((_, index) => ({ path: `variables[${index}]`, label: `Lacuna na variável ${index + 1}`, modes: ["gap", "typing"] })), ...data.derivedColumns.map((_, index) => ({ path: `derivedColumns[${index}]`, label: `Lacuna na fórmula ${index + 1}`, modes: ["gap", "typing"] }))]; }
});
