import { academicProfile } from "../../sdk/academic.js";
import { renderPackageInline, renderPackageProse } from "../../sdk/html.js";

export const memoryLayoutPackage = Object.freeze({
  manifest: Object.freeze({ id: "aralearn.resource.memory_layout", version: "1.0.0", label: "Mapa de memória", purpose: "Representar intervalos de endereços, segmentos e ocupação de memória na ordem convencional.", slots: Object.freeze(["content", "feedback"]), cognitiveOperations: Object.freeze(["locate-address", "calculate-range", "inspect-allocation"]), academic: academicProfile({ domains: ["organização de computadores", "sistemas operacionais", "programação de baixo nível"], knowledgeObjects: ["endereço", "segmento de memória", "pilha", "heap"], conventions: ["endereços nas extremidades", "ordem crescente ou decrescente declarada", "intervalos contíguos", "papel do segmento nomeado"], appropriateWhen: ["posição e intervalo de memória participam do raciocínio"], avoidWhen: ["a tarefa exige somente listar variáveis", "quadros e encadeamento de chamadas são o objeto; nesse caso use call_stack"], technologies: ["HTML semântico", "CSS grid"], practiceModes: ["exposition", "gap", "typing", "selection"] }), responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]), limitations: Object.freeze(["Endereços precisam usar a mesma base.", "Layouts muito extensos devem focar somente os intervalos relevantes."]), accessibility: "Segmentos são lidos na ordem dos endereços com início, fim, rótulo e descrição." }),
  authoringContract: Object.freeze({ intent: "Declare intervalos ordenados e a direção dos endereços; não use table para simular o desenho de memória.", required: Object.freeze(["addressOrder", "segments"]), optional: Object.freeze(["prompt", "addressBase"]), rules: Object.freeze(["start e end seguem a base declarada.", "Intervalos não se sobrepõem.", "A ordem visual deriva dos endereços.", "Use call_stack quando o objeto forem quadros de ativação, e não o espaço virtual do processo."]), example: Object.freeze({ prompt: "Observe uma visão recortada do espaço virtual de um processo de 64 bits; os intervalos omitidos não estão em escala física.", addressOrder: "ascending", addressBase: "hexadecimal", segments: [{ id: "text", start: "0x00400000", end: "0x0047FFFF", label: "Código", kind: "code", description: "Instruções executáveis e somente leitura" }, { id: "rodata", start: "0x00480000", end: "0x0049FFFF", label: "Dados somente leitura", kind: "data", description: "Constantes e literais" }, { id: "data", start: "0x00600000", end: "0x0060FFFF", label: "Dados inicializados", kind: "data", description: "Variáveis globais com valor inicial" }, { id: "bss", start: "0x00610000", end: "0x0061FFFF", label: "BSS", kind: "bss", description: "Globais inicializadas com zero" }, { id: "heap", start: "0x00800000", end: "0x00FFFFFF", label: "Heap", kind: "heap", description: "Alocação dinâmica; tende a crescer para endereços maiores" }, { id: "mapped", start: "0x7F000000", end: "0x7FFEFFFF", label: "Região mapeada", kind: "mapped", description: "Bibliotecas compartilhadas e arquivos mapeados" }, { id: "stack", start: "0x7FFF0000", end: "0x7FFFFFFF", label: "Pilha", kind: "stack", description: "Chamadas e dados automáticos; tende a crescer para endereços menores" }] }) }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["addressOrder", "segments"], properties: { prompt: { type: "string" }, addressBase: { type: "string", enum: ["hexadecimal", "decimal", "symbolic"] }, addressOrder: { type: "string", enum: ["ascending", "descending"] }, segments: { type: "array", minItems: 1, maxItems: 16, items: { type: "object", additionalProperties: false, required: ["id", "start", "end", "label", "kind", "description"], properties: { id: { type: "string", minLength: 1 }, start: { type: "string", minLength: 1 }, end: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, kind: { type: "string", enum: ["code", "data", "bss", "heap", "stack", "frame", "mapped", "reserved", "custom"] }, description: { type: "string", minLength: 1 } } } } } }),
  normalize(data) { return { ...(data?.prompt ? { prompt: String(data.prompt).trim() } : {}), ...(data?.addressBase ? { addressBase: String(data.addressBase) } : {}), addressOrder: String(data?.addressOrder || "ascending"), segments: (data?.segments || []).map((segment) => ({ id: String(segment?.id || "").trim(), start: String(segment?.start || "").trim(), end: String(segment?.end || "").trim(), label: String(segment?.label || "").trim(), kind: String(segment?.kind || "custom"), description: String(segment?.description || "").trim() })) }; },
  validate(data) {
    const errors = [];
    if (new Set(data.segments.map(({ id }) => id)).size !== data.segments.length) {
      errors.push("Segmentos precisam de ids únicos.");
    }
    if (data.addressBase === "symbolic") return errors;
    const radix = data.addressBase === "decimal" ? 10 : 16;
    const parseAddress = (value) => {
      const source = String(value).trim();
      const normalized = radix === 16 ? source.replace(/^0x/iu, "") : source;
      if (!normalized || !(radix === 16 ? /^[0-9a-f]+$/iu : /^\d+$/u).test(normalized)) return null;
      return Number.parseInt(normalized, radix);
    };
    const ranges = data.segments.map((segment) => ({
      id: segment.id,
      start: parseAddress(segment.start),
      end: parseAddress(segment.end)
    }));
    if (ranges.some(({ start, end }) => start === null || end === null)) {
      errors.push("Endereços não correspondem à base declarada.");
      return errors;
    }
    if (ranges.some(({ start, end }) => start > end)) {
      errors.push("O início de cada segmento precisa ser menor ou igual ao fim.");
    }
    const sorted = [...ranges].sort((left, right) => left.start - right.start);
    if (sorted.some((range, index) => index > 0 && range.start <= sorted[index - 1].end)) {
      errors.push("Intervalos de memória não podem se sobrepor.");
    }
    return errors;
  },
  render(data) { const segments = data.addressOrder === "descending" ? [...data.segments].reverse() : data.segments; return `<div class="runtime-block package-memory-layout">${data.prompt ? renderPackageProse(data.prompt) : ""}<ol class="package-memory-stack" data-address-order="${data.addressOrder}">${segments.map((segment) => `<li><code>${renderPackageInline(segment.start)}</code><div class="is-${segment.kind}"><strong>${renderPackageInline(segment.label)}</strong><span>${renderPackageInline(segment.description)}</span><small>${renderPackageInline(segment.kind)}</small></div><code>${renderPackageInline(segment.end)}</code></li>`).join("")}</ol><p class="package-memory-direction">endereços ${data.addressOrder === "ascending" ? "crescentes ↓" : "decrescentes ↓"}</p></div>`; },
  accessibleText(data) { const segments = data.addressOrder === "descending" ? [...data.segments].reverse() : data.segments; return `${data.prompt || "Mapa de memória."} Endereços ${data.addressOrder === "ascending" ? "crescentes" : "decrescentes"}. ${segments.map((segment) => `${segment.label}, de ${segment.start} a ${segment.end}: ${segment.description}`).join("; ")}.`; },
  editableTargets(data) { return [...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []), ...data.segments.flatMap((_, index) => [{ path: `segments[${index}].start`, label: `Editar início ${index + 1}` }, { path: `segments[${index}].end`, label: `Editar fim ${index + 1}` }, { path: `segments[${index}].label`, label: `Editar segmento ${index + 1}` }, { path: `segments[${index}].description`, label: `Editar descrição ${index + 1}` }])]; },
  practiceTargets(data) { return data.segments.flatMap((_, index) => [{ path: `segments[${index}].label`, label: `Lacuna no segmento ${index + 1}`, modes: ["gap", "typing"] }, { path: `segments[${index}].description`, label: `Lacuna na descrição ${index + 1}`, modes: ["gap", "typing"] }]); }
});
