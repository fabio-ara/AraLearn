import { academicProfile } from "../../sdk/academic.js";
import {
  escapePackageAttribute,
  renderPackageInline,
  renderPackageInlineReference,
  renderPackageProse
} from "../../sdk/html.js";

function text(value) {
  return String(value ?? "").trim();
}

function fieldsWithOffsets(data) {
  let offset = 0;
  return data.fields.map((field) => {
    const result = { ...field, start: offset, end: offset + field.widthBits - 1 };
    offset += field.widthBits;
    return result;
  });
}

function packetRows(data) {
  const rows = [];
  fieldsWithOffsets(data).forEach((field) => {
    let cursor = field.start;
    while (cursor <= field.end) {
      const rowIndex = Math.floor(cursor / data.unitBits);
      const rowStart = rowIndex * data.unitBits;
      const localStart = cursor - rowStart;
      const span = Math.min(field.end - cursor + 1, data.unitBits - localStart);
      if (!rows[rowIndex]) rows[rowIndex] = { offset: rowStart, fragments: [] };
      rows[rowIndex].fragments.push({ ...field, localStart, span, continued: cursor !== field.start });
      cursor += span;
    }
  });
  return rows.filter(Boolean);
}

function ruler(unitBits) {
  const ticks = [...new Set([0, Math.floor(unitBits / 4), Math.floor(unitBits / 2), Math.floor(unitBits * 3 / 4), unitBits - 1])];
  return `<div class="package-packet-ruler" style="--packet-unit-bits:${unitBits}">${ticks.map((tick) => `<span style="--tick-column:${tick + 1}">${tick}</span>`).join("")}</div>`;
}

export const packetLayoutPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.packet_layout",
    version: "1.0.0",
    label: "Layout de pacote",
    purpose: "Representar cabeçalhos e registros binários em palavras de largura fixa, com posição e extensão de cada campo.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["locate-field", "calculate-offset", "interpret-header", "compare-width"]),
    academic: academicProfile({
      domains: ["redes de computadores", "organização de computadores", "sistemas embarcados"],
      knowledgeObjects: ["cabeçalho de protocolo", "campo de bits", "offset", "palavra"],
      conventions: ["régua de bits", "palavras de largura fixa", "campos contíguos", "continuação automática entre linhas", "ordem de transmissão explícita"],
      appropriateWhen: ["posição, largura e fronteira dos campos alteram a interpretação"],
      avoidWhen: ["é preciso comparar registros heterogêneos", "o conteúdo não possui layout binário"],
      technologies: ["CSS Grid", "HTML semântico"],
      practiceModes: ["exposition", "gap", "typing", "selection", "ordering"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Cabeçalhos extensos mantêm tamanho natural e rolagem horizontal.", "Descrições longas ficam na legenda, não comprimidas dentro do campo."]),
    accessibility: "Cada campo é descrito por nome, intervalo de bits, largura e função."
  }),
  authoringContract: Object.freeze({
    intent: "Declare campos em ordem e largura; o renderer calcula offsets, quebra em palavras e continuação de campos.",
    required: Object.freeze(["unitBits", "fields"]),
    optional: Object.freeze(["prompt", "caption"]),
    fieldSemantics: Object.freeze({ unitBits: "Largura da palavra visual, usualmente 32 bits nos diagramas de RFC.", fields: "Sequência contígua na ordem de transmissão; widthBits é a extensão total, mesmo quando cruza linhas." }),
    visualGrammar: Object.freeze(["Régua superior = posição dentro da palavra.", "Caixa = campo contíguo.", "Mesma identidade em linhas sucessivas = continuação do campo.", "Número à esquerda = offset absoluto da linha."]),
    rules: Object.freeze(["widthBits é inteiro positivo.", "Campos seguem a ordem normativa do protocolo.", "Não declare offsets, colunas ou pixels: são derivados.", "Use descrições funcionais; não repita o rótulo."]),
    example: Object.freeze({
      prompt: "Leia o cabeçalho TCP por palavras de 32 bits e localize os campos que participam da confiabilidade e do controle de fluxo.",
      caption: "Cabeçalho TCP sem opções · RFC 9293, Figura 1",
      unitBits: 32,
      fields: [
        { id: "source", label: "Porta de origem", widthBits: 16, description: "Identifica o processo emissor." },
        { id: "destination", label: "Porta de destino", widthBits: 16, description: "Identifica o processo receptor." },
        { id: "sequence", label: "Número de sequência", widthBits: 32, description: "Ordena octetos e apoia retransmissão." },
        { id: "acknowledgment", label: "Número de confirmação", widthBits: 32, description: "Indica o próximo octeto esperado." },
        { id: "offset", label: "Data Offset", widthBits: 4, description: "Informa o tamanho do cabeçalho." },
        { id: "reserved", label: "Reservado", widthBits: 4, description: "Bits reservados pelo protocolo." },
        { id: "flags", label: "Flags", widthBits: 8, description: "Sinais de controle da conexão." },
        { id: "window", label: "Janela", widthBits: 16, description: "Anuncia a capacidade de recepção." },
        { id: "checksum", label: "Checksum", widthBits: 16, description: "Detecta corrupção do segmento." },
        { id: "urgent", label: "Ponteiro urgente", widthBits: 16, description: "Indica o fim de dados urgentes quando aplicável." }
      ]
    })
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["unitBits", "fields"], properties: {
    prompt: { type: "string" }, caption: { type: "string" }, unitBits: { type: "integer", minimum: 8, maximum: 64 },
    fields: { type: "array", minItems: 1, maxItems: 40, items: { type: "object", additionalProperties: false, required: ["id", "label", "widthBits", "description"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, widthBits: { type: "integer", minimum: 1, maximum: 512 }, description: { type: "string", minLength: 1 } } } }
  } }),
  normalize(data) {
    return { ...(data?.prompt ? { prompt: text(data.prompt) } : {}), ...(data?.caption ? { caption: text(data.caption) } : {}), unitBits: Number(data?.unitBits), fields: (data?.fields || []).map((field) => ({ id: text(field?.id), label: text(field?.label), widthBits: Number(field?.widthBits), description: text(field?.description) })) };
  },
  validate(data) {
    const errors = [];
    if (new Set(data.fields.map(({ id }) => id)).size !== data.fields.length) errors.push("Campos precisam de ids únicos.");
    if (data.fields.reduce((total, field) => total + field.widthBits, 0) % data.unitBits !== 0) errors.push("A soma das larguras precisa completar palavras inteiras; declare explicitamente campo reservado, opções ou payload quando necessário.");
    return errors;
  },
  render(data) {
    const fields = fieldsWithOffsets(data);
    const rows = packetRows(data);
    return `<div class="runtime-block package-packet-layout">${data.prompt ? renderPackageProse(data.prompt) : ""}<figure>${data.caption ? `<figcaption>${renderPackageInline(data.caption)}</figcaption>` : ""}<div class="package-packet-frame" style="--packet-min-width:${Math.max(560, data.unitBits * 18)}px">${ruler(data.unitBits)}${rows.map((row) => `<div class="package-packet-row"><span class="package-packet-row-offset">${row.offset}</span><div class="package-packet-word" style="--packet-unit-bits:${data.unitBits}">${row.fragments.map((fragment) => `<div class="package-packet-field${fragment.continued ? " is-continuation" : ""}" data-field-id="${escapePackageAttribute(fragment.id)}" style="--field-column:${fragment.localStart + 1};--field-span:${fragment.span}"><strong>${fragment.continued ? `<span aria-hidden="true">↳</span> ${renderPackageInlineReference(fragment.label)}` : renderPackageInline(fragment.label)}</strong><small>${fragment.span} bit${fragment.span === 1 ? "" : "s"}</small></div>`).join("")}</div></div>`).join("")}</div><ol class="package-packet-legend">${fields.map((field) => `<li><strong>${renderPackageInlineReference(field.label)}</strong><span>bits ${field.start}–${field.end} · ${field.widthBits} bit${field.widthBits === 1 ? "" : "s"}</span><small>${renderPackageInline(field.description)}</small></li>`).join("")}</ol></figure></div>`;
  },
  accessibleText(data) {
    return `${data.prompt || "Layout de pacote."} ${fieldsWithOffsets(data).map((field) => `${field.label}, bits ${field.start} a ${field.end}: ${field.description}`).join("; ")}.`;
  },
  editableTargets(data) {
    return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...(data.caption ? [{ path: "caption", label: "Editar legenda" }] : []), ...data.fields.flatMap((_, index) => [{ path: `fields[${index}].label`, label: `Editar campo ${index + 1}` }, { path: `fields[${index}].description`, label: `Editar descrição ${index + 1}` }])];
  },
  practiceTargets(data) {
    return data.fields.flatMap((_, index) => [{ path: `fields[${index}].label`, label: `Lacuna no campo ${index + 1}`, modes: ["gap", "typing"] }, { path: `fields[${index}].description`, label: `Lacuna na descrição ${index + 1}`, modes: ["gap", "typing"] }]);
  }
});
