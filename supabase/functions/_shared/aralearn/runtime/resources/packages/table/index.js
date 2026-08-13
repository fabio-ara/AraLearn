import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

export const tablePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.table", version: "1.0.0", label: "Tabela",
    purpose: "Comparar atributos repetidos ou consultar valores organizados por linhas e colunas.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["compare-fields", "lookup", "classify", "contrast-cases"]),
    academic: academicProfile({ domains: ["transversal", "estatística descritiva"], knowledgeObjects: ["registros homogêneos", "atributos comparáveis"], conventions: ["cabeçalhos explícitos", "unidade declarada", "uma observação por linha"], appropriateWhen: ["os mesmos atributos são comparados entre casos"], avoidWhen: ["os valores formam uma matriz algébrica", "há apenas uma lista sem comparação bidimensional"], technologies: ["tabela HTML semântica"], practiceModes: ["exposition", "gap", "typing", "selection", "classification"] }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Não introduz sozinha siglas, números ou categorias ainda não explicados.", "Evite tabelas densas em primeiro contato."]),
    accessibility: "Cabeçalhos e células usam semântica de tabela e leitura linear."
  }),
  authoringContract: Object.freeze({
    intent: "Declare uma comparação pequena, com cabeçalhos autoexplicativos e contexto anterior.",
    required: Object.freeze(["columns", "rows"]), optional: Object.freeze(["prompt", "caption", "layout"]),
    rules: Object.freeze(["Cada linha tem a mesma quantidade de células que columns.", "Explique antes toda sigla usada."]),
    example: Object.freeze({ prompt: "Compare mecanismos de controle de congestionamento depois de estudar janela de congestionamento, perda e atraso.", caption: "Sinais e respostas típicas; detalhes dependem do algoritmo e da implementação.", layout: "wide", columns: ["Mecanismo", "Sinal observado", "Resposta principal", "Efeito esperado"], rows: [["Slow start", "Início da conexão ou reinício após timeout", "Crescimento exponencial de cwnd por RTT", "Descobrir rapidamente a capacidade disponível"], ["Congestion avoidance", "cwnd alcança ssthresh", "Crescimento aproximadamente linear", "Sondar capacidade com mais cautela"], ["Fast retransmit", "ACKs duplicados", "Retransmitir antes do timeout", "Reduzir o tempo de recuperação"], ["Timeout", "Ausência de confirmação dentro do RTO", "Reduzir cwnd e reiniciar crescimento", "Responder a indício forte de perda"]] })
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
    const head = `<thead><tr>${data.columns.map((column) => `<th scope="col"><div class="runtime-table-cell-content">${renderPackageInline(column)}</div></th>`).join("")}</tr></thead>`;
    const body = `<tbody>${data.rows.map((row) => `<tr>${row.map((cell) => `<td><div class="runtime-table-cell-content">${renderPackageProse(cell)}</div></td>`).join("")}</tr>`).join("")}</tbody>`;
    const layout = ["compact", "wide"].includes(data.layout) ? ` is-layout-${data.layout}` : "";
    return `<div class="runtime-block runtime-table-block">${data.prompt ? renderPackageProse(data.prompt) : ""}<div class="runtime-table-wrap${layout}"><div class="runtime-table-frame"><table class="runtime-table">${caption}${head}${body}</table></div></div></div>`;
  },
  accessibleText(data) { return [data.prompt, ...data.columns, ...data.rows.flat()].filter(Boolean).join(". "); },
  editableTargets(data) {
    return [
      ...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []),
      ...data.columns.map((_, index) => ({ path: `columns[${index}]`, label: `Editar cabeçalho ${index + 1}` })),
      ...data.rows.flatMap((row, rowIndex) => row.map((_, columnIndex) => ({ path: `rows[${rowIndex}][${columnIndex}]`, label: `Editar célula ${rowIndex + 1}, ${columnIndex + 1}` })))
    ];
  },
  practiceTargets(data) {
    return data.rows.flatMap((row, rowIndex) => row.map((_, columnIndex) => ({
      path: `rows[${rowIndex}][${columnIndex}]`,
      label: `Lacuna na célula ${rowIndex + 1}, ${columnIndex + 1}`,
      modes: ["gap", "typing"]
    })));
  }
});
