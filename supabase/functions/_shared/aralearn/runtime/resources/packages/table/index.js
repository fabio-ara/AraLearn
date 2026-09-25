import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

export const tablePackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.table", version: "1.0.0", label: "Tabela",
    purpose: "Comparar atributos repetidos ou consultar valores organizados por linhas e colunas.",
    slots: Object.freeze(["content", "feedback"]),
    taskOperations: Object.freeze(["compare-fields", "lookup", "classify", "contrast-cases"]),
    academic: academicProfile({ domains: ["transversal", "estatística descritiva"], knowledgeObjects: ["registros homogêneos", "atributos comparáveis"], conventions: ["cabeçalhos explícitos", "unidade declarada", "uma observação por linha"], appropriateWhen: ["os mesmos atributos são comparados entre casos"], avoidWhen: ["os valores formam uma matriz algébrica", "há apenas uma lista sem comparação bidimensional"], technologies: ["tabela HTML semântica"], practiceModes: ["exposition", "gap", "typing", "selection", "classification", "ordering"] }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice", "aralearn.response.ordering"]),
    limitations: Object.freeze(["Não introduz sozinha siglas, números ou categorias ainda não explicados.", "Evite tabelas densas em primeiro contato."]),
    accessibility: "Cabeçalhos e células usam semântica de tabela e leitura linear."
  }),
  authoringContract: Object.freeze({
    intent: "Declare os atributos e casos que precisam ser comparados, com cabeçalhos autoexplicativos.",
    required: Object.freeze(["columns", "rows"]), optional: Object.freeze(["title", "legend", "note"]),
    rules: Object.freeze(["Cada linha tem a mesma quantidade de células que columns.", "title identifica a comparação; legend decodifica símbolos ou abreviações; note registra uma ressalva breve.", "Explique conceitos e operações em conteúdo anterior; as fontes usam o mecanismo comum de referências.", "O AraLearn calcula a largura e oferece rolagem sem reduzir a legibilidade."]),
    example: Object.freeze({ title: "Respostas ao congestionamento", legend: "cwnd: janela de congestionamento; RTT: tempo de ida e volta; RTO: prazo de retransmissão.", note: "Detalhes dependem do algoritmo e da implementação.", columns: ["Mecanismo", "Sinal observado", "Resposta principal", "Efeito esperado"], rows: [["Slow start", "Início da conexão ou reinício após timeout", "Crescimento exponencial de cwnd por RTT", "Descobrir rapidamente a capacidade disponível"], ["Congestion avoidance", "cwnd alcança ssthresh", "Crescimento aproximadamente linear", "Sondar capacidade com mais cautela"], ["Fast retransmit", "ACKs duplicados", "Retransmitir antes do timeout", "Reduzir o tempo de recuperação"], ["Timeout", "Ausência de confirmação dentro do RTO", "Reduzir cwnd e reiniciar crescimento", "Responder a indício forte de perda"]] })
  }),
  schema: Object.freeze({
    type: "object", additionalProperties: false, required: ["columns", "rows"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 300 },
      legend: { type: "string", minLength: 1, maxLength: 2000 },
      note: { type: "string", minLength: 1, maxLength: 500 },
      columns: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 1, maxLength: 300 } },
      rows: { type: "array", minItems: 1, maxItems: 30, items: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", maxLength: 2000 } } }
    }
  }),
  normalize(data) {
    return {
      ...Object.fromEntries(["title", "legend", "note"].filter(key => data?.[key] !== undefined)
        .map(key => [key, String(data[key]).trim()])),
      columns: (data?.columns || []).map((value) => String(value).trim()),
      rows: (data?.rows || []).map((row) => (row || []).map((value) => String(value)))
    };
  },
  validate(data) {
    return data.rows.some((row) => row.length !== data.columns.length)
      ? ["Toda linha precisa ter a mesma quantidade de células que columns."] : [];
  },
  render(data) {
    const caption = data.title ? `<caption>${renderPackageInline(data.title)}</caption>` : "";
    const head = `<thead><tr>${data.columns.map((column) => `<th scope="col"><div class="runtime-table-cell-content">${renderPackageInline(column)}</div></th>`).join("")}</tr></thead>`;
    const body = `<tbody>${data.rows.map((row) => `<tr>${row.map((cell) => `<td><div class="runtime-table-cell-content">${renderPackageProse(cell)}</div></td>`).join("")}</tr>`).join("")}</tbody>`;
    return `<div class="runtime-block runtime-table-block"><div class="runtime-table-wrap"><div class="runtime-table-frame"><table class="runtime-table">${caption}${head}${body}</table></div></div>${data.legend ? `<div class="runtime-table-legend">${renderPackageProse(data.legend)}</div>` : ""}${data.note ? `<div class="runtime-table-note">${renderPackageProse(data.note)}</div>` : ""}</div>`;
  },
  accessibleText(data) { return [data.title, ...data.columns, ...data.rows.flat(), data.legend, data.note].filter(Boolean).join(". "); },
  editableTargets(data) {
    return [
      ...[ ["title", "título"], ["legend", "legenda"], ["note", "ressalva"] ]
        .filter(([key]) => data[key]).map(([path, label]) => ({ path, label: `Editar ${label}` })),
      ...data.columns.map((_, index) => ({ path: `columns[${index}]`, label: `Editar cabeçalho ${index + 1}` })),
      ...data.rows.flatMap((row, rowIndex) => row.map((_, columnIndex) => ({ path: `rows[${rowIndex}][${columnIndex}]`, label: `Editar célula ${rowIndex + 1}, ${columnIndex + 1}` })))
    ];
  },
  practiceTargets(data) {
    return data.rows.flatMap((row, rowIndex) => row.map((_, columnIndex) => ({
      path: `rows[${rowIndex}][${columnIndex}]`,
      label: `Lacuna na célula ${rowIndex + 1}, ${columnIndex + 1}`,
      modes: ["gap", "typing", "ordering"]
    })));
  }
});
